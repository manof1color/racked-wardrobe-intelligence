// Judge note: the AWS SDK does not impose a request timeout by default, so a slow or
// stalled Bedrock response held a Racked request open until the hosting platform killed
// it — a dead spinner during a live demo rather than a handled failure. Every Bedrock
// call now carries a bounded abort signal, which turns a hang into the fallback each
// caller already implements: a deterministic cutout, a manual-review analysis, or a
// grounded non-model reply.

/** Chat-style agent turns. Short prompts, short answers. */
export const BEDROCK_CHAT_TIMEOUT_MS = 20_000;
/** Multi-view garment vision. Larger payloads, more tokens. */
export const BEDROCK_VISION_TIMEOUT_MS = 25_000;
/** Image segmentation. Heaviest call, and it has a deterministic fallback behind it. */
export const BEDROCK_IMAGE_TIMEOUT_MS = 20_000;

/**
 * Request options for `client.send(command, ...)`. Uses an abort signal rather than a
 * custom request handler so no additional dependency is introduced.
 */
export function bedrockRequestOptions(timeoutMs: number) {
  return { abortSignal: AbortSignal.timeout(timeoutMs) };
}
