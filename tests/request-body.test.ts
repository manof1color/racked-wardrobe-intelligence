/**
 * Body caps that hold whatever the headers claim. The middleware sees only the declared length;
 * these readers count the bytes that actually arrive and stop at the cap, so a body with no length,
 * or a smaller declared length than it sends, cannot make a route buffer more than the cap.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { BodyTooLargeError, MalformedBodyError, readCappedBody, readCappedFormData, readCappedJson } from "../lib/request-body.ts";
import { stripImageMetadata } from "../lib/image-sanitize.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** A body delivered in 1 KB chunks that records how many were pulled. */
function streamingRequest(totalBytes: number, headers: Record<string, string> = {}) {
  let pulled = 0;
  const chunk = new Uint8Array(1024).fill(97);
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled * 1024 >= totalBytes) return controller.close();
      pulled++;
      controller.enqueue(chunk);
    },
  });
  const request = new Request("https://racked.example/api/x", { method: "POST", body, headers, duplex: "half" } as RequestInit);
  return { request, pulled: () => pulled };
}

test("a body with no declared length is stopped at the cap, without reading the rest", async () => {
  const { request, pulled } = streamingRequest(10 * 1024 * 1024);
  await assert.rejects(readCappedBody(request, 8 * 1024), BodyTooLargeError);
  assert.ok(pulled() <= 10, `stopped after ${pulled()} KB of a 10 MB body`);
});

test("REGRESSION: a body that declares less than it sends is stopped at the cap", async () => {
  const { request, pulled } = streamingRequest(5 * 1024 * 1024, { "content-length": "100" });
  await assert.rejects(readCappedBody(request, 8 * 1024), BodyTooLargeError);
  assert.ok(pulled() <= 10);
});

test("a declared length over the cap is refused before anything is read", async () => {
  const { request, pulled } = streamingRequest(1024, { "content-length": String(50 * 1024 * 1024) });
  await assert.rejects(readCappedBody(request, 8 * 1024), BodyTooLargeError);
  assert.ok(pulled() <= 1, "no more than the one chunk a stream prefetches when it is created");
});

test("bodies within the cap read normally", async () => {
  const json = new Request("https://racked.example/api/x", { method: "POST", body: JSON.stringify({ message: "hello" }), headers: { "content-type": "application/json" } });
  assert.deepEqual(await readCappedJson(json), { message: "hello" });
  assert.equal(await readCappedJson(new Request("https://racked.example/api/x", { method: "POST", body: "not json" })), null);
  const form = new FormData();
  form.set("photo", new File([new Uint8Array(2048)], "piece.jpg", { type: "image/jpeg" }));
  const upload = new Request("https://racked.example/api/x", { method: "POST", body: form });
  const parsed = await readCappedFormData(upload, 64 * 1024);
  assert.equal((parsed.get("photo") as File).size, 2048);
});

test("a form upload must be multipart, and over-cap uploads are refused", async () => {
  await assert.rejects(readCappedFormData(new Request("https://racked.example/api/x", { method: "POST", body: "x", headers: { "content-type": "text/plain" } })), MalformedBodyError);
  const form = new FormData();
  form.set("photo", new File([new Uint8Array(100 * 1024)], "big.jpg", { type: "image/jpeg" }));
  // Encoded to bytes first, as a real upload arrives off the network.
  const encoded = new Response(form);
  const bytes = new Uint8Array(await encoded.arrayBuffer());
  const oversized = new Request("https://racked.example/api/x", { method: "POST", body: bytes, headers: { "content-type": encoded.headers.get("content-type")! } });
  await assert.rejects(readCappedFormData(oversized, 32 * 1024), BodyTooLargeError);
});

test("every photo route reads its upload through the capped reader", () => {
  for (const route of ["app/api/garments/detect/route.ts", "app/api/brand/products/describe/route.ts", "app/api/brand/products/route.ts"]) {
    const source = read(route);
    assert.match(source, /readCappedFormData\(request/, route);
    assert.doesNotMatch(source, /request\.formData\(\)/, `${route} never reads an uncapped form`);
  }
});

test("an image too large to decode safely is refused before decoding", async () => {
  const small = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#cfc5ff" } }).png().toBuffer();
  await assert.rejects(stripImageMetadata(small, 100), /not a readable image/, "1,600 pixels against a 100-pixel limit");
  assert.equal((await stripImageMetadata(small, 10_000)).contentType, "image/png");
  for (const route of ["app/api/garments/detect/route.ts", "app/api/brand/products/describe/route.ts"]) {
    assert.match(read(route), /limitInputPixels:\s*MAX_INPUT_PIXELS/, route);
  }
});
