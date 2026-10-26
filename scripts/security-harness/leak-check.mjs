// An unexpected AWS failure (S3 unreachable in the harness) must reach the person as a generic
// message and a reference — never the bucket, the address, or the SDK's error text.
// Usage, from the repository root after integration.mjs: node scripts/security-harness/leak-check.mjs <run-id>
import path from "node:path";
import { createRequire } from "node:module";

const [run] = process.argv.slice(2);
const require = createRequire(path.join(process.cwd(), "package.json"));
const sharp = require("sharp");
const BASE = "http://localhost:3100", headers = { origin: BASE, "x-forwarded-for": "198.51.100.40" };
const login = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ email: `harness-x-${run}@example.test`, password: `Harness-${run}-Pass1` }) });
const cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
const photo = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 30, g: 40, b: 90 } } }).png().toBuffer();
const form = new FormData();
form.set("name", "Harness Leak Check"); form.set("sku", `LEAK-${run}`); form.set("category", "top"); form.set("subtype", "t-shirt");
form.set("front", new File([photo], "front.png", { type: "image/png" }));
const response = await fetch(`${BASE}/api/brand/products`, { method: "POST", headers: { ...headers, cookie }, body: form });
const text = await response.text();
console.log(`login ${login.status}; enrollment ${response.status}; body ${text}`);
const leaks = /ECONNREFUSED|127\.0\.0\.1|racked-harness|bucket|S3|stack|at \w+ \(/i.test(text);
const json = JSON.parse(text);
console.log(`${!leaks && /^[0-9a-f]{8}$/.test(json.reference ?? "") ? "PASS" : "FAIL"}  an unexpected AWS fault is answered generically, with a reference (${json.reference})`);
