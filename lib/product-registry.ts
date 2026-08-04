import type { BrandProductRegistration, GarmentView, UploadDescriptor } from "./platform-types.ts";

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

export function createBrandProductRegistration(input:{
  ownerSubject:string; name:string; brand:string; aliases:string[]; sku:string; gtin?:string; category:string; labelText:string;
  parts:UploadDescriptor[];
}): BrandProductRegistration {
  const name=input.name.trim().slice(0,120);
  const brand=input.brand.trim().slice(0,100);
  const sku=input.sku.trim().toUpperCase().slice(0,64);
  const gtin=(input.gtin ?? "").replace(/\D/g,"").slice(0,14) || null;
  const category=input.category.trim().toLowerCase().slice(0,60);
  const labelText=input.labelText.trim().slice(0,1000);
  if (!name || !brand || !sku || !category || !labelText) throw new Error("Name, brand, SKU, category, and label text are required.");
  if (gtin && ![8,12,13,14].includes(gtin.length)) throw new Error("GTIN must contain 8, 12, 13, or 14 digits.");
  const byView=Object.fromEntries(views.map((view)=>[view,input.parts.find((part)=>part.view===view)])) as Record<GarmentView,UploadDescriptor|undefined>;
  if (views.some((view)=>!byView[view])) throw new Error("Front, back, and label images are required.");
  const aliases=[...new Set([brand,...input.aliases.map((item)=>item.trim()).filter(Boolean)])].slice(0,10);
  return {
    id:`registry-${crypto.randomUUID()}`,ownerSubject:input.ownerSubject,name,brand,brandSlug:slugifyBrand(brand),aliases,sku,gtin,category,labelText,
    views:byView as Record<GarmentView,UploadDescriptor>,enrolledAt:new Date().toISOString(),source:"brand-enrolled",
  };
}

export type RegistryMatch = { product:BrandProductRegistration; method:"brand-sku" | "gtin" | "label-image-hash" | "catalog-image-set" };

export function matchBrandProduct(parts:UploadDescriptor[], labelText:string, registry:BrandProductRegistration[]):RegistryMatch|null {
  const label=parts.find((part)=>part.view==="label");
  const normalizedText=normalizeIdentity(labelText);
  for (const product of registry) {
    const registeredLabel=product.views.label;
    if (label?.sha256 && registeredLabel.sha256 && label.sha256===registeredLabel.sha256) return {product,method:"label-image-hash"};
    const hashSetMatches=views.every((view)=>{
      const candidate=parts.find((part)=>part.view===view);
      const registered=product.views[view];
      return Boolean(candidate?.sha256 && registered.sha256 && candidate.sha256===registered.sha256);
    });
    if (hashSetMatches) return {product,method:"catalog-image-set"};
    const fileSetMatches=views.every((view)=>parts.find((part)=>part.view===view)?.fileName.toLowerCase()===product.views[view].fileName.toLowerCase());
    if (fileSetMatches) return {product,method:"catalog-image-set"};
    if (product.gtin && normalizedText.includes(normalizeIdentity(product.gtin))) return {product,method:"gtin"};
    const skuMatch=normalizedText.includes(normalizeIdentity(product.sku));
    const brandMatch=product.aliases.some((alias)=>normalizeIdentity(alias).length>=5 && normalizedText.includes(normalizeIdentity(alias)));
    if (skuMatch && brandMatch) return {product,method:"brand-sku"};
  }
  return null;
}
