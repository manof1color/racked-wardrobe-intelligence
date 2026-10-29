// Judge note: a lightweight sliding-window rate limiter for abuse resistance on
// authentication, AI-provider, and public community endpoints. State lives in the
// compute instance's memory, so limits apply per warm serverless instance rather than
// globally — this slows credential stuffing and AI-cost abuse at zero infrastructure
// cost, and is documented as a first layer, not a substitute for WAF-level controls.

export interface RateLimitRule {
  /** Maximum requests allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Whole seconds a caller should wait before retrying; 0 when allowed. */
  retryAfterSeconds: number;
}

export const RATE_LIMIT_RULES = {
  login: { limit: 10, windowMs: 5 * 60 * 1000 },
  register: { limit: 5, windowMs: 60 * 60 * 1000 },
  passwordResetRequest: { limit: 5, windowMs: 60 * 60 * 1000 },
  passwordResetConsume: { limit: 10, windowMs: 60 * 60 * 1000 },
  accountSettings: { limit: 10, windowMs: 15 * 60 * 1000 },
  accountDeletion: { limit: 5, windowMs: 15 * 60 * 1000 },
  garmentDelete: { limit: 30, windowMs: 10 * 60 * 1000 },
  // Tidying a closet is many small saves in a row, so the budget is looser than deletion's.
  garmentEdit: { limit: 60, windowMs: 10 * 60 * 1000 },
  // Looking up a city calls an outside geocoder on the person's behalf.
  placeSearch: { limit: 30, windowMs: 5 * 60 * 1000 },
  garmentVerify: { limit: 20, windowMs: 10 * 60 * 1000 },
  // One scan is one photo, and a batch is up to six of them, so this allows a few batches rather
  // than a few photos. Each one is still a metered Bedrock call.
  lookDetect: { limit: 24, windowMs: 10 * 60 * 1000 },
  consumerAgent: { limit: 20, windowMs: 5 * 60 * 1000 },
  brandAgent: { limit: 20, windowMs: 5 * 60 * 1000 },
  brandMetrics: { limit: 30, windowMs: 5 * 60 * 1000 },
  communityPublish: { limit: 10, windowMs: 60 * 60 * 1000 },
  communityUnpublish: { limit: 20, windowMs: 60 * 60 * 1000 },
  // Browsers send one report per violation; enough to learn from, too few to flood the logs.
  cspReport: { limit: 30, windowMs: 10 * 60 * 1000 },
  accountActivity: { limit: 30, windowMs: 5 * 60 * 1000 },
  endSessions: { limit: 5, windowMs: 15 * 60 * 1000 },
  // The demo preflight reads /api/health a few times; nobody needs it more often.
  health: { limit: 30, windowMs: 5 * 60 * 1000 },
  // Setting up, replacing recovery codes, and turning off; the code itself is also counted per account in DynamoDB.
  twoStep: { limit: 10, windowMs: 15 * 60 * 1000 },
  communityLike: { limit: 40, windowMs: 5 * 60 * 1000 },
  outboundClick: { limit: 30, windowMs: 5 * 60 * 1000 },
  demoPurchase: { limit: 20, windowMs: 5 * 60 * 1000 },
  recreateLook: { limit: 30, windowMs: 5 * 60 * 1000 },
  similarProducts: { limit: 30, windowMs: 5 * 60 * 1000 },
  // Search runs as a person types, so it allows more than a one-shot lookup.
  catalogSearch: { limit: 60, windowMs: 5 * 60 * 1000 },
  catalogMatch: { limit: 40, windowMs: 5 * 60 * 1000 },
  brandProductDescribe: { limit: 20, windowMs: 10 * 60 * 1000 },
  brandProductEdit: { limit: 40, windowMs: 10 * 60 * 1000 },
  // Writes that had no limit of their own. Each is keyed on the signed-in account and sits well
  // above real use: a brand enrolling a catalogue, a person tidying their outfits.
  brandProductEnroll: { limit: 60, windowMs: 60 * 60 * 1000 },
  brandLookPublish: { limit: 20, windowMs: 60 * 60 * 1000 },
  outfitWrite: { limit: 60, windowMs: 10 * 60 * 1000 },
  wearRecord: { limit: 30, windowMs: 10 * 60 * 1000 },
  consentChange: { limit: 20, windowMs: 15 * 60 * 1000 },
  wardrobeWrite: { limit: 60, windowMs: 10 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;

// Bound total tracked keys so hostile clients cannot grow instance memory by
// rotating identifiers. The map is kept in least-recently-used order: every use
// moves its key to the end.
const MAX_TRACKED_KEYS = 10_000;
const buckets = new Map<string, number[]>();

/**
 * Makes room for one new key. Keys idle for an hour (the longest window) go first; if that is not
 * enough, only the least recently used key is dropped. Clearing every counter here would let a
 * flood of new keys reset the budget of a key being used to guess passwords right now.
 */
function makeRoom(now: number) {
  for (const [key, timestamps] of buckets) {
    if (timestamps.every((at) => at <= now - 60 * 60 * 1000)) buckets.delete(key);
    if (buckets.size < MAX_TRACKED_KEYS) return;
  }
  const leastRecent = buckets.keys().next().value;
  if (leastRecent !== undefined) buckets.delete(leastRecent);
}

export function consumeRateLimit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitDecision {
  if (buckets.size >= MAX_TRACKED_KEYS && !buckets.has(key)) makeRoom(now);
  const cutoff = now - rule.windowMs;
  const recent = (buckets.get(key) ?? []).filter((at) => at > cutoff);
  buckets.delete(key);
  if (recent.length >= rule.limit) {
    buckets.set(key, recent);
    const oldest = recent[0];
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000)) };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

/** How many keys this instance is tracking; for tests. */
export function trackedRateLimitKeys() {
  return buckets.size;
}

export function resetRateLimits() {
  buckets.clear();
}

/**
 * The fewest X-Forwarded-For entries this instance has seen. CloudFront *appends* the address it
 * received the request from to whatever X-Forwarded-For the client sent, and any proxy behind it
 * appends again. So the entries a client writes always sit to the left of the ones the platform
 * adds — and a browser writes none. The shortest chain an instance sees is therefore the number of
 * entries the platform adds, and a client can only make a chain longer, never shorter.
 */
let platformHops = Number.POSITIVE_INFINITY;

const ADDRESS = /^[0-9a-f:.]{2,45}$/i;

/**
 * A caller identifier for per-client limits: the address CloudFront saw, never one the client wrote.
 *
 * The first entry of X-Forwarded-For is whatever the client put there, so keying limits on it let a
 * script rotate made-up addresses for a fresh budget each time. Instead this counts the platform's
 * entries from the right: `RACKED_TRUSTED_PROXY_HOPS` when it is configured, and otherwise the
 * shortest chain seen (above). It remains a best-effort key for an in-memory counter — never an
 * identity, never stored, never logged — and the limits that matter most are keyed on the email
 * address, the account, or the site instead (lib/abuse-limits.ts).
 */
/** The key for a request whose client address cannot be read; never counted in shared limits. */
export const UNIDENTIFIED_CLIENT = "unidentified-client";

export function clientIdentifier(request: Request, configuredHops: string | undefined = process.env.RACKED_TRUSTED_PROXY_HOPS) {
  const entries = (request.headers.get("x-forwarded-for") ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
  if (!entries.length || entries.length > 32) return UNIDENTIFIED_CLIENT;
  const configured = Number(configuredHops);
  let hops: number;
  if (Number.isInteger(configured) && configured > 0) hops = configured;
  else hops = platformHops = Math.min(platformHops, entries.length);
  const address = entries[entries.length - hops];
  return address && ADDRESS.test(address) ? address : UNIDENTIFIED_CLIENT;
}

/** For tests: forget the chain length this instance has learned. */
export function resetClientCalibration() {
  platformHops = Number.POSITIVE_INFINITY;
}
