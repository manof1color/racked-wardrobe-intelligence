import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, UploadValidationError, validateThreeViewUpload } from "@/lib/garment-analysis";
import { createBrandProductRegistration } from "@/lib/product-registry";
import { getAccount, listOwnedBrandProducts, putPrivateImage, saveBrandProduct } from "@/lib/server/production-store";
import type { GarmentView, UploadDescriptor } from "@/lib/platform-types";

export const runtime="nodejs";
const views:GarmentView[]=["front","back","label"];

export async function GET(){const session=await getSession();if(!session||session.role!=="brand")return NextResponse.json({error:"Brand account required."},{status:403});return NextResponse.json({products:await listOwnedBrandProducts(session.subject)});}

export async function POST(request:Request){
  const session=await getSession();
  if(!session||session.role!=="brand")return NextResponse.json({error:"Brand account required."},{status:403});
  const contentLength=Number(request.headers.get("content-length")??0);
  if(contentLength>(MAX_UPLOAD_BYTES*3)+1_000_000)return NextResponse.json({error:"The complete registration must be no more than 16 MB."},{status:413});
  try {
    const form=await request.formData();
    const files=views.map(view=>{const value=form.get(view);if(!(value instanceof File))throw new UploadValidationError(`Exactly one ${view} image is required.`);return {view,file:value};});
    const basicParts=await Promise.all(files.map(async({view,file})=>{const bytes=await file.arrayBuffer();const hash=await crypto.subtle.digest("SHA-256",bytes);return {view,fileName:file.name,contentType:file.type,size:file.size,sha256:Buffer.from(hash).toString("hex")} as UploadDescriptor;}));
    validateThreeViewUpload(basicParts);
    const storedParts=await Promise.all(files.map(async({file},index)=>({...basicParts[index],storageKey:await putPrivateImage(session.subject,"brand",Buffer.from(await file.arrayBuffer()),file.type)})));
    const account=await getAccount(session.subject);
    if(!account?.brandName)throw new Error("This account has no verified brand profile.");
    const product=createBrandProductRegistration({ownerSubject:session.subject,name:String(form.get("name")??""),brand:account.brandName,sku:String(form.get("sku")??""),gtin:String(form.get("gtin")??""),category:String(form.get("category")??""),labelText:String(form.get("labelText")??""),aliases:String(form.get("aliases")??"").split(","),productUrl:String(form.get("productUrl")??""),affiliateUrl:String(form.get("affiliateUrl")??""),price:String(form.get("price")??""),currency:String(form.get("currency")??"USD"),availability:String(form.get("availability")??"unknown"),affiliateProvider:String(form.get("affiliateProvider")??""),affiliateTrackingId:String(form.get("affiliateTrackingId")??""),parts:storedParts});
    await saveBrandProduct(session.subject,product);
    return NextResponse.json({product,retention:"Brand-authorized originals are encrypted in private S3."},{status:201});
  } catch(error){if(error instanceof UploadValidationError)return NextResponse.json({error:error.message},{status:error.status});return NextResponse.json({error:error instanceof Error?error.message:"Product registration failed."},{status:400});}
}
