// Local DynamoDB for the integration harness: dynalite (in memory) on 4567, and a proxy on 4568
// that forwards every call unchanged except TransactWriteItems, which dynalite does not implement.
// The proxy emulates it all-or-nothing: it snapshots each target item, applies each conditional
// write in order, and on the first failed condition restores every snapshot and answers with
// DynamoDB's TransactionCanceledException and per-item CancellationReasons. Single-client only:
// it is not isolated against a concurrent writer, which the harness never runs during a transaction.
//
// Usage: node dynamo.mjs <dynalite-env-dir> <table-name>
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";

const [envDir, tableName] = process.argv.slice(2);
const require = createRequire(path.join(envDir, "package.json"));
const dynalite = require("dynalite");

const UPSTREAM = 4567, PROXY = 4568;
await new Promise((resolve, reject) => dynalite({ createTableMs: 0, deleteTableMs: 0, updateTableMs: 0 }).listen(UPSTREAM, "127.0.0.1", (error) => (error ? reject(error) : resolve())));

const auth = { "Authorization": "AWS4-HMAC-SHA256 Credential=harness/20260101/us-east-2/dynamodb/aws4_request, SignedHeaders=host;x-amz-date, Signature=0", "X-Amz-Date": "20260101T000000Z" };
async function upstream(action, body) {
  const response = await fetch(`http://127.0.0.1:${UPSTREAM}/`, { method: "POST", headers: { ...auth, "Content-Type": "application/x-amz-json-1.0", "X-Amz-Target": `DynamoDB_20120810.${action}` }, body: JSON.stringify(body) });
  return { status: response.status, json: await response.json().catch(() => ({})) };
}

await upstream("CreateTable", {
  TableName: tableName, BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: ["PK", "SK", "GSI1PK", "GSI1SK"].map((name) => ({ AttributeName: name, AttributeType: "S" })),
  KeySchema: [{ AttributeName: "PK", KeyType: "HASH" }, { AttributeName: "SK", KeyType: "RANGE" }],
  GlobalSecondaryIndexes: [{ IndexName: "GSI1", KeySchema: [{ AttributeName: "GSI1PK", KeyType: "HASH" }, { AttributeName: "GSI1SK", KeyType: "RANGE" }], Projection: { ProjectionType: "ALL" } }],
});

const keyOf = (operation) => operation.Key ?? { PK: operation.Item.PK, SK: operation.Item.SK };
const actionOf = { Put: "PutItem", Update: "UpdateItem", Delete: "DeleteItem" };

async function transact(request) {
  const items = request.TransactItems ?? [];
  const seen = new Set();
  for (const entry of items) {
    const [kind] = Object.keys(entry);
    if (!actionOf[kind]) return { status: 400, json: { __type: "com.amazon.coral.validate#ValidationException", message: `Harness proxy does not emulate ${kind}` } };
    const key = JSON.stringify(keyOf(entry[kind]));
    if (seen.has(key)) return { status: 400, json: { __type: "com.amazon.coral.validate#ValidationException", message: "Transaction request cannot include multiple operations on one item" } };
    seen.add(key);
  }
  const applied = [];
  for (const [index, entry] of items.entries()) {
    const [kind] = Object.keys(entry);
    const operation = entry[kind];
    const before = await upstream("GetItem", { TableName: operation.TableName, Key: keyOf(operation), ConsistentRead: true });
    const result = await upstream(actionOf[kind], operation);
    if (result.status !== 200) {
      for (const done of applied.reverse()) {
        if (done.snapshot) await upstream("PutItem", { TableName: done.table, Item: done.snapshot });
        else await upstream("DeleteItem", { TableName: done.table, Key: done.key });
      }
      const conditional = String(result.json.__type ?? "").includes("ConditionalCheckFailed");
      if (!conditional) return result;
      const reasons = items.map((_, position) => (position === index ? { Code: "ConditionalCheckFailed", Message: "The conditional request failed" } : { Code: "None" }));
      return { status: 400, json: { __type: "com.amazonaws.dynamodb.v20120810#TransactionCanceledException", message: `Transaction cancelled, please refer cancellation reasons for specific reasons [${reasons.map((reason) => reason.Code).join(", ")}]`, CancellationReasons: reasons } };
    }
    applied.push({ table: operation.TableName, key: keyOf(operation), snapshot: before.json.Item ?? null });
  }
  return { status: 200, json: {} };
}

http.createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const target = String(request.headers["x-amz-target"] ?? "");
  try {
    if (target.endsWith(".TransactWriteItems")) {
      const result = await transact(JSON.parse(body.toString("utf8")));
      response.writeHead(result.status, { "Content-Type": "application/x-amz-json-1.0" });
      response.end(JSON.stringify(result.json));
      return;
    }
    // The DynamoDB API is a POST to "/": the caller's path is never forwarded.
    const forwarded = await fetch(`http://127.0.0.1:${UPSTREAM}/`, { method: request.method, headers: Object.fromEntries(Object.entries(request.headers).filter(([name]) => !["host", "content-length", "connection"].includes(name))), body: body.length ? body : undefined });
    response.writeHead(forwarded.status, { "Content-Type": forwarded.headers.get("content-type") ?? "application/x-amz-json-1.0" });
    response.end(Buffer.from(await forwarded.arrayBuffer()));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/x-amz-json-1.0" });
    console.error("Harness proxy failure", error instanceof Error ? error.name : "UnknownError");
    response.end(JSON.stringify({ __type: "InternalServerError", message: "The harness proxy failed." }));
  }
// Both servers listen on loopback only: nothing else on the network can reach the harness.
}).listen(PROXY, "127.0.0.1", () => console.log(`dynamo proxy ready on 127.0.0.1:${PROXY} (table ${tableName})`));
