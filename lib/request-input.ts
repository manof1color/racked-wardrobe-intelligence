import { RequestRefused } from "./api-errors.ts";
import { BodyTooLargeError, readCappedJson } from "./request-body.ts";
import { MAX_JSON_BODY_BYTES } from "./request-guard.ts";

/**
 * Runtime checks for request bodies.
 *
 * `await request.json() as { itemIds?: string[] }` describes a body; it checks nothing. A client
 * can send a number where a string belongs, ten thousand IDs where ten are allowed, or a field the
 * route never meant to accept, and the cast lets all of it through to the store. These readers
 * check the shape at the boundary and refuse with a message the person can act on
 * (`RequestRefused`, lib/api-errors.ts), before anything is read or written.
 *
 * Identity never comes from here: the account is always the verified session's. A body field that
 * names an owner, a role, or a verification state is refused, not ignored, by `onlyFields`.
 */

/** Racked's record IDs: UUIDs, `registry-…` product IDs, and the short seeded IDs of the demo. */
export const RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export type JsonObject = Record<string, unknown>;

/** The body as a plain JSON object, read under the JSON cap whatever Content-Length claimed. */
export async function readJsonObject(request: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<JsonObject> {
  let body: unknown;
  try {
    body = await readCappedJson(request, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw new RequestRefused("That request is too large.", 413);
    throw new RequestRefused("Send the request as JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestRefused("Send the request as a JSON object.");
  return body as JsonObject;
}

/** Refuses any field the route does not accept — an `ownerId`, a `role`, a `verified` flag. */
export function onlyFields(body: JsonObject, allowed: readonly string[]) {
  const unexpected = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new RequestRefused(`This request does not accept ${unexpected.length === 1 ? "the field" : "the fields"} ${unexpected.slice(0, 3).map((key) => `"${key.slice(0, 40)}"`).join(", ")}.`);
}

export function readId(value: unknown, label: string): string {
  if (typeof value !== "string" || !RECORD_ID.test(value.trim())) throw new RequestRefused(`Choose a valid ${label}.`);
  return value.trim();
}

export function readOptionalId(value: unknown, label: string): string | null {
  return value === undefined || value === null || value === "" ? null : readId(value, label);
}

/**
 * A list of IDs, every one checked before any is used, so a multi-item change is refused whole
 * rather than applied in part. Duplicates collapse; the length is checked before and after.
 */
export function readIdList(value: unknown, options: { label: string; min: number; max: number }): string[] {
  const { label, min, max } = options;
  const range = min === max ? `${min}` : `${min}–${max}`;
  if (!Array.isArray(value) || value.length > max * 2) throw new RequestRefused(`Choose ${range} ${label}.`);
  const ids = [...new Set(value.map((entry) => readId(entry, label.replace(/s$/, ""))))];
  if (ids.length < min || ids.length > max) throw new RequestRefused(`Choose ${range} ${label}.`);
  return ids;
}

export function readText(value: unknown, options: { label: string; max: number; min?: number; optional?: boolean }): string {
  const { label, max, min = 0, optional = false } = options;
  if ((value === undefined || value === null) && optional) return "";
  if (typeof value !== "string") throw new RequestRefused(`Enter ${label}.`);
  const text = value.trim();
  if (text.length < min || text.length > max) throw new RequestRefused(`${label[0].toUpperCase()}${label.slice(1)} must be ${min ? `${min}–` : "at most "}${max} characters.`);
  return text;
}

export function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new RequestRefused(`${label} must be true or false.`);
  return value;
}
