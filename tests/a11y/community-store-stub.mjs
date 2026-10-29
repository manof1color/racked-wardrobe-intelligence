// A local stand-in for DynamoDB, used only by the accessibility checks so the server-rendered
// /community page has fixture posts to show. It listens on 127.0.0.1, answers reads with invented
// posts, and refuses every write. `next start` reaches it through AWS_ENDPOINT_URL_DYNAMODB with
// fixture credentials, so nothing the checks run can reach a real table.
import { createServer } from "node:http";

const port = Number(process.env.A11Y_STORE_PORT ?? 4599);

function attribute(value) {
  if (value === null || value === undefined) return { NULL: true };
  if (typeof value === "string") return { S: value };
  if (typeof value === "number") return { N: String(value) };
  if (typeof value === "boolean") return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map(attribute) };
  return { M: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, attribute(entry)])) };
}

const garment = (publicGarmentId, name, category, unverifiedBrandLabel) => ({ publicGarmentId, name, category, color: "indigo", resolutionState: "GENERIC_UNVERIFIED", ...(unverifiedBrandLabel ? { unverifiedBrandLabel } : {}) });

const posts = [
  { PK: "COMMUNITY", SK: "POST#2", id: "fixture-post-2", handle: "fixture_stylist", outfitTitle: "Weekend denim", caption: "A fixture post for accessibility checks.", createdAt: "2026-10-26T12:00:00.000Z", likes: 4, sourceType: "consumer", fictional: true, dataClassification: "DEMO", publishedGarments: [garment("g1", "White tee", "top"), garment("g2", "Indigo jean", "bottom", "Fixture Denim Co")] },
  { PK: "COMMUNITY", SK: "POST#1", id: "fixture-post-1", handle: "fixture_brand", outfitTitle: "Utility layers", caption: "Another invented post.", createdAt: "2026-10-25T12:00:00.000Z", likes: 2, sourceType: "brand", fictional: true, dataClassification: "DEMO", publishedGarments: [garment("g3", "Olive jacket", "outerwear")] },
];

const READS = new Set(["Query", "GetItem", "Scan", "BatchGetItem"]);

createServer((request, response) => {
  let body = "";
  request.on("data", chunk => { body += chunk; });
  request.on("end", () => {
    if (request.method === "GET") return response.end("accessibility fixture store");
    const operation = String(request.headers["x-amz-target"] ?? "").split(".").pop();
    response.setHeader("content-type", "application/x-amz-json-1.0");
    if (!READS.has(operation)) {
      response.statusCode = 400;
      response.end(JSON.stringify({ __type: "com.amazonaws.dynamodb.v20120810#ValidationException", message: "The accessibility fixture store is read-only." }));
      return;
    }
    let input = {};
    try { input = JSON.parse(body || "{}"); } catch { /* answered as an empty read */ }
    const community = input.ExpressionAttributeValues?.[":pk"]?.S === "COMMUNITY";
    if (operation === "GetItem") return response.end(JSON.stringify({}));
    if (operation === "BatchGetItem") return response.end(JSON.stringify({ Responses: {} }));
    const items = community ? posts.map(post => attribute(post).M) : [];
    response.end(JSON.stringify({ Items: items, Count: items.length, ScannedCount: items.length }));
  });
}).listen(port, "127.0.0.1", () => console.log(`accessibility fixture store on http://127.0.0.1:${port}`));
