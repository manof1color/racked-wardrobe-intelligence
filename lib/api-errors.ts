/**
 * How a failed request is answered, in one place.
 *
 * A **refusal** is an error whose message was written for the person who made the request —
 * "Choose 1–10 wardrobe pieces", "That product is not in your catalogue" — and its message is
 * returned as is. **Anything else** — a DynamoDB fault, an AWS permission error that names a role
 * and a table, a bug — is answered with a generic message and a short reference, and logged with
 * that reference, the error's name, and its HTTP status, never its message or stack: those can
 * carry account IDs, resource names, or what the person typed. The reference is how a support
 * question finds the log line.
 *
 * Throwing a plain `Error` with a friendly message is therefore not enough to show it to anyone:
 * it must be a `RequestRefused` (or one of the refusals that extend it).
 */
export type RefusalStatus = 400 | 403 | 404 | 409 | 413 | 429 | 503;

export class RequestRefused extends Error {
  // A plain field, set in the constructor: the test runner strips types without compiling.
  readonly status: RefusalStatus;
  constructor(message: string, status: RefusalStatus = 400) {
    super(message);
    this.name = "RequestRefused";
    this.status = status;
  }
}

export function failureReference() {
  return crypto.randomUUID().slice(0, 8);
}

/** Logs an unexpected failure by name and status only, and returns the reference it logged under. */
export function logFailure(event: string, error: unknown, reference = failureReference()) {
  const detail = (error && typeof error === "object" ? error : {}) as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  const status = detail.$metadata?.httpStatusCode;
  console.error(event, {
    reference,
    name: typeof detail.name === "string" ? detail.name.slice(0, 80) : "UnknownError",
    ...(typeof status === "number" ? { status } : {}),
  });
  return reference;
}

/** The response for a failed request: a refusal's own words, or a generic message and a reference. */
export function failureResponse(error: unknown, event: string, fallback: string, status = 500): Response {
  if (error instanceof RequestRefused) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: fallback, reference: logFailure(event, error) }, { status });
}
