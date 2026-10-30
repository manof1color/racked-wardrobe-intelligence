import { NextResponse } from "next/server";
import { brandAccess } from "@/lib/server/brand-access";
import { failureResponse, RequestRefused } from "@/lib/api-errors";
import { asUploadError, MAX_UPLOAD_BYTES, UploadValidationError, validateFrontFirstUpload } from "@/lib/garment-analysis";
import { readCappedFormData } from "@/lib/request-body";
import { stripImageMetadata } from "@/lib/image-sanitize";
import { createBrandProductRegistration, registryIdentityConflict } from "@/lib/product-registry";
import { BRAND_PRODUCT_LIMIT, productLimitMessage } from "@/lib/brand-approval";
import { brandProductCount, discardBrandImages, getAccount,listOwnedBrandProducts, listRegistryProducts, otherBrandNames, putPrivateImage, saveBrandProduct } from "@/lib/server/production-store";
import type { GarmentView, UploadDescriptor } from "@/lib/platform-types";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";

export const runtime="nodejs";
const views:GarmentView[]=["front","back","label"];

export async function GET(){const access=await brandAccess();if(!access.ok)return access.response;const {session}=access;
  return NextResponse.json({products:await listOwnedBrandProducts(session.subject)});}

export async function POST(request:Request){
  const access=await brandAccess({write:true});if(!access.ok)return access.response;const {session}=access;
  const limit=consumeRateLimit(`brand-enroll:${session.subject}`,RATE_LIMIT_RULES.brandProductEnroll);
  if(!limit.allowed)return NextResponse.json({error:"Too many products enrolled in the last hour. Try again later."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  const contentLength=Number(request.headers.get("content-length")??0);
  if(contentLength>(MAX_UPLOAD_BYTES*3)+1_000_000)return NextResponse.json({error:"The complete registration must be no more than 16 MB."},{status:413});
  try {
    // A full catalog is refused before any photo is read; saveBrandProduct enforces the same limit
    // in its transaction, so requests sent at once cannot pass it either.
    if(await brandProductCount(access.account)>=BRAND_PRODUCT_LIMIT)throw new RequestRefused(productLimitMessage(BRAND_PRODUCT_LIMIT),409);
    // Up to three photos, read under the upload cap whatever Content-Length claimed.
    const form=await readCappedFormData(request).catch((error:unknown)=>{throw asUploadError(error);});
    // A product photo is required; back and label photos are optional. Identity comes from the SKU
    // and GTIN typed below, and no match has ever read a label photo, so requiring one only slowed
    // enrollment down.
    const files=views.flatMap(view=>{const value=form.get(view);return value instanceof File&&value.size>0?[{view,file:value}]:[];});
    if(!files.some(entry=>entry.view==="front"))throw new UploadValidationError("Add a product photo.");
    const basicParts=await Promise.all(files.map(async({view,file})=>{const bytes=await file.arrayBuffer();const hash=await crypto.subtle.digest("SHA-256",bytes);return {view,fileName:file.name,contentType:file.type,size:file.size,sha256:Buffer.from(hash).toString("hex")} as UploadDescriptor;}));
    validateFrontFirstUpload(basicParts);
    // Re-encoded before anything is stored: drops GPS and camera metadata, and proves each file is
    // the image it claims to be. A file that is not fails here, with nothing written.
    const cleaned=await Promise.all(files.map(async({file})=>stripImageMetadata(Buffer.from(await file.arrayBuffer()))));
    const [account,registry]=await Promise.all([getAccount(session.subject),listRegistryProducts()]);
    if(!account?.brandName)throw new RequestRefused("This account has no verified brand profile.");
    const brandName=account.brandName;
    const details=(parts:UploadDescriptor[],others:string[])=>createBrandProductRegistration({ownerSubject:session.subject,name:String(form.get("name")??""),brand:brandName,sku:String(form.get("sku")??""),gtin:String(form.get("gtin")??""),category:String(form.get("category")??""),subtype:String(form.get("subtype")??""),color:String(form.get("color")??""),pattern:String(form.get("pattern")??""),material:String(form.get("material")??""),style:String(form.get("style")??""),labelText:String(form.get("labelText")??""),aliases:String(form.get("aliases")??"").split(","),productUrl:String(form.get("productUrl")??""),affiliateUrl:String(form.get("affiliateUrl")??""),price:String(form.get("price")??""),currency:String(form.get("currency")??"USD"),availability:String(form.get("availability")??"unknown"),affiliateProvider:String(form.get("affiliateProvider")??""),affiliateTrackingId:String(form.get("affiliateTrackingId")??""),parts,otherBrandNames:others});
    // Every check runs before anything is stored, so a rejected enrollment leaves no orphaned photos.
    const others=await otherBrandNames(session.subject,registry);
    const conflict=registryIdentityConflict(details(basicParts,others),registry);
    if(conflict)return NextResponse.json({error:conflict},{status:409});
    // Every photo is stored, or none is kept: if one upload or the record write fails, the photos
    // already stored are deleted before the error is answered.
    const uploads=await Promise.allSettled(cleaned.map(image=>putPrivateImage(session.subject,"brand",image.bytes,image.contentType)));
    const storedKeys=uploads.flatMap(upload=>upload.status==="fulfilled"?[upload.value]:[]);
    const failedUpload=uploads.find(upload=>upload.status==="rejected");
    if(failedUpload){await discardBrandImages(session.subject,storedKeys);throw failedUpload.reason;}
    const storedParts=basicParts.map((part,index)=>({...part,contentType:cleaned[index].contentType,storageKey:storedKeys[index]}));
    const product=details(storedParts,others);
    try{await saveBrandProduct(session.subject,product);}
    catch(error){await discardBrandImages(session.subject,storedKeys);throw error;}
    return NextResponse.json({product,retention:"Brand-authorized photos are re-encoded without location or camera metadata and encrypted in private S3."},{status:201});
  } catch(error){return failureResponse(error,"Brand product enrollment failed","The product could not be enrolled. Try again.");}
}
