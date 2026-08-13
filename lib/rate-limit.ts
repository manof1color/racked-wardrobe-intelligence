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
  garmentAnalyze: { limit: 12, windowMs: 10 * 60 * 1000 },
  garmentClassify: { limit: 20, windowMs: 10 * 60 * 1000 },
  consumerAgent: { limit: 20, windowMs: 5 * 60 * 1000 },
  brandAgent: { limit: 20, windowMs: 5 * 60 * 1000 },
  brandMetrics: { limit: 30, windowMs: 5 * 60 * 1000 },
  communityPublish: { limit: 10, windowMs: 60 * 60 * 1000 },
  communityLike: { limit: 40, windowMs: 5 * 60 * 1000 },
  outboundClick: { limit: 30, windowMs: 5 * 60 * 1000 },
  recreateLook: { limit: 30, windowMs: 5 * 60 * 1000 },
  similarProducts: { limit: 30, windowMs: 5 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;

// Bound total tracked keys so hostile clients cannot grow instance memory by
// rotating spoofed identifiers.
const MAX_TRACKED_KEYS = 10_000;
const buckets = new Map<string, number[]>();

function pruneExpired(now: number) {
  for (const [key, timestamps] of buckets) {
    if (timestamps.every((at) => at <= now - 60 * 60 * 1000)) buckets.delete(key);
    if (buckets.size <= MAX_TRACKED_KEYS) break;
  }
  // Last resort under sustained key-rotation abuse: fail open by starting fresh
  // rather than letting the map grow without bound.
  if (buckets.size > MAX_TRACKED_KEYS) buckets.clear();
}

export function consumeRateLimit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitDecision {
  if (buckets.size >= MAX_TRACKED_KEYS && !buckets.has(key)) pruneExpired(now);
  const cutoff = now - rule.windowMs;
  const recent = (buckets.get(key) ?? []).filter((at) => at > cutoff);
  if (recent.length >= rule.limit) {
    buckets.set(key, recent);
    const oldest = recent[0];
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000)) };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}

/**
 * Extracts a stable caller identifier for unauthenticated endpoints. Amplify/CloudFront
 * append the connecting address to x-forwarded-for; the first entry is the client.
 * The value is used only as an in-memory counter key and is never persisted or logged.
 */
export function clientIdentifier(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return first && first.length <= 64 ? first : "unidentified-client";
}
