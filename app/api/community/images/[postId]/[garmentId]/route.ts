import { NextResponse } from "next/server";
import { getPublishedCommunityImage, ProductionConfigurationError } from "@/lib/server/production-store";

export const runtime="nodejs";

export async function GET(_request:Request,{params}:{params:Promise<{postId:string;garmentId:string}>}){
  try{
    const {postId,garmentId}=await params;
    const image=await getPublishedCommunityImage(postId,garmentId);
    return new NextResponse(image.bytes,{status:200,headers:{"content-type":image.contentType,"cache-control":"public, max-age=3600, stale-while-revalidate=86400","x-content-type-options":"nosniff"}});
  }catch(error){
    return NextResponse.json({error:error instanceof ProductionConfigurationError?error.message:"Published image was not found."},{status:error instanceof ProductionConfigurationError?503:404});
  }
}
