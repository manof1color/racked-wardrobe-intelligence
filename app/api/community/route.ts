import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { failureResponse, RequestRefused } from "@/lib/api-errors";
import { addCommunityPost, listCommunityPosts, setCommunityLookSaved } from "@/lib/server/production-store";
import { readId } from "@/lib/request-input";
import { DEMO_PUBLISH_MESSAGE } from "@/lib/demo-session";
export async function GET(){return NextResponse.json({posts:await listCommunityPosts()});}
export async function POST(request:Request){const session=await getSession();if(!session||session.role!=="consumer")return NextResponse.json({error:"Consumer account required to publish."},{status:403});if(session.demo)return NextResponse.json({error:DEMO_PUBLISH_MESSAGE},{status:403});const limit=consumeRateLimit(`community-publish:${session.subject}`,RATE_LIMIT_RULES.communityPublish);if(!limit.allowed)return NextResponse.json({error:"Too many posts. Try again later."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});const body=await request.json().catch(()=>null) as {outfitTitle?:string;caption?:string;outfitId?:string}|null;const title=typeof body?.outfitTitle==="string"?body.outfitTitle.trim():"";const caption=typeof body?.caption==="string"?body.caption.trim():"";if(title.length<3||title.length>80)return NextResponse.json({error:"Outfit title must be 3–80 characters."},{status:400});if(caption.length<3||caption.length>280)return NextResponse.json({error:"Caption must be 3–280 characters."},{status:400});if(!body?.outfitId)return NextResponse.json({error:"Select a saved outfit to publish."},{status:400});try{return NextResponse.json({post:await addCommunityPost(session.subject,{outfitTitle:title,caption,outfitId:readId(body.outfitId,"saved outfit")})},{status:201});}catch(error){return failureResponse(error,"Community publish failed","Outfit could not be published. Try again.");}}
/**
 * The heart: saves or unsaves a look for the signed-in Consumer. The body says which ("saved": true
 * or false; a body without it saves, as the heart always did), so a repeated or doubled request
 * changes nothing. The saver is the session, never the request. Signed-out visitors are asked to
 * sign in rather than adding to the count, because only a signed-in person can be counted once.
 */
export async function PATCH(request:Request){
  const session=await getSession();
  if(!session)return NextResponse.json({error:"Sign in to save looks."},{status:401});
  if(session.role!=="consumer")return NextResponse.json({error:"Consumer account required to save looks."},{status:403});
  const limit=consumeRateLimit(`community-like:${session.subject}`,RATE_LIMIT_RULES.communityLike);
  if(!limit.allowed)return NextResponse.json({error:"Too many reactions. Try again shortly."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  const body=await request.json().catch(()=>null) as {postId?:unknown;saved?:unknown}|null;
  const postId=typeof body?.postId==="string"?body.postId.trim():"";
  if(!postId||postId.length>128)return NextResponse.json({error:"Community post ID is required."},{status:400});
  if(body?.saved!==undefined&&typeof body.saved!=="boolean")return NextResponse.json({error:"saved must be true or false."},{status:400});
  try{
    const result=await setCommunityLookSaved(session.subject,postId,body?.saved!==false);
    return NextResponse.json({postId,saved:result.saved,inspired:result.saved,likes:result.likes});
  }catch(reason){
    if(reason instanceof RequestRefused&&reason.status===404)return NextResponse.json({error:"Community post was not found."},{status:404});
    console.error("Community save failed",{name:reason instanceof Error?reason.name:"UnknownError"});
    return NextResponse.json({error:"The look could not be saved. Try again."},{status:503});
  }
}
