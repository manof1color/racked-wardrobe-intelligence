import { getSession } from "@/lib/auth";
import { detectGarmentsInLook } from "@/lib/look-garment-detection";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { siteModelCallFor, spendAiAllowance } from "@/lib/server/abuse-guard";
import { listWardrobe } from "@/lib/server/production-store";
import { handleWearPhotoScan } from "@/lib/wear-photo-scan";

export const runtime="nodejs";

// "Log with a photo": suggests which of the person's own closet pieces they are wearing. It records
// nothing and keeps nothing — no wear, count, points or brand data, and no copy of the photo. The
// person confirms the pieces and the browser then records the wear through /api/wears.
// lib/wear-photo-scan.ts holds the logic; this binds the real session, closet, budgets and detector.
export function POST(request:Request) {
  return handleWearPhotoScan(request,{
    getSession,
    consumeRateLimit:key=>consumeRateLimit(key,RATE_LIMIT_RULES.lookDetect),
    listCloset:ownerId=>listWardrobe(ownerId),
    spendAllowance:ownerId=>spendAiAllowance("scan",ownerId),
    spendSiteModelCall:session=>siteModelCallFor(session)(),
    detect:detectGarmentsInLook,
    aiConfigured:()=>(process.env.AI_PROVIDER??"").toLowerCase()==="bedrock",
  });
}
