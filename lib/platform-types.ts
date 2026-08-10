export type GarmentView = "front" | "back" | "label";
export type PartnerVertical = "vintage" | "clothing" | "shoes" | "jewelry";

export interface UploadDescriptor {
  view: GarmentView;
  fileName: string;
  contentType: string;
  size: number;
  sha256?: string;
  storageKey?: string;
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
  testCohort?: boolean;
  imageUrls?: Partial<Record<GarmentView,string>>;
}

export interface GarmentAnalysis {
  provider: "deterministic-demo" | "multimodal" | "manual-review";
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
    suggested?: boolean;
    registryProductId: string | null;
    matchMethod: "brand-sku" | "gtin" | "label-image-hash" | "catalog-image-set" | "major-brand-suggestion" | "ai-label-text" | "none";
  };
  evidence: Array<{ view:GarmentView; findings:string[] }>;
  warnings: string[];
  processedImage?: {
    key: string;
    url: string;
    width: number;
    height: number;
    confirmationToken: string;
    /** Private S3 key of the unmodified evidence photo, preserved separately from the display crop. */
    evidenceKey?: string;
    /** True when the display version received the tighter garment crop; false means original framing. */
    cropped?: boolean;
  };
}

export interface OutfitPost {
  id: string;
  handle: string;
  outfitTitle: string;
  caption: string;
  image: string;
  createdAt: string;
  likes: number;
  fictional?: boolean;
  products: Array<{ sku:string; name:string; brand:string; brandSlug:string; category:string }>;
}

export interface AgentReply {
  agent: "consumer-stylist" | "brand-wear-intelligence" | "brand-retention";
  provider?: "amazon-bedrock" | "grounded-aggregate" | "grounded-wardrobe" | "privacy-threshold";
  message: string;
  confidence: "high" | "medium" | "low";
  toolsUsed: string[];
  actions: Array<{ label:string; type:string; payload:Record<string,string> }>;
  evidence: string[];
}

export interface AgentChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface PartnerDashboardData {
  vertical: PartnerVertical;
  title: string;
  description: string;
  metrics: Array<{ label:string; value:string; detail:string }>;
  inventory: Array<{ sku:string; name:string; actualWears:number; owners:number; repeatWearRate:number; status:string }>;
  agentBrief: string;
}
