import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { getHomeCity, setHomeCity } from "@/lib/server/production-store";
import { readPlace, searchPlaces } from "@/lib/weather";

/**
 * The home city Hanger uses for the weather. Consumer-only and always the signed-in person's own
 * profile: there is no account id in any request. `?search=` looks a city up so the person can pick
 * the right one — there is more than one Springfield.
 */
async function consumer() {
  const session = await getSession();
  if (!session || session.role !== "consumer") return { error: NextResponse.json({ error: "Consumer account required." }, { status: 403 }) };
  return { session };
}

export async function GET(request: Request) {
  const { session, error } = await consumer();
  if (error) return error;
  const search = new URL(request.url).searchParams.get("search")?.trim() ?? "";
  if (search) {
    const limit = consumeRateLimit(`place-search:${session!.subject}`, RATE_LIMIT_RULES.placeSearch);
    if (!limit.allowed) return NextResponse.json({ error: "Too many searches. Try again in a few minutes." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
    return NextResponse.json({ places: await searchPlaces(search) });
  }
  try {
    return NextResponse.json({ homeCity: await getHomeCity(session!.subject) });
  } catch {
    return NextResponse.json({ error: "Your home city could not be loaded." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const { session, error } = await consumer();
  if (error) return error;
  const body = await request.json().catch(() => null) as { homeCity?: unknown } | null;
  const place = readPlace(body?.homeCity);
  if (place === undefined) return NextResponse.json({ error: "Choose a city from the list, or clear it." }, { status: 400 });
  try {
    return NextResponse.json({ homeCity: await setHomeCity(session!.subject, place) });
  } catch {
    return NextResponse.json({ error: "Your home city could not be saved. Try again." }, { status: 503 });
  }
}
