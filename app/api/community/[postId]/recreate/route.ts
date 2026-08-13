import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { recreateLook } from "@/lib/recreate-look";
import { getPublicCommunityPost, listWardrobe, recordPrivacySafeCommunityEvent } from "@/lib/server/production-store";

export async function POST(_request:Request,{params}:{params:Promise<{postId:string}>}){
  const session=await getSession();
  if(!session)return NextResponse.json({error:"Sign in is required."},{status:401});
  if(session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});
  const limit=consumeRateLimit(`recreate-look:${session.subject}`,RATE_LIMIT_RULES.recreateLook);
  if(!limit.allowed)return NextResponse.json({error:"Too many look comparisons. Try again shortly."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  const {postId}=await params;
  if(!postId||postId.length>100)return NextResponse.json({error:"A valid public outfit ID is required."},{status:400});
  const [post,wardrobe]=await Promise.all([getPublicCommunityPost(postId),listWardrobe(session.subject)]);
  if(!post)return NextResponse.json({error:"Public outfit not found."},{status:404});
  const result=recreateLook(post.id,post.garments,wardrobe);
  await recordPrivacySafeCommunityEvent(post.id,"recreate-look-request");
  return NextResponse.json({result});
}
