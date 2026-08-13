import type { BrandLook, BrandProductRegistration } from "./platform-types.ts";

export function createBrandLook(input:{ownerSubject:string;brand:string;brandSlug:string;title:string;caption:string;productIds:string[];published:boolean},ownedProducts:BrandProductRegistration[]):BrandLook{
  const title=input.title.trim().slice(0,80),caption=input.caption.trim().slice(0,280),productIds=[...new Set(input.productIds)].slice(0,10);
  if(title.length<3)throw new Error("Brand Look title must be at least 3 characters.");
  if(caption.length<3)throw new Error("Brand Look caption must be at least 3 characters.");
  if(productIds.length<1)throw new Error("Choose at least one brand-owned product.");
  const ownedIds=new Set(ownedProducts.filter(product=>product.ownerSubject===input.ownerSubject).map(product=>product.id));
  if(productIds.some(id=>!ownedIds.has(id)))throw new Error("Every Brand Look product must belong to this brand account.");
  return {id:crypto.randomUUID(),ownerSubject:input.ownerSubject,brand:input.brand,brandSlug:input.brandSlug,title,caption,productIds,createdAt:new Date().toISOString(),sourceType:"brand",published:input.published};
}
