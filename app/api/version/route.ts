import { NextResponse } from "next/server";

/**
 * What is actually running.
 *
 * A deployed change cannot be confirmed from outside by reading the page: Next.js asset names are
 * content hashes, so a purely server-side change leaves every one of them identical, and a route
 * that requires a session answers the same 401 before and after. This endpoint reports the commit
 * the running artifact was built from, which is the only honest answer to "did it deploy?".
 *
 * It exposes nothing that is not already public: the commit SHA of a public repository, and the
 * time the build ran. No account, configuration, credential, or request data passes through here.
 */
export const dynamic = "force-dynamic";

const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;

export async function GET() {
  const commit = (process.env.RACKED_BUILD_COMMIT ?? "").trim();
  const builtAt = (process.env.RACKED_BUILD_TIME ?? "").trim();
  return NextResponse.json(
    {
      // "unknown" is the honest answer on a local run, where no build stamp was written.
      commit: COMMIT_PATTERN.test(commit) ? commit : "unknown",
      builtAt: Number.isNaN(Date.parse(builtAt)) ? null : builtAt,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
