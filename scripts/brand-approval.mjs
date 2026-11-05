// The owner's brand approval commands (docs/brand-approval.md). A brand account registered since
// 2026-10-27 starts pending and can do nothing until the owner approves it here.
//
//   pnpm brands:pending                 brands waiting for approval (read-only)
//   pnpm brands:list                    every brand account and its status (read-only)
//   pnpm brands:approve <account-id>    approve one, after showing it and asking to confirm
//   pnpm brands:revoke <account-id>     revoke one: every brand route refuses it and its products
//                                       leave the public registry; nothing is deleted
//
// It uses the owner's own AWS sign-in (`aws login --profile racked-benchmark`, or AWS CloudShell).
// RACKED_TABLE_NAME defaults to the production table; AWS_REGION to us-east-2. `--yes` skips the
// confirmation for approve and revoke. Only the one PROFILE item's brandStatus is ever written, and
// only if that item is a brand account.

import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

export const DEFAULT_TABLE = "racked-production";
export const DEFAULT_PROFILE = "racked-benchmark";
/** The seeded judge brands are shared demos (SHARED_DEMO_ACCOUNTS in lib/demo-session.ts); their status is the seed's. */
export const PROTECTED_ACCOUNTS = ["judge-brand-account", "judge-fresh-brand-account"];
/** A New Brand demo's id (lib/demo-session.ts): private, temporary, approved by design, never listed. */
export const DEMO_ACCOUNT_PREFIX = "demo-session-";

/** The same reading as brandStatusOf in lib/brand-approval.ts: no status is approved (brands from before approval existed). */
export function statusOf(item) {
  if (item.brandStatus === undefined || item.brandStatus === "approved") return "approved";
  return item.brandStatus === "revoked" ? "revoked" : "pending";
}

/** What a command line asks for, or why it cannot run. */
export function parseCommand(argv) {
  const [action, id, ...rest] = argv;
  const yes = rest.includes("--yes") || id === "--yes";
  if (action === "pending" || action === "list") return { action };
  if (action !== "approve" && action !== "revoke") return { error: "Use: pending | list | approve <account-id> | revoke <account-id> [--yes]" };
  if (!id || id === "--yes") return { error: `Give the account id to ${action}, from \`pnpm brands:pending\`.` };
  if (!/^[A-Za-z0-9-]{8,128}$/.test(id)) return { error: "That does not look like an account id." };
  if (id.startsWith(DEMO_ACCOUNT_PREFIX)) return { error: "That is a temporary demo brand; it is approved by design and expires on its own." };
  if (PROTECTED_ACCOUNTS.includes(id)) return { error: "That is a shared judge account; its status is set by the judge seed." };
  return { action, id, yes };
}

/** Brand accounts as rows to show, oldest first. Demo brands are left out. */
export function brandRows(items, only) {
  return items
    .filter((item) => item.role === "brand" && !String(item.id ?? "").startsWith(DEMO_ACCOUNT_PREFIX))
    .map((item) => ({ id: String(item.id), status: statusOf(item), brand: String(item.brandName ?? ""), email: String(item.email ?? ""), created: String(item.createdAt ?? "").slice(0, 10) }))
    .filter((row) => !only || row.status === only)
    .sort((a, b) => a.created.localeCompare(b.created));
}

/** The one write either command makes: this account's status, only if it is a brand account. */
export function statusUpdate(table, id, status, now = new Date()) {
  return {
    TableName: table,
    Key: { PK: `USER#${id}`, SK: "PROFILE" },
    UpdateExpression: "SET brandStatus = :status, brandStatusChangedAt = :at",
    ConditionExpression: "attribute_exists(PK) AND #role = :brand",
    ExpressionAttributeNames: { "#role": "role" },
    ExpressionAttributeValues: { ":status": status, ":brand": "brand", ":at": now.toISOString() },
  };
}

async function main() {
  const command = parseCommand(process.argv.slice(2));
  if (command.error) { console.error(command.error); process.exitCode = 1; return; }
  if (!process.env.AWS_PROFILE && !process.env.AWS_ACCESS_KEY_ID) process.env.AWS_PROFILE = DEFAULT_PROFILE;
  const table = process.env.RACKED_TABLE_NAME ?? DEFAULT_TABLE;
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-2";
  const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient, GetCommand, ScanCommand, UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

  if (command.action === "pending" || command.action === "list") {
    // One filtered scan of the table: a few cents at most. Only these fields are read.
    const items = [];
    let startKey;
    do {
      const page = await db.send(new ScanCommand({ TableName: table, FilterExpression: "#role = :brand AND SK = :profile", ProjectionExpression: "id, email, brandName, createdAt, brandStatus, #role", ExpressionAttributeNames: { "#role": "role" }, ExpressionAttributeValues: { ":brand": "brand", ":profile": "PROFILE" }, ...(startKey ? { ExclusiveStartKey: startKey } : {}) }));
      items.push(...(page.Items ?? []));
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    const rows = brandRows(items, command.action === "pending" ? "pending" : undefined);
    if (!rows.length) { console.log(command.action === "pending" ? "No brand accounts are waiting for approval." : "No brand accounts."); return; }
    console.table(rows);
    if (command.action === "pending") console.log("Approve one with: pnpm brands:approve <id>   (or revoke with pnpm brands:revoke <id>)");
    return;
  }

  const found = (await db.send(new GetCommand({ TableName: table, Key: { PK: `USER#${command.id}`, SK: "PROFILE" }, ConsistentRead: true }))).Item;
  if (!found || found.role !== "brand") { console.error("No brand account has that id."); process.exitCode = 1; return; }
  const status = command.action === "approve" ? "approved" : "revoked";
  console.log(`${found.brandName ?? "(no brand name)"} · ${found.email ?? ""} · registered ${String(found.createdAt ?? "").slice(0, 10)} · now ${statusOf(found)}`);
  if (statusOf(found) === status) { console.log(`Already ${status}; nothing changed.`); return; }
  if (!command.yes) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question(`Type "${command.action}" to ${command.action} this brand: `);
    prompt.close();
    if (answer.trim().toLowerCase() !== command.action) { console.log("Nothing changed."); return; }
  }
  await db.send(new UpdateCommand(statusUpdate(table, command.id, status)));
  console.log(`Done: ${found.brandName ?? command.id} is ${status}. It takes effect on the brand's next request.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(`Failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "unknown error"}`); process.exitCode = 1; });
}
