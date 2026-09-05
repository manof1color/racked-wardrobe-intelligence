import type { BrandProductRegistration, GarmentView, UploadDescriptor } from "./platform-types.ts";
import { normalizeCommerceUrl } from "./commerce.ts";

const views: GarmentView[] = ["front", "back", "label"];

export const seedBrandProducts: BrandProductRegistration[] = [{
  id:"registry-na-ow-1042",
  ownerSubject:"brand@demo.racked.local",
  name:"Sienna Soft Overshirt",
  brand:"Northstar Atelier",
  brandSlug:"northstar-atelier",
  aliases:["Northstar", "Northstar Atelier"],
  sku:"NA-OW-1042",
  gtin:null,
  category:"outerwear",
  labelText:"NORTHSTAR ATELIER NA-OW-1042 100% COTTON",
  views:{
    front:{view:"front",fileName:"northstar-overshirt-front.png",contentType:"image/png",size:1},
    back:{view:"back",fileName:"northstar-overshirt-back.png",contentType:"image/png",size:1},
    label:{view:"label",fileName:"northstar-overshirt-label.png",contentType:"image/png",size:1},
  },
  enrolledAt:"2026-08-01T12:00:00.000Z",
  source:"seed",
}];

export function slugifyBrand(value:string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80);
}

export function normalizeIdentity(value:string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
}

// Judge note: this allowlist suggests a familiar brand name from visible label text.
// It never creates a verified product link; only a brand-enrolled SKU/GTIN can do that.
const majorBrandAliases = [
  {brand:"Adidas",aliases:["adidas"]},{brand:"Calvin Klein",aliases:["calvin klein","ck jeans"]},
  {brand:"Converse",aliases:["converse"]},{brand:"Fila",aliases:["fila"]},{brand:"Gucci",aliases:["gucci"]},
  {brand:"Jordan",aliases:["air jordan","jordan"]},
  {brand:"Levi's",aliases:["levi's","levis","levi strauss"]},{brand:"Lululemon",aliases:["lululemon"]},
  {brand:"New Balance",aliases:["new balance"]},{brand:"Nike",aliases:["nike"]},{brand:"Patagonia",aliases:["patagonia"]},
  {brand:"Prada",aliases:["prada"]},{brand:"Puma",aliases:["puma"]},{brand:"Ralph Lauren",aliases:["ralph lauren","polo ralph lauren"]},
  {brand:"Reebok",aliases:["reebok"]},{brand:"Tommy Hilfiger",aliases:["tommy hilfiger"]},
  {brand:"Under Armour",aliases:["under armour"]},{brand:"Uniqlo",aliases:["uniqlo"]},{brand:"Vans",aliases:["vans"]},
  {brand:"Zara",aliases:["zara"]},
] as const;

export function suggestMajorBrand(labelText:string) {
  const normalized=normalizeIdentity(labelText);
  if(!normalized)return null;
  const found=majorBrandAliases.find(entry=>entry.aliases.some(alias=>normalized.includes(normalizeIdentity(alias))));
  return found?{brand:found.brand,brandSlug:slugifyBrand(found.brand)}:null;
}

export function createBrandProductRegistration(input:{
  ownerSubject:string; name:string; brand:string; aliases:string[]; sku:string; gtin?:string; category:string; labelText:string;
  productUrl?:string; affiliateUrl?:string; price?:string|number; currency?:string; availability?:string; affiliateProvider?:string; affiliateTrackingId?:string;
  parts:UploadDescriptor[];
}): BrandProductRegistration {
  const name=input.name.trim().slice(0,120);
  const brand=input.brand.trim().slice(0,100);
  const sku=input.sku.trim().toUpperCase().slice(0,64);
  const gtin=(input.gtin ?? "").replace(/\D/g,"").slice(0,14) || null;
  const category=input.category.trim().toLowerCase().slice(0,60);
  const labelText=input.labelText.trim().slice(0,1000);
  const productUrl=normalizeCommerceUrl(input.productUrl);
  const affiliateUrl=normalizeCommerceUrl(input.affiliateUrl);
  const price=input.price===""||input.price===undefined?undefined:Number(input.price);
  if(price!==undefined&&(!Number.isFinite(price)||price<0||price>1_000_000))throw new Error("Price must be between 0 and 1,000,000.");
  const currency=(input.currency??"USD").trim().toUpperCase().slice(0,3);
  if(price!==undefined&&!/^[A-Z]{3}$/.test(currency))throw new Error("Currency must use a three-letter code.");
  const availability=["available","unavailable","discontinued","unknown"].includes(input.availability??"")?input.availability as BrandProductRegistration["availability"]:"unknown";
  if (!name || !brand || !sku || !category || !labelText) throw new Error("Name, brand, SKU, category, and label text are required.");
  if (gtin && ![8,12,13,14].includes(gtin.length)) throw new Error("GTIN must contain 8, 12, 13, or 14 digits.");
  const byView=Object.fromEntries(views.map((view)=>[view,input.parts.find((part)=>part.view===view)])) as Record<GarmentView,UploadDescriptor|undefined>;
  if (views.some((view)=>!byView[view])) throw new Error("Front, back, and label images are required.");
  const aliases=[...new Set([brand,...input.aliases.map((item)=>item.trim()).filter(Boolean)])].slice(0,10);
  return {
    id:`registry-${crypto.randomUUID()}`,ownerSubject:input.ownerSubject,name,brand,brandSlug:slugifyBrand(brand),aliases,sku,gtin,category,labelText,
    views:byView as Record<GarmentView,UploadDescriptor>,enrolledAt:new Date().toISOString(),source:"brand-enrolled",
    ...(productUrl?{productUrl}:{}),...(affiliateUrl?{affiliateUrl}:{}),...(price!==undefined?{price,currency}:{}),availability,
    ...(input.affiliateProvider?.trim()?{affiliateProvider:input.affiliateProvider.trim().slice(0,80)}:{}),
    ...(input.affiliateTrackingId?.trim()?{affiliateTrackingId:input.affiliateTrackingId.trim().slice(0,120)}:{}),
  };
}

export type RegistryMatch = { product:BrandProductRegistration; method:"brand-sku" | "gtin" | "label-image-hash" | "catalog-image-set" };

export function matchBrandProduct(parts:UploadDescriptor[], labelText:string, registry:BrandProductRegistration[]):RegistryMatch|null {
  const label=parts.find((part)=>part.view==="label");
  const normalizedText=normalizeIdentity(labelText);
  for (const product of registry) {
    // Every registered view is read defensively. A registry record missing a view used to
    // throw here, which would have taken down analysis for everyone over one malformed
    // product. More importantly, each comparison must require both sides to be present:
    // comparing two absent values is equal, and an `every` over absent evidence would
    // otherwise report a catalog match and grant verified identity for nothing at all.
    const registeredLabel=product.views?.label;
    if (label?.sha256 && registeredLabel?.sha256 && label.sha256===registeredLabel.sha256) return {product,method:"label-image-hash"};
    const hashSetMatches=views.every((view)=>{
      const candidate=parts.find((part)=>part.view===view)?.sha256;
      const registered=product.views?.[view]?.sha256;
      return Boolean(candidate && registered && candidate===registered);
    });
    if (hashSetMatches) return {product,method:"catalog-image-set"};
    const fileSetMatches=views.every((view)=>{
      const candidate=parts.find((part)=>part.view===view)?.fileName;
      const registered=product.views?.[view]?.fileName;
      return Boolean(candidate && registered && candidate.toLowerCase()===registered.toLowerCase());
    });
    if (fileSetMatches) return {product,method:"catalog-image-set"};
    if (product.gtin && normalizedText.includes(normalizeIdentity(product.gtin))) return {product,method:"gtin"};
    const skuMatch=normalizedText.includes(normalizeIdentity(product.sku));
    const brandMatch=product.aliases.some((alias)=>normalizeIdentity(alias).length>=5 && normalizedText.includes(normalizeIdentity(alias)));
    if (skuMatch && brandMatch) return {product,method:"brand-sku"};
  }
  return null;
}
