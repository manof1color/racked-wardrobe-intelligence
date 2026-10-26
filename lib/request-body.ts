import { maxBodyBytes } from "./request-guard.ts";

/**
 * Reads a request body with a hard byte cap, counting what actually arrives.
 *
 * The middleware refuses a declared Content-Length over the cap, but `request.formData()` and
 * `request.json()` read whatever comes. These readers stop the moment the running total passes the
 * cap — before buffering the rest — so a body that declares no length, or a smaller one than it
 * sends, cannot make a route hold more than the cap in memory.
 */
/** One photo (each is capped at 5 MB) plus the form around it. */
export const SINGLE_PHOTO_BODY_BYTES = 6 * 1024 * 1024;
/**
 * The largest image, in pixels, any upload is decoded at. A small compressed file can expand to
 * gigabytes of pixels; 64 megapixels sits above the largest phone cameras (about 50 MP).
 */
export const MAX_INPUT_PIXELS = 64_000_000;

export class BodyTooLargeError extends Error {
  readonly status = 413;
  constructor() {
    super("That request is too large.");
    this.name = "BodyTooLargeError";
  }
}

export class MalformedBodyError extends Error {
  readonly status = 400;
  constructor(message = "That request could not be read.") {
    super(message);
    this.name = "MalformedBodyError";
  }
}

export async function readCappedBody(request: Request, maxBytes = maxBodyBytes(request.headers.get("content-type"))): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();
  if (!request.body) return new Uint8Array(new ArrayBuffer(0));
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const body = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** A multipart form, read under the upload cap. */
export async function readCappedFormData(request: Request, maxBytes?: number): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) throw new MalformedBodyError("Send the photo as a form upload.");
  const body = await readCappedBody(request, maxBytes);
  try {
    return await new Response(body, { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new MalformedBodyError();
  }
}

/** A JSON body, read under the JSON cap. Returns null for an empty or unreadable body. */
export async function readCappedJson(request: Request, maxBytes?: number): Promise<unknown> {
  const body = await readCappedBody(request, maxBytes ?? maxBodyBytes("application/json"));
  if (body.byteLength === 0) return null;
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
}
