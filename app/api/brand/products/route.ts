import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, UploadValidationError, validateThreeViewUpload } from "@/lib/garment-analysis";
import { createBrandProductRegistration } from "@/lib/product-registry";
import { listBrandProducts, registerBrandProduct } from "@/lib/server/demo-store";
import type { GarmentView, UploadDescriptor } from "@/lib/platform-types";

export const runtime="nodejs";

async function descriptor(view:GarmentView,file:File):Promise<UploadDescriptor> {
  const hash=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
  return {view,fileName:file.name,contentType:file.type,size:file.size,sha256:Buffer.from(hash).toString("hex")};
}

export async function GET() {
  const session=await getSession();
  if (!session || session.role!=="brand") return NextResponse.json({error:"Brand role required."},{status:403});
  return NextResponse.json({products:listBrandProducts(session.subject)});
}

export async function POST(request:Request) {
  const session=await getSession();
  if (!session || session.role!=="brand") return NextResponse.json({error:"Brand role required."},{status:403});
  const contentLength=Number(request.headers.get("content-length") ?? 0);
  if (contentLength>(MAX_UPLOAD_BYTES*3)+1_000_000) return NextResponse.json({error:"The complete registration must be no more than 16 MB."},{status:413});
  try {
    const form=await request.formData();
    const views:GarmentView[]=["front","back","label"];
    const files=views.map((view)=>{
      const value=form.get(view);
      if (!(value instanceof File)) throw new UploadValidationError(`Exactly one ${view} image is required.`);
      return {view,file:value};
    });
    const parts=await Promise.all(files.map(({view,file})=>descriptor(view,file)));
    validateThreeViewUpload(parts);
    const product=createBrandProductRegistration({
      ownerSubject:session.subject,name:String(form.get("name") ?? ""),brand:"Northstar Atelier",sku:String(form.get("sku") ?? ""),
      gtin:String(form.get("gtin") ?? ""),category:String(form.get("category") ?? ""),labelText:String(form.get("labelText") ?? ""),
      aliases:String(form.get("aliases") ?? "").split(","),parts,
    });
    return NextResponse.json({product:registerBrandProduct(product),retention:"The demo stores hashes and filenames only. AWS deployment will place brand-authorized originals in private S3."},{status:201});
  } catch (error) {
    if (error instanceof UploadValidationError) return NextResponse.json({error:error.message},{status:error.status});
    return NextResponse.json({error:error instanceof Error?error.message:"Product registration failed."},{status:400});
  }
}
