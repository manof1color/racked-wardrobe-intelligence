import { NextResponse } from "next/server";

/**
 * TEMPORARY: remove once RACKED_TRUSTED_PROXY_HOPS is set.
 *
 * That setting must equal the number of X-Forwarded-For entries the platform adds, and it can only
 * be measured on the deployed site. This answers with the number of entries on the request and
 * nothing else: no address, no other header, no account or configuration data, and nothing is stored
 * or logged.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const header = request.headers.get("x-forwarded-for");
  return NextResponse.json({ entries: header ? header.split(",").length : 0 }, { headers: { "cache-control": "no-store" } });
}
