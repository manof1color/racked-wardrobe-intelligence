import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { unpublishCommunityPost } from "@/lib/server/production-store";

// Takes a look back out of Community. Publishing is opt-in per post; this is the way back. Only the
// signed-in owner can do it, ownership comes from the session and never from the request, and a look
// that belongs to someone else answers exactly like one that does not exist.
export async function DELETE(_request:Request,{params}:{params:Promise<{postId:string}>}){
  const session=await getSession();
  if(!session)return NextResponse.json({error:"Sign in is required."},{status:401});
  if(session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});
  const limit=consumeRateLimit(`community-unpublish:${session.subject}`,RATE_LIMIT_RULES.communityUnpublish);
  if(!limit.allowed)return NextResponse.json({error:"Too many changes. Try again shortly."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  const {postId}=await params;
  if(!postId||postId.length>100)return NextResponse.json({error:"Look not found."},{status:404});
  try{
    if(!await unpublishCommunityPost(session.subject,postId))return NextResponse.json({error:"Look not found."},{status:404});
    return NextResponse.json({unpublished:true});
  }catch(reason){
    console.error("Community look could not be unpublished",{name:reason instanceof Error?reason.name:"UnknownError"});
    return NextResponse.json({error:"The look could not be taken down. Try again."},{status:503});
  }
}
