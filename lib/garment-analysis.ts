import { matchBrandProduct, seedBrandProducts } from "./product-registry.ts";
import type { BrandProductRegistration, GarmentAnalysis, GarmentView, UploadDescriptor } from "./platform-types.ts";

const allowedTypes = new Set(["image/jpeg","image/png","image/webp"]);
const requiredViews: GarmentView[] = ["front","back","label"];
export const MAX_UPLOAD_BYTES = 5_000_000;

export class UploadValidationError extends Error {
  readonly status: number;

  constructor(message:string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validateThreeViewUpload(parts: UploadDescriptor[]) {
  for (const view of requiredViews) {
    const matching = parts.filter((part) => part.view === view);
    if (matching.length !== 1) throw new UploadValidationError(`Exactly one ${view} image is required.`);
  }
  for (const part of parts) {
    if (!allowedTypes.has(part.contentType)) throw new UploadValidationError(`${part.view} must be JPG, PNG, or WebP.`);
    if (part.size <= 0 || part.size > MAX_UPLOAD_BYTES) throw new UploadValidationError(`${part.view} must be larger than 0 bytes and no more than 5 MB.`);
  }
  return true;
}

export function analyzeThreeViewSet(parts: UploadDescriptor[], options?:{registry?:BrandProductRegistration[];labelText?:string}): GarmentAnalysis {
  validateThreeViewUpload(parts);
  const labelText=options?.labelText?.trim().slice(0,1000) ?? "";
  const match=matchBrandProduct(parts,labelText,options?.registry ?? seedBrandProducts);
  if (match) {
    const product=match.product;
    const northstarDemo=product.sku==="NA-OW-1042";
    return {
      provider:"deterministic-demo", fallback:true, confidence:match.method==="label-image-hash"||match.method==="catalog-image-set"?98:96, dataSufficiency:"complete",
      garment:northstarDemo
        ? { name:product.name,category:product.category,color:"sienna",style:["minimal","casual","utility"],construction:["point collar","button front","two patch pockets","back yoke"],material:"100% cotton" }
        : {name:product.name,category:product.category,color:"unconfirmed",style:[],construction:["front/back set validated"],material:"unconfirmed"},
      label:{ brand:product.brand,sku:product.sku,brandSlug:product.brandSlug,matched:true,registryProductId:product.id,matchMethod:match.method },
      evidence:[
        { view:"front",findings:northstarDemo?["sienna woven overshirt","button front","two chest pockets"]:["front image validated","registered catalog view available"] },
        { view:"back",findings:northstarDemo?["matching color and silhouette","back yoke seam","consistent construction"]:["back image validated","registered catalog view available"] },
        { view:"label",findings:[product.brand,product.sku,`Registry match: ${match.method}`] },
      ],
      warnings:["The product identity matched a brand-enrolled registry record. Confirm all attributes before saving; exact hashes prove identical files, not ownership of a separately photographed garment."],
    };
  }
  return {
    provider:"deterministic-demo",fallback:true,confidence:48,dataSufficiency:"complete",
    garment:{name:"Unconfirmed garment",category:"unknown",color:"unknown",style:[],construction:["three views received"],material:"unknown"},
    label:{brand:"Unmatched label",sku:"UNCONFIRMED",brandSlug:null,matched:false,registryProductId:null,matchMethod:"none"},
    evidence:requiredViews.map((view)=>({view,findings:[`${view} image validated`]})),
    warnings:["No authoritative brand registry match was found. Add readable label text or configure OCR; never infer ownership from appearance alone."],
  };
}
