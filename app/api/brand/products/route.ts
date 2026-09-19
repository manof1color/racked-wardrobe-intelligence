import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, UploadValidationError, validateFrontFirstUpload } from "@/lib/garment-analysis";
import { createBrandProductRegistration, registryIdentityConflict } from "@/lib/product-registry";
import { getAccount, listOwnedBrandProducts, listRegistryProducts, otherBrandNames, putPrivateImage, saveBrandProduct } from "@/lib/server/production-store";
import type { GarmentView, UploadDescriptor } from "@/lib/platform-types";

export const runtime="nodejs";
const views:GarmentView[]=["front","back","label"];

export async function GET(){const session=await getSession();if(!session)return NextResponse.json({error:"Sign in is required."},{status:401});
  if(session.role!=="brand")return NextResponse.json({error:"Brand account required."},{status:403});return NextResponse.json({products:await listOwnedBrandProducts(session.subject)});}

export async function POST(request:Request){
  const session=await getSession();
  if(!session)return NextResponse.json({error:"Sign in is required."},{status:401});
  if(session.role!=="brand")return NextResponse.json({error:"Brand account required."},{status:403});
  const contentLength=Number(request.headers.get("content-length")??0);
  if(contentLength>(MAX_UPLOAD_BYTES*3)+1_000_000)return NextResponse.json({error:"The complete registration must be no more than 16 MB."},{status:413});
  try {
    const form=await request.formData();
    // A product photo is required; back and label photos are optional. Identity comes from the SKU
    // and GTIN typed below, and no match has ever read a label photo, so requiring one only slowed
    // enrollment down.
    const files=views.flatMap(view=>{const value=form.get(view);return value instanceof File&&value.size>0?[{view,file:value}]:[];});
    if(!files.some(entry=>entry.view==="front"))throw new UploadValidationError("Add a product photo.");
    const basicParts=await Promise.all(files.map(async({view,file})=>{const bytes=await file.arrayBuffer();const hash=await crypto.subtle.digest("SHA-256",bytes);return {view,fileName:file.name,contentType:file.type,size:file.size,sha256:Buffer.from(hash).toString("hex")} as UploadDescriptor;}));
    validateFrontFirstUpload(basicParts);
    const [account,registry]=await Promise.all([getAccount(session.subject),listRegistryProducts()]);
    if(!account?.brandName)throw new Error("This account has no verified brand profile.");
    const brandName=account.brandName;
    const details=(parts:UploadDescriptor[],others:string[])=>createBrandProductRegistration({ownerSubject:session.subject,name:String(form.get("name")??""),brand:brandName,sku:String(form.get("sku")??""),gtin:String(form.get("gtin")??""),category:String(form.get("category")??""),subtype:String(form.get("subtype")??""),color:String(form.get("color")??""),pattern:String(form.get("pattern")??""),material:String(form.get("material")??""),style:String(form.get("style")??""),labelText:String(form.get("labelText")??""),aliases:String(form.get("aliases")??"").split(","),productUrl:String(form.get("productUrl")??""),affiliateUrl:String(form.get("affiliateUrl")??""),price:String(form.get("price")??""),currency:String(form.get("currency")??"USD"),availability:String(form.get("availability")??"unknown"),affiliateProvider:String(form.get("affiliateProvider")??""),affiliateTrackingId:String(form.get("affiliateTrackingId")??""),parts,otherBrandNames:others});
    // Every check runs before anything is stored, so a rejected enrollment leaves no orphaned photos.
    const others=await otherBrandNames(session.subject,registry);
    const conflict=registryIdentityConflict(details(basicParts,others),registry);
    if(conflict)return NextResponse.json({error:conflict},{status:409});
    const storedParts=await Promise.all(files.map(async({file},index)=>({...basicParts[index],storageKey:await putPrivateImage(session.subject,"brand",Buffer.from(await file.arrayBuffer()),file.type)})));
    const product=details(storedParts,others);
    await saveBrandProduct(session.subject,product);
    return NextResponse.json({product,retention:"Brand-authorized originals are encrypted in private S3."},{status:201});
  } catch(error){if(error instanceof UploadValidationError)return NextResponse.json({error:error.message},{status:error.status});return NextResponse.json({error:error instanceof Error?error.message:"Product registration failed."},{status:400});}
}
