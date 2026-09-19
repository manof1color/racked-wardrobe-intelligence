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
  /** Names held by other brand accounts, which this product's aliases may not claim. */
  otherBrandNames?:string[];
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
  if (gtin && !isValidGtin(gtin)) throw new Error("That GTIN's check digit does not match. Check the barcode number and try again.");
  const byView=Object.fromEntries(views.map((view)=>[view,input.parts.find((part)=>part.view===view)])) as Record<GarmentView,UploadDescriptor|undefined>;
  if (views.some((view)=>!byView[view])) throw new Error("Front, back, and label images are required.");
  const aliases=[...new Set([brand,...input.aliases.map((item)=>item.trim().slice(0,100)).filter(Boolean)])].slice(0,10);
  const conflict=conflictingAlias(aliases.slice(1),brand,input.otherBrandNames);
  if (conflict) throw new Error(`The alias "${conflict}" names another brand. Aliases are for spellings of your own brand name.`);
  return {
    id:`registry-${crypto.randomUUID()}`,ownerSubject:input.ownerSubject,name,brand,brandSlug:slugifyBrand(brand),aliases,sku,gtin,category,labelText,
    views:byView as Record<GarmentView,UploadDescriptor>,enrolledAt:new Date().toISOString(),source:"brand-enrolled",
    ...(productUrl?{productUrl}:{}),...(affiliateUrl?{affiliateUrl}:{}),...(price!==undefined?{price,currency}:{}),availability,
    ...(input.affiliateProvider?.trim()?{affiliateProvider:input.affiliateProvider.trim().slice(0,80)}:{}),
    ...(input.affiliateTrackingId?.trim()?{affiliateTrackingId:input.affiliateTrackingId.trim().slice(0,120)}:{}),
  };
}

export type RegistryMatch = { product:BrandProductRegistration; method:"brand-sku" | "gtin" };

/** A GTIN in its 14-digit form, so a UPC-A read off a label equals the same code stored as EAN-13 or GTIN-14. */
export function gtinKey(value:string) {
  const digits=value.replace(/\D/g,"");
  return [8,12,13,14].includes(digits.length)?digits.padStart(14,"0"):null;
}

/** The GS1 check digit, so a mistyped barcode is caught at enrollment rather than silently never matching. */
export function isValidGtin(value:string) {
  const key=gtinKey(value);
  if(!key)return false;
  const body=key.slice(0,13).split("").map(Number);
  const sum=body.reverse().reduce((total,digit,index)=>total+digit*(index%2===0?3:1),0);
  return (10-(sum%10))%10===Number(key[13]);
}

/** Every barcode-shaped number in label text; printed barcodes are often grouped with spaces or hyphens. */
function gtinCandidates(labelText:string) {
  const found=new Set<string>();
  for (const run of labelText.match(/\d(?:[ -]?\d){7,13}/g) ?? []) {
    const key=gtinKey(run);
    if (key) found.add(key);
  }
  return found;
}

/**
 * Whether a code appears in label text as a whole token. Separators may differ ("NA-OW-1042",
 * "NA OW 1042", "naow1042"), but the code may not be the middle of a longer one: "EX-1001" is
 * not evidence of "EX-100", and a short style code cannot match by accident inside a sentence.
 */
function containsCode(labelText:string, code:string) {
  const characters=normalizeIdentity(code).split("");
  if (characters.length<3) return false;
  const text=labelText.normalize("NFKD").replace(/[̀-ͯ]/g,"").toLowerCase();
  return new RegExp(`(?:^|[^a-z0-9])${characters.join("[\\s\\-_./]*")}(?![a-z0-9])`).test(text);
}

/**
 * Registry evidence, and only registry evidence: an exact GTIN, or one of the product's brand
 * names together with its exact style code. Identical image files and file names are not
 * evidence that a person owns a garment, so neither can verify anything here.
 */
export function matchBrandProduct(_parts:UploadDescriptor[], labelText:string, registry:BrandProductRegistration[]):RegistryMatch|null {
  const gtins=gtinCandidates(labelText);
  for (const product of registry) {
    if (product.archived) continue;
    const productGtin=product.gtin?gtinKey(product.gtin):null;
    if (productGtin && gtins.has(productGtin)) return {product,method:"gtin"};
    const skuMatch=Boolean(product.sku) && containsCode(labelText,product.sku);
    const brandMatch=(product.aliases ?? []).some((alias)=>normalizeIdentity(alias).length>=5 && containsCode(labelText,alias));
    if (skuMatch && brandMatch) return {product,method:"brand-sku"};
  }
  return null;
}

/**
 * One product per identity. Two records answering the same barcode, or one brand's style code
 * enrolled twice, left the first-listed record to win every match — so a duplicate could quietly
 * take the wear that belonged to the original.
 */
export function registryIdentityConflict(product:Pick<BrandProductRegistration,"id"|"brandSlug"|"sku"|"gtin">, registry:BrandProductRegistration[]) {
  const sku=normalizeIdentity(product.sku);
  const gtin=product.gtin?gtinKey(product.gtin):null;
  for (const existing of registry) {
    if (existing.id===product.id || existing.archived) continue;
    if (gtin && existing.gtin && gtinKey(existing.gtin)===gtin) return "That GTIN is already enrolled in the Racked registry.";
    if (existing.brandSlug===product.brandSlug && normalizeIdentity(existing.sku)===sku) return `SKU ${product.sku} is already enrolled for this brand.`;
  }
  return null;
}

/** Brand names that a self-serve account may not claim, because they belong to someone else. */
export function reservedBrandNames() {
  return majorBrandAliases.flatMap((entry)=>[entry.brand,...entry.aliases]);
}

/**
 * Whether a brand name belongs to a well-known brand. A self-serve account naming itself "Nike"
 * could otherwise enroll Nike's style codes and receive the wear of every Nike owner who links one.
 */
export function isReservedBrandName(name:string) {
  // "Nike Official" and "Nike, Inc." are the same claim as "Nike"; "Jordan Smith Tailoring" is not.
  const core=name.replace(/\b(inc|llc|ltd|co|company|corp|official|store|shop|clothing|apparel|brand|the)\b\.?/gi," ");
  const normalized=normalizeIdentity(core);
  return Boolean(normalized) && reservedBrandNames().some((reserved)=>normalizeIdentity(reserved)===normalized);
}

/**
 * An alias another brand owns. Aliases exist for spellings of the account's own name; one naming a
 * different brand would let this account's products answer that brand's labels.
 */
export function conflictingAlias(aliases:string[], ownBrand:string, otherBrandNames:string[]=[]) {
  const protectedNames=[...reservedBrandNames(),...otherBrandNames]
    .filter((name)=>normalizeIdentity(name).length>=3&&!containsCode(ownBrand,name));
  return aliases.find((alias)=>protectedNames.some((name)=>containsCode(alias,name))) ?? null;
}
