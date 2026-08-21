import type { GarmentCategory, GarmentHypothesis, GarmentSubtype } from "./garment-taxonomy.ts";

export type GarmentView = "front" | "back" | "label";
export type PartnerVertical = "vintage" | "clothing" | "shoes" | "jewelry";
export type DataClassification = "DEMO" | "PILOT" | "REGULAR";

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
  subtype?: string;
  color?: string;
  pattern?: string;
  style?: string[];
  material?: string;
  labelText: string;
  views: Record<GarmentView, UploadDescriptor>;
  enrolledAt: string;
  source: "brand-enrolled" | "seed";
  testCohort?: boolean;
  dataClassification?: DataClassification;
  imageUrls?: Partial<Record<GarmentView,string>>;
  productUrl?: string;
  affiliateUrl?: string;
  price?: number;
  currency?: string;
  availability?: "available"|"unavailable"|"discontinued"|"unknown";
  archived?: boolean;
  affiliateProvider?: string;
  affiliateTrackingId?: string;
}

export interface GarmentAnalysis {
  provider: "deterministic-demo" | "multimodal" | "manual-review";
  fallback: boolean;
  confidence: number;
  dataSufficiency: "complete" | "partial";
  garment: {
    name: string;
    category: GarmentCategory;
    subtype: GarmentSubtype;
    color: string;
    pattern: string;
    style: string[];
    construction: string[];
    material: string;
    alternatives: GarmentHypothesis["alternatives"];
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
    /** True when edge-connected background pixels were safely made transparent. */
    backgroundRemoved?: boolean;
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
  sourceType: "consumer" | "brand";
  fictional?: boolean;
  dataClassification?: DataClassification;
  garments: PublicOutfitGarment[];
  /** Exact verified products only; retained as a convenient brand-link projection. */
  products: Array<{ sku:string; name:string; brand:string; brandSlug:string; category:string }>;
}

export interface PublicOutfitGarment {
  publicGarmentId: string;
  name: string;
  category: string;
  subtype?: string;
  color?: string;
  pattern?: string;
  style?: string[];
  material?: string;
  image: string;
  resolutionState: import("./types.ts").ProductResolutionState;
  verifiedProduct?: { registryProductId:string; sku:string; name:string; brand:string; brandSlug:string; commerceState?:CommerceDestinationState; outboundUrl?:string; price?:number; currency?:string };
  unverifiedBrandLabel?: string;
}

export type CommerceDestinationState="EXACT_AVAILABLE"|"EXACT_UNAVAILABLE"|"SIMILAR_AVAILABLE"|"NO_DESTINATION";

export interface BrandLook {
  id:string;
  ownerSubject:string;
  brand:string;
  brandSlug:string;
  title:string;
  caption:string;
  productIds:string[];
  createdAt:string;
  sourceType:"brand";
  published:boolean;
  dataClassification?: DataClassification;
}

export interface BrandCommunityMetrics {
  productId: string;
  publicOutfitAppearances: number;
  consumerOutfitAppearances: number;
  brandLookAppearances: number;
  inspirationCount: number;
  recreateLookRequests: number;
  outboundProductClicks: number;
  pairedCategories: Array<{ category:string; appearances:number }>;
  pairedVerifiedProducts: Array<{ productId:string; name:string; brand:string; appearances:number }>;
  privacyBoundary: "PUBLIC_ACTIVITY_ONLY";
}

export interface AgentReply {
  agent: "consumer-stylist" | "brand-wear-intelligence" | "brand-retention";
  provider?: "amazon-bedrock" | "grounded-aggregate" | "grounded-wardrobe" | "privacy-threshold";
  message: string;
  confidence: "high" | "medium" | "low";
  toolsUsed: string[];
  actions: Array<{ label:string; type:string; payload:Record<string,string> }>;
  evidence: string[];
  /** Consumer-only visual grounding for the exact owned pieces Hanger selected. */
  selection?: Array<{ id:string; name:string; category:string; imageUrl?:string }>;
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
