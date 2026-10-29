import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import { GARMENT_TAXONOMY } from "./garment-taxonomy.ts";
import type { OutfitWeather } from "./outfit-ranking.ts";
import type { Forecast } from "./weather.ts";
import type { WardrobeItem } from "./types.ts";

/**
 * The Hanger blind evaluation (work order W7): Hanger's outfit for a request against a random valid
 * outfit from the same closet, judged by two people who do not know which is which.
 *
 * Everything here is pure — no AWS, no files — so the seeded shuffle, the sheet and key, the
 * statistics and the scorer are all tested. `scripts/run-hanger-evaluation.mjs` supplies the model
 * calls and `scripts/score-hanger-evaluation.mjs` the files.
 */

// ── Fixtures ───────────────────────────────────────────────────────────────────

export interface EvalPiece {
  id: string; name: string; category: string; subtype: string; color: string; pattern: string; material: string;
  style: string[]; season: string; wearCount: number; lastWornDays: number;
}
export interface EvalCloset { id: string; name: string; synthetic: true; note: string; pieces: EvalPiece[] }
export const REQUEST_KINDS = ["occasion", "weather", "swap", "impossible"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export interface ForecastSpec { description: string; highC: number; lowC: number; precipitationChance: number; windMph: number }
export interface EvalRequest {
  id: string; closet: string; kind: RequestKind; text: string;
  /** The date Hanger is told it is, so a seasonal closet and a seasonal request agree. */
  today: string;
  forecast?: ForecastSpec;
  /** Piece ids already on screen, for a "swap one piece" request. */
  activeOutfit?: string[];
  swapCategory?: string;
}

export const CLOSET_COUNT = 4;
export const REQUESTS_PER_CLOSET = 10;
const SEASONS = ["all-season", "spring", "summer", "fall", "winter"];
/** Reading order for an outfit, so neither side of a pair gives itself away by how it is listed. */
const CATEGORY_ORDER = ["dress", "top", "bottom", "outerwear", "shoe", "bag", "jewelry", "accessory"];
const PIECE_KEYS = ["id", "name", "category", "subtype", "color", "pattern", "material", "style", "season", "wearCount", "lastWornDays"];

/** Every way the fixtures break the evaluation's rules. Empty means they are fit to run. */
export function validateFixtures(closets: EvalCloset[], requests: EvalRequest[]) {
  const problems: string[] = [];
  if (closets.length !== CLOSET_COUNT) problems.push(`expected ${CLOSET_COUNT} closets, found ${closets.length}`);
  const pieceIds = new Set<string>();
  const byCloset = new Map(closets.map((closet) => [closet.id, closet]));
  for (const closet of closets) {
    if (closet.synthetic !== true) problems.push(`${closet.id}: must be marked synthetic`);
    if (closet.pieces.length < 15 || closet.pieces.length > 25) problems.push(`${closet.id}: ${closet.pieces.length} pieces, expected 15 to 25`);
    const categories = new Set(closet.pieces.map((piece) => piece.category));
    for (const needed of ["top", "bottom", "shoe"]) if (!categories.has(needed)) problems.push(`${closet.id}: no ${needed}, so no valid outfit can be made`);
    if (closet.pieces.filter((piece) => piece.category === "shoe").length < 2) problems.push(`${closet.id}: fewer than two pairs of shoes`);
    if (new Set(closet.pieces.map((piece) => piece.season)).size < 3) problems.push(`${closet.id}: fewer than three seasons represented`);
    for (const piece of closet.pieces) {
      if (pieceIds.has(piece.id)) problems.push(`${piece.id}: duplicate piece id`);
      pieceIds.add(piece.id);
      const subtypes = (GARMENT_TAXONOMY as Record<string, readonly string[]>)[piece.category];
      if (!subtypes) problems.push(`${piece.id}: unknown category ${piece.category}`);
      else if (!subtypes.includes(piece.subtype)) problems.push(`${piece.id}: ${piece.subtype} is not a ${piece.category} subtype`);
      if (!SEASONS.includes(piece.season)) problems.push(`${piece.id}: unknown season ${piece.season}`);
      const extra = Object.keys(piece).filter((key) => !PIECE_KEYS.includes(key));
      if (extra.length) problems.push(`${piece.id}: unexpected fields ${extra.join(", ")} (fixtures carry no photos or links)`);
    }
  }
  if (requests.length !== CLOSET_COUNT * REQUESTS_PER_CLOSET) problems.push(`expected ${CLOSET_COUNT * REQUESTS_PER_CLOSET} requests, found ${requests.length}`);
  const requestIds = new Set<string>();
  for (const request of requests) {
    if (requestIds.has(request.id)) problems.push(`${request.id}: duplicate request id`);
    requestIds.add(request.id);
    const closet = byCloset.get(request.closet);
    if (!closet) { problems.push(`${request.id}: unknown closet ${request.closet}`); continue; }
    if (!REQUEST_KINDS.includes(request.kind)) problems.push(`${request.id}: unknown kind ${request.kind}`);
    if (!request.text.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(request.today)) problems.push(`${request.id}: needs text and an ISO date`);
    if (request.kind === "weather" && !request.forecast) problems.push(`${request.id}: a weather request needs a forecast`);
    if (request.kind === "swap") {
      const active = (request.activeOutfit ?? []).map((id) => closet.pieces.find((piece) => piece.id === id));
      if (active.length < 2 || active.some((piece) => !piece)) problems.push(`${request.id}: a swap needs an outfit of pieces from its closet`);
      else if (!request.swapCategory || !active.some((piece) => piece?.category === request.swapCategory)) problems.push(`${request.id}: the outfit has no ${request.swapCategory} to swap`);
      else if (closet.pieces.filter((piece) => piece.category === request.swapCategory).length < 2) problems.push(`${request.id}: nothing else in ${request.swapCategory} to swap to`);
    }
  }
  for (const closet of closets) {
    const own = requests.filter((request) => request.closet === closet.id);
    if (own.length !== REQUESTS_PER_CLOSET) problems.push(`${closet.id}: ${own.length} requests, expected ${REQUESTS_PER_CLOSET}`);
    if (own.filter((request) => request.kind === "impossible").length !== 1) problems.push(`${closet.id}: expected exactly one impossible ask`);
    for (const kind of ["occasion", "weather", "swap"] as const) if (!own.some((request) => request.kind === kind)) problems.push(`${closet.id}: no ${kind} request`);
  }
  return problems;
}

/** The shape the agent and ranker already use for a piece the person owns. */
export const toWardrobeItem = (piece: EvalPiece): WardrobeItem => ({ ...piece, source: "manual", art: "ivory", brand: null } as unknown as WardrobeItem);

const round1 = (value: number) => Math.round(value * 10) / 10;
const toF = (celsius: number) => Math.round((celsius * 9) / 5 + 32);

/** The ranker's weather word for a day, by the same plain thresholds a person would use. */
export function weatherWord(spec: ForecastSpec): OutfitWeather | null {
  if (spec.precipitationChance >= 60) return "wet";
  if (spec.highC <= 10) return "cold";
  if (spec.highC >= 27) return "warm";
  return null;
}

/** A forecast shaped like the one the weather service returns, for a synthetic place. */
export function buildForecast(spec: ForecastSpec, today: string): Forecast {
  const day = { date: today, description: spec.description, highF: toF(spec.highC), lowF: toF(spec.lowC), highC: spec.highC, lowC: spec.lowC, precipitationChance: spec.precipitationChance, windMph: spec.windMph };
  const nowC = round1((spec.highC + spec.lowC) / 2);
  const rain = spec.precipitationChance >= 20 ? `, ${spec.precipitationChance}% chance of rain` : "";
  return {
    place: "Sample City",
    now: { tempC: Math.round(nowC), tempF: toF(nowC), description: spec.description },
    today: day,
    tomorrow: null,
    outfitWeather: weatherWord(spec),
    summary: `Today in Sample City: ${spec.description}, ${day.lowF}–${day.highF}°F (${spec.lowC}–${spec.highC}°C)${rain}.`,
  };
}

export const describeForecast = (spec: ForecastSpec) => `${spec.description}, ${spec.lowC} to ${spec.highC} °C, ${spec.precipitationChance}% chance of precipitation`;

// ── Seeded randomness, the baseline, and the key ───────────────────────────────

export type Side = "hanger" | "baseline";

/** A reproducible stream of numbers in [0, 1) for one purpose, so no result depends on run order. */
export function seededRandom(seed: string, label: string): () => number {
  let state = createHash("sha256").update(`${seed}\u0000${label}`).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

const pick = <T>(items: readonly T[], random: () => number) => items[Math.floor(random() * items.length)];
const orderPieces = (pieces: EvalPiece[]) => [...pieces].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.id.localeCompare(b.id));

/**
 * A random outfit that is valid by the same rules the outfit builder follows — a dress, or a top and
 * a bottom, plus shoes, plus at most one or two extras of other kinds, never more than four pieces —
 * and that knows nothing about the occasion, the weather or the season. For a swap request it is
 * the outfit already on screen with one piece of the named category replaced at random.
 */
export function randomValidOutfit(pieces: EvalPiece[], request: Pick<EvalRequest, "kind" | "activeOutfit" | "swapCategory">, random: () => number): EvalPiece[] {
  const inCategory = (category: string) => pieces.filter((piece) => piece.category === category);
  if (request.kind === "swap" && request.activeOutfit && request.swapCategory) {
    const current = request.activeOutfit.map((id) => pieces.find((piece) => piece.id === id)).filter((piece): piece is EvalPiece => Boolean(piece));
    const replaced = current.find((piece) => piece.category === request.swapCategory);
    const options = inCategory(request.swapCategory).filter((piece) => !current.some((own) => own.id === piece.id));
    if (!replaced || !options.length) return orderPieces(current);
    return orderPieces(current.map((piece) => (piece === replaced ? pick(options, random) : piece)));
  }
  const chosen: EvalPiece[] = [];
  const dresses = inCategory("dress");
  const separates = inCategory("top").length > 0 && inCategory("bottom").length > 0;
  if (dresses.length && (!separates || random() < 0.25)) chosen.push(pick(dresses, random));
  else chosen.push(pick(inCategory("top"), random), pick(inCategory("bottom"), random));
  chosen.push(pick(inCategory("shoe"), random));
  const extras = seededShuffle(["outerwear", "bag", "jewelry", "accessory"].filter((category) => inCategory(category).length), random);
  const room = 4 - chosen.length;
  for (const category of extras.slice(0, Math.floor(random() * (room + 1)))) chosen.push(pick(inCategory(category), random));
  return orderPieces(chosen);
}

/** Why an outfit is not valid by the builder's rules; empty means it is. */
export function outfitProblems(pieces: EvalPiece[]) {
  const problems: string[] = [];
  const categories = pieces.map((piece) => piece.category);
  if (new Set(pieces.map((piece) => piece.id)).size !== pieces.length) problems.push("repeats a piece");
  if (pieces.length > 4) problems.push("has more than four pieces");
  const dress = categories.includes("dress"), top = categories.includes("top"), bottom = categories.includes("bottom");
  if (dress && (top || bottom)) problems.push("puts a dress with a top or bottom");
  if (!dress && !(top && bottom)) problems.push("has neither a dress nor a top and a bottom");
  if (!categories.includes("shoe")) problems.push("has no shoes");
  return problems;
}

export interface KeyItem { id: string; closet: string; kind: RequestKind; a: Side; b: Side; digest: string }
export interface EvalKey { version: 1; seed: string; items: KeyItem[] }

/** Which side shows first for each request: exactly half each way, in an order only the seed decides. */
export function assignFirstSide(ids: string[], seed: string): Record<string, Side> {
  const sorted = [...ids].sort();
  const sides: Side[] = sorted.map((_, index) => (index < Math.ceil(sorted.length / 2) ? "hanger" : "baseline"));
  const shuffled = seededShuffle(sides, seededRandom(seed, "sides"));
  return Object.fromEntries(sorted.map((id, index) => [id, shuffled[index]]));
}

// ── The outfit and request cells, and the CSV ──────────────────────────────────

const label = (category: string) => category.charAt(0).toUpperCase() + category.slice(1);

/** An outfit as a rater reads it. No outfit — Hanger fell back, or declined — is said plainly. */
export const renderOutfit = (pieces: EvalPiece[] | null) =>
  pieces && pieces.length ? orderPieces(pieces).map((piece) => `${label(piece.category)}: ${piece.name}`).join("\n") : "(no outfit offered)";

export function renderRequest(closet: EvalCloset, request: EvalRequest) {
  const lines = [`Closet: ${closet.name} (the pieces are listed in closets.txt)`, `Request: "${request.text}"`];
  if (request.forecast) lines.push(`Forecast: ${describeForecast(request.forecast)}`);
  if (request.activeOutfit) lines.push(`Wearing now:\n${renderOutfit(request.activeOutfit.map((id) => closet.pieces.find((piece) => piece.id === id)!))}`);
  return lines.join("\n");
}

export function renderClosets(closets: EvalCloset[]) {
  return closets.map((closet) => [
    `${closet.name} (synthetic)`, "-".repeat(closet.name.length + 12),
    ...orderPieces(closet.pieces).map((piece) => `${label(piece.category)}: ${piece.name} [${piece.season}]`), "",
  ].join("\n")).join("\n");
}

const needsQuotes = /[",\r\n]/;
export const toCsv = (rows: string[][]) => rows.map((row) => row.map((cell) => (needsQuotes.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(",")).join("\r\n") + "\r\n";

/** RFC 4180: quoted cells, doubled quotes, line breaks inside cells, CRLF or LF, an optional byte-order mark. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, started = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"') { if (source[index + 1] === '"') { cell += '"'; index++; } else quoted = false; }
      else cell += char;
      continue;
    }
    if (char === '"' && !cell) { quoted = true; started = true; }
    else if (char === ",") { row.push(cell); cell = ""; started = true; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index++;
      if (started || cell) { row.push(cell); rows.push(row); }
      row = []; cell = ""; started = false;
    } else { cell += char; started = true; }
  }
  if (quoted) throw new Error("The CSV ends inside a quoted cell; a quote was left open.");
  if (started || cell) { row.push(cell); rows.push(row); }
  return rows;
}

export const SHEET_HEADER = ["id", "request", "outfit A", "outfit B", "choice (A/B/tie)", "reason"];
const digestOf = (a: string, b: string) => createHash("sha256").update(`${a}\n---\n${b}`).digest("hex").slice(0, 16);

export interface RunRecord {
  /** Piece ids Hanger offered first, or null when it offered none. */
  hangerOutfit: string[] | null;
  baselineOutfit: string[];
  reply: string;
  toolsUsed: string[];
  fallback: { kind: string; errorName?: string } | null;
  modelCalls: number;
  toolUses: number;
  corrections: number;
}

/** The blank rater sheet, the private key, and the closets listing, from what the run produced. */
export function buildRaterSheet(input: { seed: string; closets: EvalCloset[]; requests: EvalRequest[]; records: Record<string, RunRecord> }) {
  const closetById = new Map(input.closets.map((closet) => [closet.id, closet]));
  const firstSide = assignFirstSide(input.requests.map((request) => request.id), input.seed);
  const rows: string[][] = [SHEET_HEADER];
  const items: KeyItem[] = [];
  for (const request of input.requests) {
    const closet = closetById.get(request.closet)!;
    const record = input.records[request.id];
    if (!record) throw new Error(`${request.id}: no result recorded yet`);
    const pieces = (ids: string[] | null) => (ids ? ids.map((id) => closet.pieces.find((piece) => piece.id === id)).filter((piece): piece is EvalPiece => Boolean(piece)) : null);
    const cells: Record<Side, string> = { hanger: renderOutfit(pieces(record.hangerOutfit)), baseline: renderOutfit(pieces(record.baselineOutfit)) };
    const a: Side = firstSide[request.id];
    const b: Side = a === "hanger" ? "baseline" : "hanger";
    rows.push([request.id, renderRequest(closet, request), cells[a], cells[b], "", ""]);
    items.push({ id: request.id, closet: request.closet, kind: request.kind, a, b, digest: digestOf(cells[a], cells[b]) });
  }
  const key: EvalKey = { version: 1, seed: input.seed, items };
  return { csv: toCsv(rows), key, closetsText: renderClosets(input.closets) };
}

// ── Reading a rater's sheet ────────────────────────────────────────────────────

export type Choice = "A" | "B" | "tie";
export interface RaterChoice { choice: Choice; reason: string }

const normalizeChoice = (value: string): Choice | null => {
  const text = value.trim().toLowerCase();
  if (text === "a") return "A";
  if (text === "b") return "B";
  if (text === "tie" || text === "t") return "tie";
  return null;
};
const columnName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * One rater's filled sheet. Anything unreadable is a problem, not a skip: a missing or invalid
 * choice dropped quietly would bias the result, and a sheet whose outfits do not match the key
 * belongs to a different run and would unblind wrongly.
 */
export function parseRaterSheet(csv: string, key: EvalKey) {
  const problems: string[] = [];
  const choices: Record<string, RaterChoice> = {};
  const rows = parseCsv(csv);
  if (!rows.length) return { choices, problems: ["the sheet is empty"] };
  const names = rows[0].map(columnName);
  const column = (test: (name: string) => boolean) => names.findIndex(test);
  const at = { id: column((name) => name === "id"), a: column((name) => name === "outfita"), b: column((name) => name === "outfitb"), choice: column((name) => name.startsWith("choice")), reason: column((name) => name === "reason") };
  for (const [field, index] of Object.entries(at)) if (index < 0) problems.push(`the sheet has no ${field} column`);
  if (problems.length) return { choices, problems };
  const byId = new Map(key.items.map((item) => [item.id, item]));
  for (const row of rows.slice(1)) {
    const id = (row[at.id] ?? "").trim();
    if (!id && row.every((cell) => !cell.trim())) continue;
    const item = byId.get(id);
    if (!item) { problems.push(`${id || "(blank id)"}: not a request in this run's key`); continue; }
    if (choices[id]) { problems.push(`${id}: appears twice`); continue; }
    if (digestOf(row[at.a] ?? "", row[at.b] ?? "") !== item.digest) { problems.push(`${id}: its outfits differ from the sheet this key was made for`); continue; }
    const choice = normalizeChoice(row[at.choice] ?? "");
    if (!choice) { problems.push(`${id}: choice must be A, B or tie (found "${(row[at.choice] ?? "").trim()}")`); continue; }
    choices[id] = { choice, reason: (row[at.reason] ?? "").replace(/\s+/g, " ").trim() };
  }
  for (const item of key.items) if (!choices[item.id] && !problems.some((problem) => problem.startsWith(`${item.id}:`))) problems.push(`${item.id}: missing from the sheet`);
  return { choices, problems };
}

// ── Statistics ─────────────────────────────────────────────────────────────────

/** Wilson score interval, 95%. */
export function wilson(successes: number, trials: number) {
  if (!trials) return null;
  const z = 1.959964, p = successes / trials, z2 = z * z;
  const centre = (p + z2 / (2 * trials)) / (1 + z2 / trials);
  const half = (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / (1 + z2 / trials);
  // Six places, so a percentage shown to one decimal is never off by a tick at a rounding boundary.
  const round = (value: number) => Number(value.toFixed(6));
  return { rate: round(p), low: round(Math.max(0, centre - half)), high: round(Math.min(1, centre + half)) };
}

/** Cohen's kappa for two raters over the same items. Null when chance agreement is already total, which leaves it undefined. */
export function cohenKappa(first: string[], second: string[]) {
  if (first.length !== second.length || !first.length) throw new Error("Cohen's kappa needs two equal, non-empty lists of labels.");
  const n = first.length;
  const labels = [...new Set([...first, ...second])];
  const observed = first.filter((value, index) => value === second[index]).length / n;
  const expected = labels.reduce((sum, name) => sum + (first.filter((value) => value === name).length / n) * (second.filter((value) => value === name).length / n), 0);
  const round = (value: number) => Number(value.toFixed(4));
  return { n, observed: round(observed), expected: round(expected), kappa: expected >= 1 ? null : round((observed - expected) / (1 - expected)) };
}

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const mean = (values: number[]) => (values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null);

// ── Scoring ────────────────────────────────────────────────────────────────────

export type Verdict = Side | "tie";
export interface ItemResult { id: string; closet: string; kind: RequestKind; verdicts: [Verdict, Verdict]; outcome: Verdict }

/** What a rater's A/B/tie meant, once the key says which side was Hanger. */
export const unblind = (item: KeyItem, choice: Choice): Verdict => (choice === "tie" ? "tie" : choice === "A" ? item.a : item.b);

/**
 * Two raters, one verdict per request. Each rater's pick is worth 1 to Hanger, ½ for a tie and 0
 * for the baseline; the request goes to Hanger above ½, to the baseline below it, and is a tie
 * at exactly ½ (both said tie, or they split). Counting each rater's pick as its own trial would
 * treat two opinions on one outfit pair as independent evidence, and the interval would be too narrow.
 */
export function combineVerdicts(first: Verdict, second: Verdict): Verdict {
  const worth = (verdict: Verdict) => (verdict === "hanger" ? 1 : verdict === "tie" ? 0.5 : 0);
  const score = (worth(first) + worth(second)) / 2;
  return score > 0.5 ? "hanger" : score < 0.5 ? "baseline" : "tie";
}

const tally = (results: ItemResult[]) => {
  const hanger = results.filter((result) => result.outcome === "hanger").length;
  const baseline = results.filter((result) => result.outcome === "baseline").length;
  return { requests: results.length, hangerWins: hanger, baselineWins: baseline, ties: results.length - hanger - baseline };
};
const withRate = (counts: ReturnType<typeof tally>) => ({ ...counts, winRate: wilson(counts.hangerWins, counts.hangerWins + counts.baselineWins) });

/** The private record of a run: what was spent, and what each request produced. A rerun resumes from it. */
export interface RunFile { version: 1; seed: string; spend: { spentUsd: number; largestInput: number; callsSent: number }; records: Record<string, RunRecord> }

export function summarizeRun(run: RunFile, requestIds: string[]) {
  const records = requestIds.map((id) => run.records[id]).filter(Boolean);
  const fallbacks = records.filter((record) => record.fallback);
  const count = (values: string[]) => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((entry) => entry === value).length]));
  return {
    turns: records.length,
    modelCallsPerTurn: { mean: mean(records.map((record) => record.modelCalls)), median: median(records.map((record) => record.modelCalls)), max: Math.max(0, ...records.map((record) => record.modelCalls)) },
    toolCallsPerTurn: { mean: mean(records.map((record) => record.toolUses)), median: median(records.map((record) => record.toolUses)), max: Math.max(0, ...records.map((record) => record.toolUses)) },
    turnsWithNoToolCall: records.filter((record) => record.toolUses === 0).length,
    toolsUsed: count(records.flatMap((record) => record.toolsUsed)),
    fallbacks: { count: fallbacks.length, rate: records.length ? Number((fallbacks.length / records.length).toFixed(4)) : null, byKind: count(fallbacks.map((record) => record.fallback!.kind)) },
    inventedOutfitCorrections: { count: records.reduce((sum, record) => sum + record.corrections, 0), turnsCorrected: records.filter((record) => record.corrections > 0).length },
    countedSpendUsd: Number(run.spend.spentUsd.toFixed(2)),
  };
}

export interface EvaluationReport {
  date: string;
  raters: 2;
  seed: string;
  headline: ReturnType<typeof withRate> & { basis: string };
  allRequests: ReturnType<typeof withRate>;
  byKind: Record<string, ReturnType<typeof withRate>>;
  byCloset: Record<string, ReturnType<typeof withRate>>;
  perRater: Array<{ hangerPicks: number; baselinePicks: number; ties: number; hangerShareOfDecided: ReturnType<typeof wilson> }>;
  agreement: ReturnType<typeof cohenKappa>;
  impossibleAsks: { requests: number; hangerOfferedAnOutfit: number; hangerOfferedNone: number; outcomes: ReturnType<typeof tally> };
  toolUse: ReturnType<typeof summarizeRun>;
}

export interface LosingCase { id: string; closet: string; kind: RequestKind; request: string; hangerOutfit: string; baselineOutfit: string; hangerReply: string; fallback: string | null; raters: Array<{ picked: Verdict; reason: string }> }

export function scoreEvaluation(input: { key: EvalKey; run: RunFile; raters: [Record<string, RaterChoice>, Record<string, RaterChoice>]; closets: EvalCloset[]; requests: EvalRequest[]; date: string }) {
  const { key, run, raters, closets, requests, date } = input;
  const results: ItemResult[] = key.items.map((item) => {
    const verdicts = [unblind(item, raters[0][item.id].choice), unblind(item, raters[1][item.id].choice)] as [Verdict, Verdict];
    return { id: item.id, closet: item.closet, kind: item.kind, verdicts, outcome: combineVerdicts(...verdicts) };
  });
  const answerable = results.filter((result) => result.kind !== "impossible");
  const impossible = results.filter((result) => result.kind === "impossible");
  const group = (field: "kind" | "closet") => Object.fromEntries([...new Set(results.map((result) => result[field]))].sort().map((name) => [name, withRate(tally(results.filter((result) => result[field] === name)))]));
  const picks = (index: 0 | 1) => {
    const verdicts = results.map((result) => result.verdicts[index]);
    const hanger = verdicts.filter((verdict) => verdict === "hanger").length, baseline = verdicts.filter((verdict) => verdict === "baseline").length;
    return { hangerPicks: hanger, baselinePicks: baseline, ties: verdicts.length - hanger - baseline, hangerShareOfDecided: wilson(hanger, hanger + baseline) };
  };
  const ids = key.items.map((item) => item.id);
  const report: EvaluationReport = {
    date, raters: 2, seed: key.seed,
    headline: { ...withRate(tally(answerable)), basis: "occasion, weather and swap requests; the impossible asks are reported separately" },
    allRequests: withRate(tally(results)),
    byKind: group("kind"),
    byCloset: group("closet"),
    perRater: [picks(0), picks(1)],
    agreement: cohenKappa(results.map((result) => result.verdicts[0]), results.map((result) => result.verdicts[1])),
    impossibleAsks: {
      requests: impossible.length,
      hangerOfferedAnOutfit: impossible.filter((result) => run.records[result.id].hangerOutfit?.length).length,
      hangerOfferedNone: impossible.filter((result) => !run.records[result.id].hangerOutfit?.length).length,
      outcomes: tally(impossible),
    },
    toolUse: summarizeRun(run, ids),
  };
  const closetById = new Map(closets.map((closet) => [closet.id, closet]));
  const requestById = new Map(requests.map((request) => [request.id, request]));
  const names = (closet: EvalCloset, pieceIds: string[] | null) => renderOutfit(pieceIds ? pieceIds.map((id) => closet.pieces.find((piece) => piece.id === id)).filter((piece): piece is EvalPiece => Boolean(piece)) : null);
  const losing: LosingCase[] = results.filter((result) => result.outcome === "baseline").map((result) => {
    const closet = closetById.get(result.closet)!, record = run.records[result.id], request = requestById.get(result.id)!;
    return {
      id: result.id, closet: closet.name, kind: result.kind, request: request.text,
      hangerOutfit: names(closet, record.hangerOutfit), baselineOutfit: names(closet, record.baselineOutfit),
      hangerReply: record.reply.slice(0, 400),
      fallback: record.fallback ? record.fallback.kind : null,
      raters: result.verdicts.map((picked, index) => ({ picked, reason: raters[index as 0 | 1][result.id].reason })),
    };
  });
  return { report, losing };
}

// ── Output ─────────────────────────────────────────────────────────────────────

const pct = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`);
const interval = (score: { hangerWins: number; baselineWins: number; winRate: ReturnType<typeof wilson> }) =>
  score.winRate ? `${score.hangerWins} of ${score.hangerWins + score.baselineWins} decided (${pct(score.winRate.rate)}, 95% CI ${pct(score.winRate.low)}–${pct(score.winRate.high)})` : "no decided requests";
const indent = (text: string) => text.split("\n").map((line) => `  ${line}`).join("\n");

/** docs/hanger-evaluation-results.md, written from the report and the losing cases and nothing else. */
export function renderResultsMarkdown(report: EvaluationReport, losing: LosingCase[]) {
  const { headline: h, allRequests: all, agreement, toolUse: tool, impossibleAsks: imp } = report;
  const kappa = agreement.kappa === null ? "undefined (both raters gave one answer throughout)" : agreement.kappa.toFixed(2);
  const lines = [
    "# Hanger evaluation results",
    "",
    `Generated from \`data/hanger-evaluation-${report.date}.json\` by \`scripts/score-hanger-evaluation.mjs\`. Method, limits, and how to run it: [hanger-evaluation.md](hanger-evaluation.md).`,
    "",
    `Hanger's outfit was compared with a **random valid outfit from the same closet** on ${all.requests} synthetic requests across ${Object.keys(report.byCloset).length} synthetic closets, by two raters who did not know which outfit was which. This shows whether Hanger beats picking at random, not whether it matches a human stylist.`,
    "",
    "## Result",
    "",
    "| Measure | Result |", "| --- | --- |",
    `| Hanger preferred over the random outfit (${h.requests} occasion, weather and swap requests) | ${interval(h)}; ${h.ties} tied |`,
    `| The same, counting the impossible asks too (${all.requests} requests) | ${interval(all)}; ${all.ties} tied |`,
    `| Agreement between the two raters (Cohen's kappa) | ${kappa}; they gave the same answer on ${pct(agreement.observed)} of requests (${pct(agreement.expected)} expected by chance) |`,
    ...report.perRater.map((rater, index) => `| Rater ${index + 1} alone | picked Hanger ${rater.hangerPicks} times, the baseline ${rater.baselinePicks}, tie ${rater.ties} |`),
    "",
    "Each request goes to Hanger if the raters' picks average in its favour, to the baseline if they average against it, and is a tie if both said tie or they split. Ties are left out of the win rate and counted beside it.",
    "",
    "| Request type | Requests | Hanger | Baseline | Tied |", "| --- | ---: | ---: | ---: | ---: |",
    ...Object.entries(report.byKind).map(([kind, score]) => `| ${kind} | ${score.requests} | ${score.hangerWins} | ${score.baselineWins} | ${score.ties} |`),
    "",
    "| Closet | Requests | Hanger | Baseline | Tied |", "| --- | ---: | ---: | ---: | ---: |",
    ...Object.entries(report.byCloset).map(([closet, score]) => `| ${closet} | ${score.requests} | ${score.hangerWins} | ${score.baselineWins} | ${score.ties} |`),
    "",
    "## Impossible asks",
    "",
    `Each closet had one request for something it does not contain. Hanger offered an outfit anyway on ${imp.hangerOfferedAnOutfit} of ${imp.requests} and offered none on ${imp.hangerOfferedNone}. Raters judged ${imp.outcomes.hangerWins} for Hanger, ${imp.outcomes.baselineWins} for the baseline and ${imp.outcomes.ties} tied. These are kept out of the headline because an honest "I don't have that" cannot beat an outfit on outfit quality; read the replies for these requests in the private run file to judge the honesty.`,
    "",
    "## How Hanger used its tools",
    "",
    `Across ${tool.turns} turns: ${tool.toolCallsPerTurn.mean} tool calls per turn on average (median ${tool.toolCallsPerTurn.median}, most ${tool.toolCallsPerTurn.max}) and ${tool.modelCallsPerTurn.mean} model calls (median ${tool.modelCallsPerTurn.median}, most ${tool.modelCallsPerTurn.max}). ${tool.turnsWithNoToolCall} turns used no tool.`,
    "",
    `- Tools used: ${Object.entries(tool.toolsUsed).map(([name, uses]) => `${name} (${uses} turns)`).join(", ") || "none"}.`,
    `- Fell back to the grounded reply: ${tool.fallbacks.count} of ${tool.turns} (${pct(tool.fallbacks.rate)})${Object.keys(tool.fallbacks.byKind).length ? `: ${Object.entries(tool.fallbacks.byKind).map(([kind, n]) => `${kind} ${n}`).join(", ")}` : ""}. A fallback shows as "(no outfit offered)" and is rated like any other.`,
    `- Outfit lists the agent wrote itself and had to be corrected: ${tool.inventedOutfitCorrections.count} corrections across ${tool.inventedOutfitCorrections.turnsCorrected} turns.`,
    `- Bedrock spend counted for the run, with a 1.5× margin: $${tool.countedSpendUsd.toFixed(2)} (hard cap $1.50).`,
    "",
    "## Where Hanger lost",
    "",
  ];
  if (!losing.length) lines.push("No request went to the baseline.", "");
  for (const entry of losing) {
    lines.push(
      `### ${entry.id} — ${entry.closet} (${entry.kind})`, "",
      `> ${entry.request}`, "",
      `Hanger offered:`, "", indent(entry.hangerOutfit), "",
      `Baseline offered:`, "", indent(entry.baselineOutfit), "",
      ...(entry.fallback ? [`Hanger fell back (${entry.fallback}).`, ""] : []),
      `Hanger said: ${entry.hangerReply || "(nothing)"}`, "",
      ...entry.raters.map((rater, index) => `- Rater ${index + 1} chose ${rater.picked === "hanger" ? "Hanger" : rater.picked === "baseline" ? "the baseline" : "a tie"}${rater.reason ? `: ${rater.reason}` : " (no reason given)"}`), "",
    );
  }
  lines.push(`The closets, requests and baseline are synthetic and the raters are two people: this is a measured preference over ${all.requests} requests, not a guarantee for every closet.`);
  return lines.join("\n") + "\n";
}

/** True when `path` is `directory` or somewhere inside it. */
export function isInside(path: string, directory: string) {
  const difference = relative(resolve(directory), resolve(path));
  return difference === "" || (!difference.startsWith("..") && !isAbsolute(difference));
}
