export type GarmentView = "front" | "back" | "label";
export type PartnerVertical = "vintage" | "clothing" | "shoes" | "jewelry";

export interface UploadDescriptor {
  view: GarmentView;
  fileName: string;
  contentType: string;
  size: number;
  sha256?: string;
}

export interface BrandProductRegistration {
  id: string;
  ownerSubject: string;
  name: string;
  brand: string;
  brandSlug: string;
  aliases: string[];
  sku: string;
  gtin: string | null;
  category: string;
  labelText: string;
  views: Record<GarmentView, UploadDescriptor>;
  enrolledAt: string;
  source: "brand-enrolled" | "seed";
}

export interface GarmentAnalysis {
  provider: "deterministic-demo" | "multimodal";
  fallback: boolean;
  confidence: number;
  dataSufficiency: "complete" | "partial";
  garment: {
    name: string;
    category: string;
    color: string;
    style: string[];
    construction: string[];
    material: string;
  };
  label: {
    brand: string;
    sku: string;
    brandSlug: string | null;
    matched: boolean;
    registryProductId: string | null;
    matchMethod: "brand-sku" | "gtin" | "label-image-hash" | "catalog-image-set" | "none";
  };
  evidence: Array<{ view:GarmentView; findings:string[] }>;
  warnings: string[];
}

export interface OutfitPost {
  id: string;
  handle: string;
  outfitTitle: string;
  caption: string;
  image: string;
  createdAt: string;
  likes: number;
  fictional: true;
  products: Array<{ sku:string; name:string; brand:string; brandSlug:string; category:string }>;
}

export interface AgentReply {
  agent: "consumer-stylist" | "brand-wear-intelligence";
  message: string;
  confidence: "high" | "medium" | "low";
  toolsUsed: string[];
  actions: Array<{ label:string; type:string; payload:Record<string,string> }>;
  evidence: string[];
}

export interface PartnerDashboardData {
  vertical: PartnerVertical;
  title: string;
  description: string;
  metrics: Array<{ label:string; value:string; detail:string }>;
  inventory: Array<{ sku:string; name:string; actualWears:number; owners:number; repeatWearRate:number; status:string }>;
  agentBrief: string;
}
