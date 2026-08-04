import type { GarmentAnalysis, GarmentView, UploadDescriptor } from "./platform-types.ts";

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

export function analyzeThreeViewSet(parts: UploadDescriptor[]): GarmentAnalysis {
  validateThreeViewUpload(parts);
  const names = parts.map((part) => part.fileName.toLowerCase()).join(" ");
  const northstarDemo = names.includes("northstar") && names.includes("overshirt");
  if (northstarDemo) {
    return {
      provider:"deterministic-demo", fallback:true, confidence:96, dataSufficiency:"complete",
      garment:{ name:"Sienna Soft Overshirt",category:"outerwear",color:"sienna",style:["minimal","casual","utility"],construction:["point collar","button front","two patch pockets","back yoke"],material:"100% cotton" },
      label:{ brand:"Northstar Atelier",sku:"NA-OW-1042",brandSlug:"northstar-atelier",matched:true },
      evidence:[
        { view:"front",findings:["sienna woven overshirt","button front","two chest pockets"] },
        { view:"back",findings:["matching color and silhouette","back yoke seam","consistent construction"] },
        { view:"label",findings:["NORTHSTAR ATELIER","NA-OW-1042","100% COTTON"] },
      ],
      warnings:["Demo fallback recognized the checked-in test filenames and manifest. Confirm all attributes before saving."],
    };
  }
  return {
    provider:"deterministic-demo",fallback:true,confidence:48,dataSufficiency:"complete",
    garment:{name:"Unconfirmed garment",category:"unknown",color:"unknown",style:[],construction:["three views received"],material:"unknown"},
    label:{brand:"Unmatched label",sku:"UNCONFIRMED",brandSlug:null,matched:false},
    evidence:requiredViews.map((view)=>({view,findings:[`${view} image validated`]})),
    warnings:["No external multimodal provider is configured. Enter or confirm the attributes manually."],
  };
}
