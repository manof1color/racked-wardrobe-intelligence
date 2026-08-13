import type { OutfitPost, PublicOutfitGarment } from "./platform-types.ts";
import type { ProductResolutionState } from "./types.ts";

export interface StoredPublishedGarment {
  publicGarmentId: string;
  name: string;
  category: string;
  subtype?: string;
  color?: string;
  pattern?: string;
  style?: string[];
  material?: string;
  imageKey?: string;
  resolutionState: ProductResolutionState;
  verifiedProduct?: { registryProductId:string; sku:string; name:string; brand:string; brandSlug:string; commerceState?:import("./platform-types.ts").CommerceDestinationState; outboundUrl?:string; price?:number; currency?:string };
  unverifiedBrandLabel?: string;
}

export interface StoredCommunityPost extends Partial<OutfitPost> {
  ownerId?: string;
  imageKey?: string;
  publishedGarments?: StoredPublishedGarment[];
  PK?: string;
  SK?: string;
  GSI1PK?: string;
}

const RESOLUTION_STATES = new Set<ProductResolutionState>(["EXACT_VERIFIED_PRODUCT", "AI_ESTIMATED_PRODUCT", "SIMILAR_PRODUCT", "GENERIC_UNVERIFIED", "VERIFIED_UNAVAILABLE"]);

function cleanPath(value: unknown) {
  const path=String(value??"");
  return path.startsWith("/")&&!path.startsWith("//")?path:"";
}

function imagePath(postId:string,garmentId:string) {
  return `/api/community/images/${encodeURIComponent(postId)}/${encodeURIComponent(garmentId)}`;
}

function publicGarment(postId:string, stored:StoredPublishedGarment):PublicOutfitGarment {
  const state=RESOLUTION_STATES.has(stored.resolutionState)?stored.resolutionState:"GENERIC_UNVERIFIED";
  const verified=state==="EXACT_VERIFIED_PRODUCT"&&stored.verifiedProduct
    ?{registryProductId:String(stored.verifiedProduct.registryProductId),sku:String(stored.verifiedProduct.sku),name:String(stored.verifiedProduct.name),brand:String(stored.verifiedProduct.brand),brandSlug:String(stored.verifiedProduct.brandSlug),...(stored.verifiedProduct.commerceState?{commerceState:stored.verifiedProduct.commerceState}:{}),...(cleanPath(stored.verifiedProduct.outboundUrl)?{outboundUrl:cleanPath(stored.verifiedProduct.outboundUrl)}:{}),...(Number.isFinite(stored.verifiedProduct.price)?{price:Number(stored.verifiedProduct.price)}:{}),...(stored.verifiedProduct.currency?{currency:String(stored.verifiedProduct.currency)}:{})}
    :undefined;
  return {
    publicGarmentId:String(stored.publicGarmentId),
    name:String(stored.name),
    category:String(stored.category),
    ...(stored.subtype?{subtype:String(stored.subtype)}:{}),
    ...(stored.color?{color:String(stored.color)}:{}),
    ...(stored.pattern?{pattern:String(stored.pattern)}:{}),
    ...(Array.isArray(stored.style)?{style:stored.style.filter(item=>typeof item==="string").slice(0,8).map(String)}:{}),
    ...(stored.material?{material:String(stored.material)}:{}),
    image:stored.imageKey?imagePath(postId,String(stored.publicGarmentId)):"",
    resolutionState:state,
    ...(verified?{verifiedProduct:verified}:{}),
    ...(!verified&&stored.unverifiedBrandLabel?{unverifiedBrandLabel:String(stored.unverifiedBrandLabel)}:{}),
  };
}

// Public Community responses are reconstructed from this allowlist. Private owner IDs,
// saved-outfit IDs, wardrobe item IDs, S3 keys, and database keys are never copied.
export function toPublicOutfitPost(stored: StoredCommunityPost): OutfitPost {
  const id=String(stored.id??"");
  const garments=(Array.isArray(stored.publishedGarments)?stored.publishedGarments:[]).map((garment)=>publicGarment(id,garment));
  const legacyProducts=(Array.isArray(stored.products)?stored.products:[]).map((product)=>({
    sku:String(product?.sku??""),name:String(product?.name??""),brand:String(product?.brand??""),brandSlug:String(product?.brandSlug??""),category:String(product?.category??""),
  }));
  const products=garments.flatMap((garment)=>garment.verifiedProduct?[{sku:garment.verifiedProduct.sku,name:garment.verifiedProduct.name,brand:garment.verifiedProduct.brand,brandSlug:garment.verifiedProduct.brandSlug,category:garment.category}]:[]);
  const primaryImage=garments.find((garment)=>garment.image)?.image||(stored.imageKey?imagePath(id,"legacy-primary"):cleanPath(stored.image));
  return {
    id,
    handle:String(stored.handle??""),
    outfitTitle:String(stored.outfitTitle??""),
    caption:String(stored.caption??""),
    image:primaryImage,
    createdAt:String(stored.createdAt??""),
    likes:Number(stored.likes??0)||0,
    sourceType:stored.sourceType==="brand"?"brand":"consumer",
    ...(stored.fictional===true?{fictional:true}:{}),
    ...(stored.dataClassification==="DEMO"||stored.dataClassification==="PILOT"?{dataClassification:stored.dataClassification}:{}),
    garments,
    products:products.length?products:legacyProducts,
  };
}

export function publishedImageKey(stored:StoredCommunityPost,publicGarmentId:string){
  if(publicGarmentId==="legacy-primary")return stored.imageKey;
  return stored.publishedGarments?.find(garment=>garment.publicGarmentId===publicGarmentId)?.imageKey;
}
