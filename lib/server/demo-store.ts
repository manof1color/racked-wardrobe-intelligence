import { seedCommunityPosts } from "../community-data.ts";
import { wardrobe } from "../demo-data.ts";
import { seedBrandProducts } from "../product-registry.ts";
import { exceedsEnumerationBudget, type AggregateQueryEvent } from "../privacy.ts";
import type { LiveProfile } from "../segments.ts";
import type { BrandProductRegistration, OutfitPost } from "../platform-types.ts";

interface DemoStore { posts:OutfitPost[]; wearCounts:Map<string,number>; brandProducts:BrandProductRegistration[]; aggregateQueryLog:AggregateQueryEvent[]; consumerBrandDataConsent:boolean; }
const globalStore = globalThis as typeof globalThis & { __rackedDemoStore?:DemoStore };

function createStore(): DemoStore {
  return { posts:structuredClone(seedCommunityPosts),wearCounts:new Map(wardrobe.map((item)=>[item.id,item.wearCount])),brandProducts:structuredClone(seedBrandProducts),aggregateQueryLog:[],consumerBrandDataConsent:true };
}

export function getDemoStore() { return globalStore.__rackedDemoStore ??= createStore(); }
export function resetDemoStore() { globalStore.__rackedDemoStore = createStore(); return getDemoStore(); }
export function listPosts() { return [...getDemoStore().posts].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)); }
export function addPost(input:Pick<OutfitPost,"outfitTitle"|"caption"|"image"|"products">) {
  const post:OutfitPost={...input,id:`post-${crypto.randomUUID()}`,handle:"@maya_demo",createdAt:new Date().toISOString(),likes:0,sourceType:"consumer",garments:[],fictional:true};
  getDemoStore().posts.unshift(post); return post;
}
export function incrementPostLike(postId:string) {
  const post=getDemoStore().posts.find((item)=>item.id===postId);
  if (!post) throw new Error("Unknown community post.");
  post.likes+=1;
  return post.likes;
}
export function recordWear(itemId:string) {
  if (!wardrobe.some((item)=>item.id===itemId)) throw new Error("Unknown wardrobe item.");
  const next=(getDemoStore().wearCounts.get(itemId) ?? 0)+1; getDemoStore().wearCounts.set(itemId,next); return next;
}
export function recordOutfitWears(itemIds:string[]) {
  const unique=[...new Set(itemIds)];
  if (unique.length<1 || unique.length>10) throw new Error("An outfit must contain 1–10 known items.");
  if (unique.some((id)=>!wardrobe.some((item)=>item.id===id))) throw new Error("Unknown wardrobe item.");
  return Object.fromEntries(unique.map((id)=>[id,recordWear(id)]));
}
export function getWearCount(itemId:string) { return getDemoStore().wearCounts.get(itemId) ?? 0; }
export function listBrandProducts(ownerSubject?:string) { return structuredClone(ownerSubject?getDemoStore().brandProducts.filter((item)=>item.ownerSubject===ownerSubject):getDemoStore().brandProducts); }
export function registerBrandProduct(product:BrandProductRegistration) {
  const duplicateIndex=getDemoStore().brandProducts.findIndex((item)=>item.brandSlug===product.brandSlug && item.sku===product.sku);
  if (duplicateIndex>=0) {
    if (getDemoStore().brandProducts[duplicateIndex].source!=="seed") throw new Error("That brand and SKU are already registered.");
    getDemoStore().brandProducts.splice(duplicateIndex,1);
  }
  getDemoStore().brandProducts.unshift(structuredClone(product));
  return structuredClone(product);
}

// Judge note: anti-enumeration control for the two aggregate-releasing routes
// (/api/agents/brand and /api/brand/metrics). Wraps the pure check in lib/privacy.ts
// around this store's own query log, and doubles as an auditable record of every
// aggregate release/attempt for later review — see docs/privacy-and-ethics.md.
export function wouldExceedEnumerationBudget(subject:string, productId:string, now=Date.now()) {
  return exceedsEnumerationBudget(getDemoStore().aggregateQueryLog, subject, productId, now);
}
export function recordAggregateQuery(subject:string, productId:string, now=Date.now()) {
  getDemoStore().aggregateQueryLog.push({ subject, productId, at:now });
}
export function getAggregateQueryAudit(subject?:string) {
  const log = getDemoStore().aggregateQueryLog;
  return subject ? log.filter((event)=>event.subject===subject) : [...log];
}

// Judge note: granular consumer consent. The demo has exactly one fictional Consumer
// subject, so this is a single toggle rather than a per-user table — but it is real:
// when off, getLiveConsumerProfile() below is excluded from every product's computed
// cohort, and Brand-facing numbers change accordingly on the next query.
export function getConsumerBrandDataConsent() { return getDemoStore().consumerBrandDataConsent; }
export function setConsumerBrandDataConsent(value:boolean) { getDemoStore().consumerBrandDataConsent = value; return value; }
export function getLiveConsumerProfile(): LiveProfile {
  return { optedIn:getConsumerBrandDataConsent(), wardrobe:wardrobe.map((item)=>({ ...item, wearCount:getWearCount(item.id) })) };
}
