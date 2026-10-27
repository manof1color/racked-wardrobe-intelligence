// Owner-run CloudShell tool. Default is read-only; importing this module never contacts AWS.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectReferences, deletionAllowed, isCandidate, photoSummary, referenceIndex, sameObject } from "./lib/unreferenced-photos.mjs";

export function parseOptions(args, environment) {
  if (args.some(arg => arg !== "--delete" && arg !== "--help") || new Set(args).size !== args.length) throw new Error("invalid-options");
  const deleteRequested = args.includes("--delete");
  if (deleteRequested && !deletionAllowed(deleteRequested, environment.ALLOW_RACKED_PHOTO_CLEANUP)) throw new Error("delete-opt-in-required");
  return { deleteRequested, help: args.includes("--help") };
}

export async function listWardrobeObjects(api, bucket) {
  const objects = [];
  const seenKeys = new Set();
  const seenTokens = new Set();
  let token;
  do {
    const page = await api.list({ Bucket: bucket, Prefix: "wardrobe/", ...(token ? { ContinuationToken: token } : {}) });
    for (const object of page.Contents ?? []) {
      // Reject a wrong-prefix response rather than permit an over-broad inventory.
      if (typeof object.Key !== "string" || !object.Key.startsWith("wardrobe/")) throw new Error("unexpected-prefix");
      if (seenKeys.has(object.Key)) throw new Error("duplicate-object");
      seenKeys.add(object.Key);
      objects.push(object);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && (!token || seenTokens.has(token))) throw new Error("incomplete-object-list");
    if (token) seenTokens.add(token);
  } while (token);
  return objects;
}

export async function tableReferences(api, table, keys) {
  const index = referenceIndex(keys);
  const found = new Set();
  const tokens = new Set();
  let start;
  do {
    // No projection, filter or index: every attribute of every item must be inspected.
    const page = await api.scan({ TableName: table, ConsistentRead: true, ...(start ? { ExclusiveStartKey: start } : {}) });
    for (const item of page.Items ?? []) collectReferences(item, index, found);
    start = page.LastEvaluatedKey && Object.keys(page.LastEvaluatedKey).length ? page.LastEvaluatedKey : undefined;
    if (start) {
      const token = JSON.stringify(start);
      if (tokens.has(token)) throw new Error("incomplete-table-scan");
      tokens.add(token);
    }
  } while (start);
  return found;
}

// The injected transport makes pagination, refusal and deletion ordering testable without AWS.
export async function auditPhotos(api, { table, bucket, deleteRequested = false, cleanupConsent = "", now = Date.now() }) {
  if (deleteRequested && !deletionAllowed(deleteRequested, cleanupConsent)) throw new Error("delete-opt-in-required");
  if (!table || !bucket) throw new Error("missing-resource-names");
  const objects = await listWardrobeObjects(api, bucket);
  const referenced = await tableReferences(api, table, objects.map(object => object.Key));
  const summary = photoSummary(objects, referenced, now);
  const result = { ...summary, deletedObjects: 0, deletedBytes: 0, retainedOnRecheck: 0 };
  if (!deleteRequested) return result;
  for (const object of objects) {
    if (!isCandidate(object, referenced, now)) continue;
    // Check that no replacement/overwrite happened, then scan the entire table afresh for THIS key.
    // IfMatch checks byte identity, not a database lock or same-byte overwrite: pause writes.
    const current = await api.head({ Bucket: bucket, Key: object.Key });
    if (!sameObject(object, current)) { result.retainedOnRecheck++; continue; }
    const latest = await tableReferences(api, table, [object.Key]);
    if (!isCandidate(object, latest, now)) { result.retainedOnRecheck++; continue; }
    await api.remove({ Bucket: bucket, Key: object.Key, IfMatch: object.ETag });
    result.deletedObjects++;
    result.deletedBytes += object.Size;
  }
  return result;
}

export async function main(args = process.argv.slice(2), environment = process.env) {
  const options = parseOptions(args, environment);
  if (options.help) {
    console.log("Owner-run photo audit: set RACKED_TABLE_NAME and RACKED_UPLOAD_BUCKET; run with no flags for counts-only dry run. Deletion requires --delete and ALLOW_RACKED_PHOTO_CLEANUP=yes. Pause concurrent writes before cleanup.");
    return;
  }
  const table = environment.RACKED_TABLE_NAME;
  const bucket = environment.RACKED_UPLOAD_BUCKET;
  if (!table || !bucket) throw new Error("missing-resource-names");
  const [{ DynamoDBClient, ScanCommand }, { S3Client, ListObjectsV2Command, HeadObjectCommand, DeleteObjectCommand }] = await Promise.all([
    import("@aws-sdk/client-dynamodb"), import("@aws-sdk/client-s3"),
  ]);
  const region = environment.AWS_REGION ?? environment.AWS_DEFAULT_REGION ?? "us-east-2";
  const db = new DynamoDBClient({ region });
  const s3 = new S3Client({ region });
  try {
    const summary = await auditPhotos({
      list: input => s3.send(new ListObjectsV2Command(input)),
      scan: input => db.send(new ScanCommand(input)),
      head: input => s3.send(new HeadObjectCommand(input)),
      remove: input => s3.send(new DeleteObjectCommand(input)),
    }, { table, bucket, deleteRequested: options.deleteRequested, cleanupConsent: environment.ALLOW_RACKED_PHOTO_CLEANUP });
    console.log(JSON.stringify(summary));
  } finally { db.destroy(); s3.destroy(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // SDK error messages/stacks may contain keys, account IDs and URLs. Never print them.
    const safe = new Set(["invalid-options", "delete-opt-in-required", "missing-resource-names"]);
    console.error(JSON.stringify({ error: safe.has(error?.message) ? error.message : "photo-audit-failed" }));
    process.exitCode = 1;
  });
}
