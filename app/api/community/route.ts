import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { catalog } from "@/lib/demo-data";
import { addPost, incrementPostLike, listPosts } from "@/lib/server/demo-store";

export async function GET() { return NextResponse.json({posts:listPosts()}); }

export async function POST(request:Request) {
  const session=await getSession();
  if (!session) return NextResponse.json({error:"Sign in to share an outfit."},{status:401});
  if (session.role!=="consumer") return NextResponse.json({error:"Only Consumer accounts can publish outfits."},{status:403});
  const body=await request.json().catch(()=>null) as {outfitTitle?:string;caption?:string;sku?:string}|null;
  const title=body?.outfitTitle?.trim() ?? ""; const caption=body?.caption?.trim() ?? "";
  if (title.length<3 || title.length>80) return NextResponse.json({error:"Outfit title must be 3–80 characters."},{status:400});
  if (caption.length<3 || caption.length>280) return NextResponse.json({error:"Caption must be 3–280 characters."},{status:400});
  const product=catalog.find((item)=>item.sku===(body?.sku ?? "NA-OW-1042")) ?? catalog[0];
  const post=addPost({outfitTitle:title,caption,image:"/test-uploads/northstar-overshirt-front.png",products:[{sku:product.sku,name:product.name,brand:product.brand,brandSlug:"northstar-atelier",category:product.category}]});
  return NextResponse.json({post},{status:201});
}

export async function PATCH(request:Request) {
  const body=await request.json().catch(()=>null) as {postId?:string}|null;
  if (!body?.postId) return NextResponse.json({error:"Community post ID is required."},{status:400});
  try { return NextResponse.json({postId:body.postId,likes:incrementPostLike(body.postId)}); }
  catch { return NextResponse.json({error:"Community post was not found."},{status:404}); }
}
