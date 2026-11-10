// Replays the requests Hanger lost in the blind evaluation, two ways, with a scripted model:
//
//   direct  runHangerAgent called the way the benchmark called it (rankingBase: {}, no fallback)
//   route   POST /api/agents/consumer on a local production build, signed in as a synthetic
//           consumer whose closet is the synthetic fixture — the route, store and agent a person uses
//
// and checks what comes back: is the outfit card complete, did a swap change only the slot asked
// for, do the card, the Save action and the stored active outfit agree, and do different occasions
// lead with different outfits. Nothing here can reach AWS: DynamoDB is the local emulator and
// Bedrock is scripts/security-harness/bedrock-mock.mjs. See docs/hanger-evaluation-diagnosis.md.
//
//   HARNESS_SESSION_SECRET=<the local server's SESSION_SECRET> \
//   node --experimental-strip-types scripts/security-harness/hanger-replay.mjs [--direct-only] [--out file.json]
//
// It imports only what the evaluated commit already exported, so the same file runs against the
// commit that was evaluated and against a fix.
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runHangerAgent } from "../../lib/hanger-agent.ts";
import { buildForecast, isInside, outfitProblems, toWardrobeItem } from "../../lib/hanger-evaluation.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURES = path.join(ROOT, "data", "hanger-eval");
const args = process.argv.slice(2);
const directOnly = args.includes("--direct-only");
const outFile = args.includes("--out") ? path.resolve(args[args.indexOf("--out") + 1]) : null;
if (outFile && isInside(outFile, ROOT)) throw new Error("--out must be outside this repository.");

const readJson = (file) => JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8"));
const closets = new Map(["closet-a", "closet-b", "closet-c", "closet-d"].map((id) => [id, readJson(`${id}.json`)]));
const requests = new Map(readJson("requests.json").requests.map((request) => [request.id, request]));
const cases = readJson("replay-cases.json").cases;

// ── Checks ──────────────────────────────────────────────────────────────────
/** Why a swap is not the swap that was asked for; empty means exactly one slot changed. */
function swapProblems(before, after, category) {
  if (!after.length) return ["no outfit offered"];
  const problems = [];
  const afterIds = new Set(after.map((piece) => piece.id));
  const kept = before.filter((piece) => piece.category !== category);
  for (const piece of kept) if (!afterIds.has(piece.id)) problems.push(`dropped ${piece.name}`);
  const replaced = after.filter((piece) => piece.category === category);
  if (replaced.length !== 1) problems.push(`has ${replaced.length} pieces in the ${category} slot`);
  else if (before.some((piece) => piece.id === replaced[0].id)) problems.push(`did not change the ${category}`);
  const allowed = new Set([...kept.map((piece) => piece.id), ...replaced.map((piece) => piece.id)]);
  for (const piece of after) if (!allowed.has(piece.id)) problems.push(`added ${piece.name}`);
  return problems;
}

const signature = (names) => [...names].sort().join(" | ");

/**
 * `cardIds` is the lead card; `shown` is every card the person sees (names), and `built` every outfit
 * the builder handed the model this turn. An outfit the model was given but the person never sees is
 * how a reply comes to describe pieces that are on no card.
 */
function judge(entry, request, closet, cardIds, shown, built) {
  const pieces = (cardIds ?? []).map((id) => closet.pieces.find((piece) => piece.id === id)).filter(Boolean);
  const before = (request.activeOutfit ?? []).map((id) => closet.pieces.find((piece) => piece.id === id));
  const problems = request.kind === "swap" ? swapProblems(before, pieces, request.swapCategory) : pieces.length ? outfitProblems(pieces) : ["no outfit offered"];
  const onCards = new Set(shown.map(signature));
  const hidden = built.filter((names) => !onCards.has(signature(names)));
  if (hidden.length) problems.push(`${hidden.length} outfit${hidden.length === 1 ? "" : "s"} the model was given ${hidden.length === 1 ? "is" : "are"} on no card`);
  const name = (id) => closet.pieces.find((piece) => piece.id === id)?.name ?? id;
  for (const id of entry.expect?.absent ?? []) if (pieces.some((piece) => piece.id === id)) problems.push(`leads with ${name(id)} (${entry.expect.why})`);
  for (const id of entry.expect?.present ?? []) if (pieces.length && !pieces.some((piece) => piece.id === id)) problems.push(`leads without ${name(id)} (${entry.expect.why})`);
  return { card: pieces.map((piece) => piece.name), problems };
}

const builtOutfits = (toolResults) => toolResults.flatMap((result) => (Array.isArray(result?.outfits) ? result.outfits.map((outfit) => outfit.pieces.map((piece) => piece.name)) : []));

// ── Direct: the agent as the benchmark called it ────────────────────────────
function scriptedModel(entry, toolResults) {
  let position = 0;
  return async (sent) => {
    for (const block of sent.messages.at(-1)?.content ?? []) if (block.toolResult) toolResults.push(JSON.parse(block.toolResult.content[0].text));
    const step = entry.steps[position];
    position += 1;
    return step
      ? { content: [{ toolUse: { toolUseId: `replay-${position}`, name: step.tool, input: step.args ?? {} } }], stopReason: "tool_use" }
      : { content: [{ text: entry.reply }], stopReason: "end_turn" };
  };
}

async function direct(entry) {
  const request = requests.get(entry.id), closet = closets.get(request.closet);
  const wardrobe = closet.pieces.map(toWardrobeItem);
  const byId = new Map(wardrobe.map((item) => [item.id, item]));
  const toolResults = [];
  const warn = console.warn;
  console.warn = () => {};
  const result = await runHangerAgent({
    message: request.text, history: [], wardrobe,
    forecast: request.forecast ? buildForecast(request.forecast, request.today) : null,
    activeOutfit: (request.activeOutfit ?? []).map((id) => byId.get(id)),
    remembered: "", rankingBase: {}, loadTrends: async () => null, today: new Date(`${request.today}T12:00:00Z`),
  }, scriptedModel(entry, toolResults));
  console.warn = warn;
  const outfits = result?.outfits ?? [];
  const verdict = judge(entry, request, closet, (outfits[0] ?? []).map((item) => item.id), outfits.map((outfit) => outfit.map((item) => item.name)), builtOutfits(toolResults));
  return { ...verdict, answeredBy: result ? "agent" : "none (the benchmark recorded no outfit on a fallback)", message: result?.message ?? "" };
}

// ── Route: the real consumer route on a local build ─────────────────────────
const SECRET = process.env.HARNESS_SESSION_SECRET, TABLE = process.env.HARNESS_TABLE ?? "racked-harness";
const BASE = process.env.HARNESS_BASE_URL ?? "http://localhost:3100";
const MODEL = `http://127.0.0.1:${Number(process.env.HARNESS_BEDROCK_PORT ?? 4571) + 1}`;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("The replay only runs against a local server.");

async function routeSetup() {
  if (!SECRET) throw new Error("Set HARNESS_SESSION_SECRET to the local server's SESSION_SECRET, or pass --direct-only.");
  const require = createRequire(path.join(ROOT, "package.json"));
  const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-2", endpoint: "http://127.0.0.1:4568", credentials: { accessKeyId: "harness-local", secretAccessKey: "harness-local" } }));
  const run = randomBytes(6).toString("hex").slice(0, 6), net = 1 + randomInt(250);
  const accounts = new Map();
  let host = 20;
  for (const closet of closets.values()) {
    const jar = new Map(), address = `198.18.${net}.${host++}`, email = `hanger-replay-${closet.id}-${run}@example.test`;
    const call = async (method, route, body) => {
      const cookies = [...jar.values()].filter((cookie) => route.startsWith(cookie.path)).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
      const response = await fetch(`${BASE}${route}`, { method, headers: { origin: BASE, "content-type": "application/json", "x-forwarded-for": address, ...(cookies ? { cookie: cookies } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      for (const header of response.headers.getSetCookie()) {
        const [pair, ...attributes] = header.split(";").map((part) => part.trim());
        const [name, ...value] = pair.split("=");
        const cookiePath = attributes.find((attribute) => attribute.toLowerCase().startsWith("path="))?.slice(5) ?? "/";
        if (/max-age=0/i.test(header) || value.join("=") === "") jar.delete(name); else jar.set(name, { name, value: value.join("="), path: cookiePath });
      }
      return { status: response.status, json: await response.json().catch(() => null) };
    };
    const issuedAt = String(Date.now());
    const formToken = `${issuedAt}.${createHmac("sha256", SECRET).update(`racked-form:${issuedAt}`).digest("base64url")}`;
    accounts.set(closet.id, { call, email, formToken });
  }
  // The sign-up form refuses anything submitted faster than a person could fill it in.
  await new Promise((resolve) => setTimeout(resolve, 2_700));
  for (const [closetId, account] of accounts) {
    const registered = await account.call("POST", "/api/auth/register", { email: account.email, password: `Replay-${run}-Pass1`, role: "consumer", displayName: `Replay ${closetId}`, consent: true, formToken: account.formToken, website: "" });
    if (registered.status !== 201) throw new Error(`Could not register the synthetic consumer for ${closetId}: ${registered.status}`);
    const found = await db.send(new QueryCommand({ TableName: TABLE, IndexName: "GSI1", KeyConditionExpression: "GSI1PK = :pk", ExpressionAttributeValues: { ":pk": `EMAIL#${account.email}` } }));
    account.id = String(found.Items?.[0]?.PK ?? "").replace(/^USER#/, "");
    for (const piece of closets.get(closetId).pieces) {
      await db.send(new PutCommand({ TableName: TABLE, Item: { PK: `USER#${account.id}`, SK: `GARMENT#${piece.id}`, ...piece, source: "manual", art: "ivory", createdAt: new Date().toISOString(), GSI1SK: `OWNER#${account.id}` } }));
    }
  }
  return { db, accounts, GetCommand, PutCommand, DeleteCommand };
}

async function viaRoute(entry, setup) {
  const request = requests.get(entry.id), closet = closets.get(request.closet), account = setup.accounts.get(request.closet);
  const key = { PK: `USER#${account.id}`, SK: "HANGER_CHAT" };
  await setup.db.send(new setup.DeleteCommand({ TableName: TABLE, Key: key }));
  if (request.activeOutfit) {
    // The outfit "on screen" is whatever the account's conversation record says Hanger last offered.
    const names = request.activeOutfit.map((id) => closet.pieces.find((piece) => piece.id === id).name);
    const state = {
      turns: [{ role: "user", content: "What should I wear today?" }, { role: "assistant", content: `Try the ${names.join(", ")}.` }],
      preferences: [], suggestedItemIds: request.activeOutfit, pendingRequest: null, earlierTurnCount: 0, updatedAt: new Date().toISOString(),
      activeOutfit: { itemIds: request.activeOutfit, intent: { mode: "outfit", occasion: null, weather: null, styleHints: [], styleSource: "none", alternativeRequested: false } },
    };
    await setup.db.send(new setup.PutCommand({ TableName: TABLE, Item: { ...key, state, updatedAt: state.updatedAt } }));
  }
  await fetch(`${MODEL}/__script`, { method: "POST", body: JSON.stringify({ steps: entry.steps, reply: entry.reply }) });
  const answer = await account.call("POST", "/api/agents/consumer", { message: request.text });
  if (answer.status !== 200) return { card: [], problems: [`the route answered ${answer.status}`], answeredBy: "nothing", message: "" };
  const reply = answer.json.reply;
  const cardIds = (reply.selection ?? []).map((piece) => piece.id);
  const seen = (await (await fetch(`${MODEL}/__calls`)).json()).calls;
  const shown = reply.outfits?.length ? reply.outfits.map((card) => card.pieces.map((piece) => piece.name)) : cardIds.length ? [reply.selection.map((piece) => piece.name)] : [];
  // Only what the agent built counts: after a fallback the grounded pipeline shows its own outfit.
  const built = reply.provider === "amazon-bedrock" ? builtOutfits(seen.flatMap((call) => call.toolResults ?? [])) : [];
  const verdict = judge(entry, request, closet, cardIds, shown, built);
  const stored = (await setup.db.send(new setup.GetCommand({ TableName: TABLE, Key: key }))).Item?.state;
  const saveIds = String(reply.actions?.find((action) => action.type === "save-outfit")?.payload?.itemIds ?? "").split(",").filter(Boolean);
  const activeIds = stored?.activeOutfit?.itemIds ?? [];
  const same = (left, right) => left.length === right.length && left.every((id, index) => id === right[index]);
  // With no new card the stored outfit must be the one that was already on screen, untouched.
  const agrees = cardIds.length ? same(cardIds, saveIds) && same(cardIds, activeIds) : same(activeIds, request.activeOutfit ?? []);
  if (!agrees) verdict.problems.push("the card, the Save action and the stored active outfit disagree");
  return { ...verdict, answeredBy: reply.provider === "amazon-bedrock" ? "agent" : "grounded reply after the agent fell back", modelCalls: seen.length, message: reply.message, ...(reply.degradedReason ? { degradedReason: reply.degradedReason } : {}) };
}

// ── Run ─────────────────────────────────────────────────────────────────────
const setup = directOnly ? null : await routeSetup();
const rows = [];
for (const entry of cases) {
  const request = requests.get(entry.id);
  rows.push({ id: entry.id, variant: entry.variant ?? null, group: entry.group, kind: request.kind, request: request.text, direct: await direct(entry), route: setup ? await viaRoute(entry, setup) : null });
}

/** The same lead outfit for different occasions is a failure of the set, not of any one request. */
function repeatedLeads(side) {
  const leads = new Map();
  for (const row of rows.filter((entry) => entry.group === "occasion" && entry[side]?.card.length)) {
    const signature = [...row[side].card].sort().join(" | ");
    leads.set(signature, [...(leads.get(signature) ?? []), row.id]);
  }
  return [...leads.values()].filter((ids) => ids.length > 1);
}
for (const side of ["direct", "route"]) {
  for (const ids of repeatedLeads(side)) for (const row of rows.filter((entry) => ids.includes(entry.id))) row[side].problems.push(`same lead outfit as ${ids.filter((id) => id !== row.id).join(", ")}`);
}

const verdict = (result) => (result === null ? "not run" : result.problems.length ? `FAIL — ${result.problems.join("; ")}` : "ok");
for (const row of rows) {
  console.log(`\n${row.id}${row.variant ? ` (${row.variant})` : ""} — ${row.kind}: "${row.request}"`);
  for (const side of ["direct", "route"]) {
    const result = row[side];
    if (!result) continue;
    console.log(`  ${side.padEnd(6)} ${verdict(result)}`);
    console.log(`         card: ${result.card.length ? result.card.join(", ") : "(no outfit offered)"}  [${result.answeredBy}]`);
  }
}
const failing = (side) => rows.filter((row) => row[side]?.problems.length).length;
console.log(`\nDirect agent: ${failing("direct")} of ${rows.length} replayed cases fail a check.${setup ? ` Normal route: ${failing("route")} of ${rows.length}.` : " The route was not run (--direct-only)."}`);
if (outFile) writeFileSync(outFile, `${JSON.stringify({ rows }, null, 2)}\n`);
