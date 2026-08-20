import type { WardrobeItem } from "./types.ts";

export const OUTFIT_BOARD_WIDTH=1200,OUTFIT_BOARD_HEIGHT=1400;
export interface OutfitBoardPlacement {id:string;x:number;y:number;width:number;height:number;category:string;}

const regions:Record<string,{x:number;y:number;width:number;height:number}>={
  outerwear:{x:40,y:40,width:500,height:500},top:{x:560,y:40,width:500,height:500},dress:{x:350,y:50,width:500,height:900},bottom:{x:350,y:540,width:500,height:560},shoe:{x:80,y:1120,width:1040,height:230},bag:{x:40,y:570,width:260,height:480},jewelry:{x:900,y:570,width:260,height:480},accessory:{x:900,y:570,width:260,height:480},other:{x:40,y:570,width:260,height:480},
};
function regionKey(category:string){const value=category.toLowerCase();return Object.keys(regions).find(key=>key!=="other"&&value.includes(key))??"other";}

export function outfitBoardLayout(items:Array<Pick<WardrobeItem,"id"|"category">>):OutfitBoardPlacement[]{
  const grouped=new Map<string,Array<Pick<WardrobeItem,"id"|"category">>>();for(const item of items){const key=regionKey(item.category);grouped.set(key,[...(grouped.get(key)??[]),item]);}
  return [...grouped].flatMap(([key,group])=>{const region=regions[key],columns=Math.min(group.length,3),rows=Math.ceil(group.length/columns),gap=12,width=Math.floor((region.width-gap*(columns-1))/columns),height=Math.floor((region.height-gap*(rows-1))/rows);return group.map((item,index)=>({id:item.id,category:item.category,x:region.x+(index%columns)*(width+gap),y:region.y+Math.floor(index/columns)*(height+gap),width,height}));});
}
