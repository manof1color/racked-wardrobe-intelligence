import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { failureResponse } from "@/lib/api-errors";
import { listSavedCommunityLooks } from "@/lib/server/production-store";

// The signed-in person's own saved Community looks, for "Saved from Community" on the Outfits tab.
// The owner is the session; there is no way to ask for anyone else's saves.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  if (session.role !== "consumer") return NextResponse.json({ error: "Consumer account required." }, { status: 403 });
  try {
    return NextResponse.json({ looks: await listSavedCommunityLooks(session.subject) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return failureResponse(error, "saved-looks-load", "Saved looks could not be loaded.");
  }
}
