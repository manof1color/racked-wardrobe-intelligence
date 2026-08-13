import type { PublicOutfitGarment } from "./platform-types.ts";
import type { WardrobeItem } from "./types.ts";

export type RecreateMatchState="EXACT_OWNED"|"STRONG_SUBSTITUTE"|"ACCEPTABLE_SUBSTITUTE"|"WEAK_SUBSTITUTE"|"MISSING";

export interface RecreateComponent {
  key:"category"|"subtype"|"color"|"pattern"|"style"|"material"|"registry";
  label:string;
  score:number;
  weight:number;
  evidence:string;
}

export interface RecreatePieceResult {
  target:{publicGarmentId:string;name:string;category:string;subtype?:string;color?:string;resolutionState:PublicOutfitGarment["resolutionState"]};
  state:RecreateMatchState;
  score:number;
  ownedItem:null|{id:string;name:string;category:string;subtype?:string;color:string;imageUrl?:string};
  components:RecreateComponent[];
  reasons:string[];
}

export interface RecreateLookResult {
  publicOutfitId:string;
  coveragePercentage:number;
  coveredPieces:number;
  totalPieces:number;
  methodology:string;
  pieces:RecreatePieceResult[];
}

const WEIGHTS={category:.30,subtype:.25,color:.20,pattern:.10,style:.10,material:.05} as const;
const neutralColors=new Set(["black","white","gray","grey","cream","beige","navy","brown","camel"]);
const clean=(value?:string)=>String(value??"").trim().toLowerCase().replace(/[_\s]+/g,"-");
const display=(value?:string)=>value?.trim()||"unknown";

function exactOrUnknown(target:string|undefined,owned:string|undefined,unknownScore=50){
  const a=clean(target),b=clean(owned);
  if(!a||a==="unknown"||!b||b==="unknown")return unknownScore;
  return a===b?100:0;
}

function colorScore(target?:string,owned?:string){
  const a=clean(target),b=clean(owned);
  if(!a||a==="unknown"||!b||b==="unknown")return 50;
  if(a===b||(a==="gray"&&b==="grey")||(a==="grey"&&b==="gray"))return 100;
  return neutralColors.has(a)&&neutralColors.has(b)?70:0;
}

function styleScore(target:string[]|undefined,owned:string[]){
  const a=new Set((target??[]).map(clean).filter(Boolean)),b=new Set(owned.map(clean).filter(Boolean));
  if(!a.size)return 50;
  const intersection=[...a].filter(value=>b.has(value)).length;
  const union=new Set([...a,...b]).size;
  return Math.round((intersection/Math.max(union,1))*100);
}

function componentsFor(target:PublicOutfitGarment,owned:WardrobeItem):RecreateComponent[]{
  const values={
    category:clean(target.category)===clean(owned.category)?100:0,
    subtype:exactOrUnknown(target.subtype,owned.subtype,45),
    color:colorScore(target.color,owned.color),
    pattern:exactOrUnknown(target.pattern,owned.pattern),
    style:styleScore(target.style,owned.style),
    material:exactOrUnknown(target.material,owned.material),
  };
  return [
    {key:"category",label:"Broad category",score:values.category,weight:WEIGHTS.category,evidence:`${display(target.category)} vs ${display(owned.category)}`},
    {key:"subtype",label:"Garment subtype",score:values.subtype,weight:WEIGHTS.subtype,evidence:`${display(target.subtype)} vs ${display(owned.subtype)}`},
    {key:"color",label:"Color",score:values.color,weight:WEIGHTS.color,evidence:`${display(target.color)} vs ${display(owned.color)}`},
    {key:"pattern",label:"Pattern",score:values.pattern,weight:WEIGHTS.pattern,evidence:`${display(target.pattern)} vs ${display(owned.pattern)}`},
    {key:"style",label:"Style",score:values.style,weight:WEIGHTS.style,evidence:`${(target.style??[]).join(", ")||"unknown"} vs ${owned.style.join(", ")||"unknown"}`},
    {key:"material",label:"Material",score:values.material,weight:WEIGHTS.material,evidence:`${display(target.material)} vs ${display(owned.material)}`},
  ];
}

function weightedScore(components:RecreateComponent[]){return Math.round(components.reduce((sum,component)=>sum+(component.score*component.weight),0));}

function targetSummary(target:PublicOutfitGarment):RecreatePieceResult["target"]{
  return {publicGarmentId:target.publicGarmentId,name:target.name,category:target.category,...(target.subtype?{subtype:target.subtype}:{}),...(target.color?{color:target.color}:{}),resolutionState:target.resolutionState};
}

function ownedSummary(item:WardrobeItem):NonNullable<RecreatePieceResult["ownedItem"]>{
  return {id:item.id,name:item.name,category:item.category,...(item.subtype?{subtype:item.subtype}:{}),color:item.color,...(item.imageUrl?{imageUrl:item.imageUrl}:{})};
}

function matchOne(target:PublicOutfitGarment,candidates:WardrobeItem[]):RecreatePieceResult{
  const exactId=target.verifiedProduct?.registryProductId;
  const exact=exactId?[...candidates].filter(item=>item.identityStatus==="verified"&&item.registryProductId===exactId).sort((a,b)=>a.id.localeCompare(b.id))[0]:undefined;
  if(exact){
    return {target:targetSummary(target),state:"EXACT_OWNED",score:100,ownedItem:ownedSummary(exact),components:[{key:"registry",label:"Authorized product registry",score:100,weight:1,evidence:`Both records reference registry product ${exactId}.`}],reasons:["You own the same registry-verified product."]};
  }
  const sameCategory=candidates.filter(item=>clean(item.category)===clean(target.category));
  if(!sameCategory.length)return {target:targetSummary(target),state:"MISSING",score:0,ownedItem:null,components:[],reasons:[`No owned ${target.category} is available; cross-category items are never treated as substitutes.`]};
  const ranked=sameCategory.map(item=>{const components=componentsFor(target,item);return {item,components,score:weightedScore(components)};}).sort((a,b)=>b.score-a.score||a.item.id.localeCompare(b.item.id));
  const best=ranked[0];
  const state:RecreateMatchState=best.score>=78?"STRONG_SUBSTITUTE":best.score>=58?"ACCEPTABLE_SUBSTITUTE":"WEAK_SUBSTITUTE";
  const strongest=[...best.components].sort((a,b)=>(b.score*b.weight)-(a.score*a.weight)).slice(0,2);
  return {target:targetSummary(target),state,score:best.score,ownedItem:ownedSummary(best.item),components:best.components,reasons:strongest.map(component=>`${component.label}: ${component.evidence} (${component.score}/100).`)};
}

const coverageCredit:Record<RecreateMatchState,number>={EXACT_OWNED:1,STRONG_SUBSTITUTE:.85,ACCEPTABLE_SUBSTITUTE:.60,WEAK_SUBSTITUTE:.25,MISSING:0};

export function recreateLook(publicOutfitId:string,targets:PublicOutfitGarment[],wardrobe:WardrobeItem[]):RecreateLookResult{
  const available=[...wardrobe];
  const pieces=targets.map(target=>{
    const result=matchOne(target,available);
    if(result.ownedItem){const index=available.findIndex(item=>item.id===result.ownedItem!.id);if(index>=0)available.splice(index,1);}
    return result;
  });
  const coveragePercentage=targets.length?Math.round((pieces.reduce((sum,piece)=>sum+coverageCredit[piece.state],0)/targets.length)*100):0;
  return {publicOutfitId,coveragePercentage,coveredPieces:pieces.filter(piece=>piece.state!=="MISSING").length,totalPieces:targets.length,methodology:"Exact matches require the same authorized registry product ID. Otherwise Racked compares only same-category owned items using category 30%, subtype 25%, color 20%, pattern 10%, style 10%, and material 5%; one owned item can cover only one target piece.",pieces};
}
