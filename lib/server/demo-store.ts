import { seedCommunityPosts } from "../community-data.ts";
import { wardrobe } from "../demo-data.ts";
import type { OutfitPost } from "../platform-types.ts";

interface DemoStore { posts:OutfitPost[]; wearCounts:Map<string,number>; }
const globalStore = globalThis as typeof globalThis & { __rackedDemoStore?:DemoStore };

function createStore(): DemoStore {
  return { posts:structuredClone(seedCommunityPosts),wearCounts:new Map(wardrobe.map((item)=>[item.id,item.wearCount])) };
}

export function getDemoStore() { return globalStore.__rackedDemoStore ??= createStore(); }
export function resetDemoStore() { globalStore.__rackedDemoStore = createStore(); return getDemoStore(); }
export function listPosts() { return [...getDemoStore().posts].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)); }
export function addPost(input:Pick<OutfitPost,"outfitTitle"|"caption"|"image"|"products">) {
  const post:OutfitPost={...input,id:`post-${crypto.randomUUID()}`,handle:"@maya_demo",createdAt:new Date().toISOString(),likes:0,fictional:true};
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
