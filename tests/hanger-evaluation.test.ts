import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INVENTED_OUTFIT_CORRECTION, runHangerAgent, type AgentConverse, type AgentModelResponse } from "../lib/hanger-agent.ts";
import {
  assignFirstSide, buildForecast, buildRaterSheet, cohenKappa, combineVerdicts, outfitProblems, parseCsv, parseRaterSheet, randomValidOutfit, renderResultsMarkdown,
  scoreEvaluation, seededRandom, seededShuffle, toCsv, toWardrobeItem, unblind, validateFixtures, weatherWord, wilson,
  type EvalCloset, type EvalKey, type EvalRequest, type RunFile, type RunRecord,
} from "../lib/hanger-evaluation.ts";
import {
  AGENT_MAX_OUTPUT_TOKENS, ASSUMED_MAX_INPUT_TOKENS, BudgetReachedError, HARD_BUDGET_USD, PRICE_SAFETY, SpendGuard, budgetLimit, callCostUsd, estimateRun, mayStartCall,
  meteredAgentCall, newTally, worstCaseCallUsd, type SpendState,
} from "../lib/hanger-eval-spend.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const closets = ["closet-a", "closet-b", "closet-c", "closet-d"].map((id) => JSON.parse(read(`data/hanger-eval/${id}.json`)) as EvalCloset);
const requests = (JSON.parse(read("data/hanger-eval/requests.json")) as { requests: EvalRequest[] }).requests;
const PRO = "us.amazon.nova-pro-v1:0";
const MODELS = [PRO, "us.amazon.nova-lite-v1:0"];

// ── Fixtures ───────────────────────────────────────────────────────────────────

test("the shipped fixtures are four synthetic closets and forty requests that meet the work order", () => {
  assert.deepEqual(validateFixtures(closets, requests), []);
  assert.deepEqual(closets.map((closet) => closet.pieces.length).map((count) => count >= 15 && count <= 25), [true, true, true, true]);
  for (const closet of closets) {
    const own = requests.filter((request) => request.closet === closet.id);
    assert.equal(own.length, 10);
    assert.equal(own.filter((request) => request.kind === "impossible").length, 1);
    assert.ok(closet.note.toLowerCase().includes("synthetic") && closet.synthetic === true);
  }
});

test("fixtures are rejected when they carry photos, miss a rule, or break the closet counts", () => {
  const withPhoto = structuredClone(closets);
  (withPhoto[0].pieces[0] as unknown as Record<string, unknown>).imageUrl = "https://example.com/x.jpg";
  assert.match(validateFixtures(withPhoto, requests).join("\n"), /unexpected fields imageUrl/);
  assert.match(validateFixtures(closets.slice(0, 3), requests).join("\n"), /expected 4 closets/);
  const noImpossible = requests.map((request) => (request.id === "a-10" ? { ...request, kind: "occasion" as const } : request));
  assert.match(validateFixtures(closets, noImpossible).join("\n"), /exactly one impossible ask/);
  const badSwap = requests.map((request) => (request.id === "a-08" ? { ...request, swapCategory: "bag" } : request));
  assert.match(validateFixtures(closets, badSwap).join("\n"), /a-08: the outfit has no bag to swap/);
});

// ── Seeded shuffle, baseline, and key ──────────────────────────────────────────

test("the seeded stream is reproducible, differs by seed and label, and the shuffle keeps every item", () => {
  const draw = (seed: string, label: string) => { const next = seededRandom(seed, label); return [next(), next(), next()]; };
  assert.deepEqual(draw("s", "x"), draw("s", "x"));
  assert.notDeepEqual(draw("s", "x"), draw("t", "x"));
  assert.notDeepEqual(draw("s", "x"), draw("s", "y"));
  assert.ok(draw("s", "x").every((value) => value >= 0 && value < 1));
  const items = Array.from({ length: 30 }, (_, index) => index);
  const shuffled = seededShuffle(items, seededRandom("s", "shuffle"));
  assert.deepEqual([...shuffled].sort((a, b) => a - b), items);
  assert.notDeepEqual(shuffled, items);
  assert.deepEqual(shuffled, seededShuffle(items, seededRandom("s", "shuffle")));
});

test("A/B order puts Hanger first for exactly half the requests, by seed alone and whatever order ids arrive in", () => {
  const ids = requests.map((request) => request.id);
  const sides = assignFirstSide(ids, "seed-1");
  assert.equal(Object.values(sides).filter((side) => side === "hanger").length, 20);
  assert.deepEqual(sides, assignFirstSide([...ids].reverse(), "seed-1"));
  assert.notDeepEqual(sides, assignFirstSide(ids, "seed-2"));
  assert.equal(Object.values(assignFirstSide(["a", "b", "c"], "x")).filter((side) => side === "hanger").length, 2);
});

test("every baseline is a valid outfit for every request and seed, and a swap changes exactly one piece", () => {
  for (const seed of ["one", "two", "three", "racked-hanger-eval-1"]) {
    for (const request of requests) {
      const closet = closets.find((entry) => entry.id === request.closet)!;
      const outfit = randomValidOutfit(closet.pieces, request, seededRandom(seed, `baseline:${request.id}`));
      assert.deepEqual(outfitProblems(outfit), [], `${request.id} (${seed})`);
      assert.ok(outfit.every((piece) => closet.pieces.some((own) => own.id === piece.id)), "only pieces from that closet");
      if (request.kind === "swap") {
        const before = request.activeOutfit!;
        const after = outfit.map((piece) => piece.id);
        assert.equal(after.length, before.length);
        const changed = after.filter((id) => !before.includes(id));
        assert.equal(changed.length, 1, `${request.id} swaps one piece`);
        assert.equal(closet.pieces.find((piece) => piece.id === changed[0])!.category, request.swapCategory);
      }
    }
  }
  assert.deepEqual(outfitProblems(closets[0].pieces.slice(0, 2)), ["has neither a dress nor a top and a bottom", "has no shoes"]);
  const dressPlusTop = [closets[2].pieces[0], closets[2].pieces.find((piece) => piece.category === "top")!, closets[2].pieces.find((piece) => piece.category === "shoe")!];
  assert.ok(outfitProblems(dressPlusTop).includes("puts a dress with a top or bottom"));
});

test("the baseline is the same for the same seed and request, and ignores run order", () => {
  const request = requests.find((entry) => entry.id === "b-03")!;
  const pieces = closets[1].pieces;
  const first = randomValidOutfit(pieces, request, seededRandom("s", `baseline:${request.id}`)).map((piece) => piece.id);
  assert.deepEqual(first, randomValidOutfit(pieces, request, seededRandom("s", `baseline:${request.id}`)).map((piece) => piece.id));
});

// ── The sheet and the key ──────────────────────────────────────────────────────

/** A full fake run on the real fixtures: Hanger's outfit is another random valid one, a few are missing. */
function fakeRecords(seed = "seed-1") {
  const records: Record<string, RunRecord> = {};
  for (const request of requests) {
    const closet = closets.find((entry) => entry.id === request.closet)!;
    const baseline = randomValidOutfit(closet.pieces, request, seededRandom(seed, `baseline:${request.id}`));
    const hanger = randomValidOutfit(closet.pieces, request, seededRandom(seed, `fake-hanger:${request.id}`));
    const declined = request.kind === "impossible" && request.closet !== "closet-a";
    records[request.id] = {
      hangerOutfit: declined ? null : hanger.map((piece) => piece.id), baselineOutfit: baseline.map((piece) => piece.id),
      reply: declined ? "I don't have that in your closet." : "Here is a look.", toolsUsed: declined ? [] : ["outfit builder"],
      fallback: request.id === "d-06" ? { kind: "out-of-time" } : null, modelCalls: 2, toolUses: declined ? 0 : 1, corrections: request.id === "b-02" ? 1 : 0,
    };
  }
  return records;
}

test("the rater sheet is blinded, balanced, and its key says which side was Hanger", () => {
  const records = fakeRecords();
  const { csv, key, closetsText } = buildRaterSheet({ seed: "seed-1", closets, requests, records });
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0], ["id", "request", "outfit A", "outfit B", "choice (A/B/tie)", "reason"]);
  assert.equal(rows.length, 41);
  assert.ok(rows.slice(1).every((row) => row[4] === "" && row[5] === ""), "the choice and reason columns start blank");
  assert.doesNotMatch(csv + closetsText, /hanger|baseline/i, "nothing on the sheet names a side");
  assert.equal(key.items.filter((item) => item.a === "hanger").length, 20);
  for (const item of key.items) {
    const row = rows.find((entry) => entry[0] === item.id)!;
    const hangerCell = item.a === "hanger" ? row[2] : row[3];
    const request = requests.find((entry) => entry.id === item.id)!;
    const closet = closets.find((entry) => entry.id === request.closet)!;
    const offered = records[item.id].hangerOutfit;
    if (offered) for (const id of offered) assert.ok(hangerCell.includes(closet.pieces.find((piece) => piece.id === id)!.name));
    else assert.equal(hangerCell, "(no outfit offered)");
  }
  assert.match(rows.find((row) => row[0] === "a-05")![1], /Forecast: light snow, -4 to 2 °C/);
  assert.match(rows.find((row) => row[0] === "a-08")![1], /Wearing now:\nTop: White oxford shirt/);
  assert.equal(unblind({ id: "x", closet: "c", kind: "occasion", a: "baseline", b: "hanger", digest: "" }, "A"), "baseline");
  assert.equal(unblind({ id: "x", closet: "c", kind: "occasion", a: "baseline", b: "hanger", digest: "" }, "B"), "hanger");
  assert.equal(unblind({ id: "x", closet: "c", kind: "occasion", a: "baseline", b: "hanger", digest: "" }, "tie"), "tie");
});

test("the same seed makes the same sheet and key, and another seed shuffles them", () => {
  const records = fakeRecords();
  const one = buildRaterSheet({ seed: "seed-1", closets, requests, records });
  assert.deepEqual(one, buildRaterSheet({ seed: "seed-1", closets, requests, records }));
  assert.notDeepEqual(one.key.items.map((item) => item.a), buildRaterSheet({ seed: "seed-2", closets, requests, records }).key.items.map((item) => item.a));
});

test("CSV round-trips quotes, commas, line breaks, CRLF and a byte-order mark", () => {
  const rows = [["id", "text"], ["a", 'He said "hi", twice'], ["b", "two\nlines"], ["c", ""]];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
  assert.deepEqual(parseCsv("﻿id,x\r\n1,\"a\r\nb\"\r\n"), [["id", "x"], ["1", "a\r\nb"]]);
  assert.deepEqual(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
  assert.throws(() => parseCsv('a,"open'), /quoted cell/);
});

/** Fills a copy of the blank sheet the way a rater would, in a spreadsheet that quotes everything. */
function fill(csv: string, choose: (id: string, index: number) => string, reason = "looked better, to me") {
  const rows = parseCsv(csv);
  return toCsv(rows.map((row, index) => (index === 0 ? row : [row[0], row[1], row[2], row[3], choose(row[0], index - 1), reason])));
}

test("a filled sheet is read back; blank, invalid, missing, duplicate, foreign and altered rows are refused", () => {
  const { csv, key } = buildRaterSheet({ seed: "seed-1", closets, requests, records: fakeRecords() });
  const ok = parseRaterSheet(fill(csv, (_, index) => ["A", "b", "TIE", " t "][index % 4]), key);
  assert.deepEqual(ok.problems, []);
  assert.equal(Object.keys(ok.choices).length, 40);
  assert.deepEqual(Object.values(ok.choices).slice(0, 4).map((entry) => entry.choice), ["A", "B", "tie", "tie"]);

  assert.match(parseRaterSheet(fill(csv, (id) => (id === "a-01" ? "" : "A")), key).problems.join("\n"), /a-01: choice must be A, B or tie/);
  assert.match(parseRaterSheet(fill(csv, (id) => (id === "a-02" ? "maybe" : "A")), key).problems.join("\n"), /a-02: choice must be A, B or tie \(found "maybe"\)/);
  const withoutRow = toCsv(parseCsv(fill(csv, () => "A")).filter((row) => row[0] !== "b-01"));
  assert.match(parseRaterSheet(withoutRow, key).problems.join("\n"), /b-01: missing from the sheet/);
  const rows = parseCsv(fill(csv, () => "A"));
  assert.match(parseRaterSheet(toCsv([...rows, rows[1]]), key).problems.join("\n"), /a-01: appears twice/);
  assert.match(parseRaterSheet(toCsv([...rows, ["zzz", "", "", "", "A", ""]]), key).problems.join("\n"), /zzz: not a request in this run's key/);
  const altered = rows.map((row) => (row[0] === "c-01" ? [row[0], row[1], row[3], row[2], row[4], row[5]] : row));
  assert.match(parseRaterSheet(toCsv(altered), key).problems.join("\n"), /c-01: its outfits differ from the sheet this key was made for/);
  const otherRun = buildRaterSheet({ seed: "seed-1", closets, requests, records: fakeRecords("seed-9") }).key;
  assert.ok(parseRaterSheet(fill(csv, () => "A"), otherRun).problems.length > 0, "a sheet from a different run does not match the key");
  assert.deepEqual(parseRaterSheet("", key).problems, ["the sheet is empty"]);
});

// ── Cost guard ─────────────────────────────────────────────────────────────────

test("the cap can be lowered but never raised, and a bad value means the hard cap", () => {
  assert.equal(HARD_BUDGET_USD, 1.5);
  assert.equal(budgetLimit(undefined), 1.5);
  assert.equal(budgetLimit("0.5"), 0.5);
  assert.equal(budgetLimit("1.5"), 1.5);
  for (const value of ["2", "100", "1000000", "Infinity"]) assert.equal(budgetLimit(value), 1.5, value);
  for (const value of ["", "abc", "0", "-3", "NaN"]) assert.equal(budgetLimit(value), 1.5, value);
  const guard = new SpendGuard({ spentUsd: 0, largestInput: 0, callsSent: 0 }, 50, MODELS, () => undefined);
  assert.equal(guard.budgetUsd, 1.5, "a guard built with a higher cap is held to the hard one");
});

test("a call is priced from reported tokens with the 1.5x margin, and the worst case is the dearest model at full size", () => {
  assert.equal(PRICE_SAFETY, 1.5);
  assert.ok(Math.abs(callCostUsd(PRO, { inputTokens: 1000, outputTokens: 1000 }) - (0.0008 + 0.0032) * 1.5) < 1e-12);
  assert.ok(Math.abs(worstCaseCallUsd([PRO], 0) - callCostUsd(PRO, { inputTokens: ASSUMED_MAX_INPUT_TOKENS, outputTokens: AGENT_MAX_OUTPUT_TOKENS })) < 1e-12);
  assert.equal(worstCaseCallUsd(MODELS, 0), worstCaseCallUsd([PRO], 0), "the cheaper fallback model does not lower the worst case");
  assert.ok(worstCaseCallUsd([PRO], 40_000) > worstCaseCallUsd([PRO], 0), "a larger input seen raises it");
  assert.throws(() => callCostUsd("some.unpriced-model", {}), /No price is known/);
  assert.throws(() => worstCaseCallUsd([PRO, "some.unpriced-model"], 0), /No price is known/);
  assert.throws(() => worstCaseCallUsd([], 0), /No model is configured/);
});

test("a call that could pass the cap is never allowed, even by a cent", () => {
  const worst = worstCaseCallUsd([PRO], 0);
  assert.equal(mayStartCall(1.5 - worst, [PRO], 0, 1.5), true);
  assert.equal(mayStartCall(1.5 - worst + 0.0001, [PRO], 0, 1.5), false);
  assert.equal(mayStartCall(1.5, [PRO], 0, 1.5), false);
  const estimate = estimateRun(40, MODELS, 1.5);
  assert.ok(estimate.typicalUsd > 0 && estimate.typicalUsd < 1.5, "a typical run fits under the cap");
  assert.equal(estimate.requests, 40);
});

test("a refused call counts nothing and saves nothing; an allowed one is saved at its worst case before it is sent", async () => {
  const saved: SpendState[] = [];
  const state = { spentUsd: 1.49, largestInput: 0, callsSent: 3 };
  const guard = new SpendGuard(state, 1.5, MODELS, (snapshot) => { saved.push({ ...snapshot }); });
  await assert.rejects(guard.reserve(), (error: unknown) => error instanceof BudgetReachedError && error.name === "AiBudgetExhausted");
  assert.deepEqual(state, { spentUsd: 1.49, largestInput: 0, callsSent: 3 });
  assert.equal(saved.length, 0);

  const roomy = { spentUsd: 0, largestInput: 0, callsSent: 0 };
  const open = new SpendGuard(roomy, 1.5, MODELS, (snapshot) => { saved.push({ ...snapshot }); });
  const reserved = await open.reserve();
  assert.equal(reserved, worstCaseCallUsd(MODELS, 0));
  assert.equal(saved.at(-1)!.spentUsd, Number(reserved.toFixed(6)), "the worst case is on disk before the call goes out");
  await open.settle(reserved, { modelId: PRO, usage: { inputTokens: 2000, outputTokens: 300 } });
  assert.ok(Math.abs(roomy.spentUsd - callCostUsd(PRO, { inputTokens: 2000, outputTokens: 300 })) < 1e-6, "the real cost replaces the reservation");
  assert.equal(roomy.largestInput, 2000);
  assert.equal(roomy.callsSent, 1);
});

test("with no usage reported, or a model with no price, the worst case stands", async () => {
  const state = { spentUsd: 0, largestInput: 0, callsSent: 0 };
  const guard = new SpendGuard(state, 1.5, MODELS, () => undefined);
  const worst = await guard.reserve();
  await guard.settle(worst, { modelId: PRO });
  await guard.settle(worst, { usage: { inputTokens: 1, outputTokens: 1 } });
  await guard.settle(worst, null);
  assert.equal(state.spentUsd, Number(worst.toFixed(6)));
});

test("the metered call never sends a refused request, keeps a reservation after an error, and tallies tool use", async () => {
  let sent = 0;
  const make = (response: AgentModelResponse | Error): AgentConverse => async () => { sent += 1; if (response instanceof Error) throw response; return response; };
  const request = { system: "s", messages: [{ role: "user" as const, content: [{ text: "hello" }] }], tools: [], timeoutMs: 1000 };

  const full = { spentUsd: 1.5, largestInput: 0, callsSent: 0 };
  const refused = newTally();
  await assert.rejects(meteredAgentCall(make({ content: [{ text: "hi" }] }), new SpendGuard(full, 1.5, MODELS, () => undefined), refused)(request), BudgetReachedError);
  assert.equal(sent, 0, "the model is never called once the cap would be passed");
  assert.equal(refused.refused, true);
  assert.equal(refused.modelCalls, 0);

  const state = { spentUsd: 0, largestInput: 0, callsSent: 0 };
  const guard = new SpendGuard(state, 1.5, MODELS, () => undefined);
  const tally = newTally();
  await assert.rejects(meteredAgentCall(make(Object.assign(new Error("timed out"), { name: "TimeoutError" })), guard, tally)(request), /timed out/);
  assert.equal(sent, 1);
  assert.equal(state.spentUsd, Number(worstCaseCallUsd(MODELS, 0).toFixed(6)), "an errored call may still be billed, so it is counted at its worst");

  const toolCall = { content: [{ toolUse: { toolUseId: "1", name: "get_weather", input: {} } }, { toolUse: { toolUseId: "2", name: "search_wardrobe", input: {} } }], usage: { inputTokens: 1000, outputTokens: 100 }, modelId: PRO } as AgentModelResponse;
  const counted = newTally();
  await meteredAgentCall(make(toolCall), new SpendGuard({ spentUsd: 0, largestInput: 0, callsSent: 0 }, 1.5, MODELS, () => undefined), counted)(request);
  assert.deepEqual(counted, { modelCalls: 1, toolUses: 2, corrections: 0, refused: false });
});

test("through the real agent: tool calls and an invented-outfit correction are counted, and a spent budget ends the turn as a fallback", async () => {
  const closet = closets[0];
  const wardrobe = closet.pieces.map(toWardrobeItem);
  const usage = { inputTokens: 3000, outputTokens: 200 };
  const turn = (call: AgentConverse, onFallback?: (failure: { kind: string }) => void) => runHangerAgent({
    message: "What should I wear to a meeting?", history: [], wardrobe, forecast: null, activeOutfit: [], remembered: "", rankingBase: {},
    loadTrends: async () => null, today: new Date("2026-03-10T12:00:00Z"), onFallback,
  }, call);
  const scripted = (...responses: AgentModelResponse[]) => { let at = 0; const seen: Parameters<AgentConverse>[0][] = []; const call: AgentConverse = async (request) => { seen.push(structuredClone(request)); return responses[Math.min(at++, responses.length - 1)]; }; return { call, seen }; };
  const withUsage = (response: AgentModelResponse): AgentModelResponse => ({ ...response, usage, modelId: PRO });
  const build = withUsage({ content: [{ toolUse: { toolUseId: "t", name: "build_outfits", input: { request: "work meeting" } as never } }] });
  const say = (text: string) => withUsage({ content: [{ text }] });

  const state = { spentUsd: 0, largestInput: 0, callsSent: 0 };
  const tally = newTally();
  const { call } = scripted(build, say("A tailored look for the meeting."));
  const result = await turn(meteredAgentCall(call, new SpendGuard(state, 1.5, MODELS, () => undefined), tally));
  assert.ok(result?.outfits.length);
  assert.deepEqual({ ...tally }, { modelCalls: 2, toolUses: 1, corrections: 0, refused: false });
  assert.ok(Math.abs(state.spentUsd - 2 * callCostUsd(PRO, usage)) < 1e-6);

  const corrected = newTally();
  const invented = scripted(say("1. White oxford shirt + Charcoal dress trousers + Black oxfords"), say("Wear the navy blazer with your oxford shirt."));
  const answer = await turn(meteredAgentCall(invented.call, new SpendGuard({ spentUsd: 0, largestInput: 0, callsSent: 0 }, 1.5, MODELS, () => undefined), corrected));
  assert.match(answer?.message ?? "", /navy blazer/);
  assert.equal(corrected.corrections, 1);
  assert.equal(corrected.modelCalls, 2);
  assert.equal(invented.seen[1].messages.at(-1)!.content![0].text, INVENTED_OUTFIT_CORRECTION);

  const spent = newTally();
  const never = scripted(say("never sent"));
  let failure: { kind: string } | null = null;
  const nothing = await turn(meteredAgentCall(never.call, new SpendGuard({ spentUsd: 1.49, largestInput: 0, callsSent: 0 }, 1.5, MODELS, () => undefined), spent), (details) => { failure = details; });
  assert.equal(nothing, null);
  assert.equal(never.seen.length, 0, "no model call was made");
  assert.equal(spent.refused, true);
  assert.equal(failure!.kind, "budget");
});

// ── Statistics ─────────────────────────────────────────────────────────────────

test("Wilson intervals match worked values and stay inside 0 to 1", () => {
  assert.deepEqual(wilson(5, 10), { rate: 0.5, low: 0.236593, high: 0.763407 });
  assert.deepEqual(wilson(1, 2), { rate: 0.5, low: 0.094531, high: 0.905469 });
  assert.deepEqual(wilson(0, 10), { rate: 0, low: 0, high: 0.277533 });
  assert.deepEqual(wilson(10, 10), { rate: 1, low: 0.722467, high: 1 });
  assert.equal(wilson(0, 0), null);
  const wide = wilson(18, 30)!, narrow = wilson(180, 300)!;
  assert.ok(narrow.high - narrow.low < wide.high - wide.low, "more requests narrow the interval");
});

test("Cohen's kappa matches the textbook example, perfect and chance-level agreement, and the undefined case", () => {
  // Fifty items: both yes 20, A yes/B no 5, A no/B yes 10, both no 15 → agreement 0.70, chance 0.50, kappa 0.40.
  const first = [...Array(20).fill("yes"), ...Array(5).fill("yes"), ...Array(10).fill("no"), ...Array(15).fill("no")];
  const second = [...Array(20).fill("yes"), ...Array(5).fill("no"), ...Array(10).fill("yes"), ...Array(15).fill("no")];
  assert.deepEqual(cohenKappa(first, second), { n: 50, observed: 0.7, expected: 0.5, kappa: 0.4 });
  assert.equal(cohenKappa(["a", "b", "tie", "a"], ["a", "b", "tie", "a"]).kappa, 1);
  assert.equal(cohenKappa(["a", "b", "a", "b"], ["b", "a", "a", "b"]).kappa, 0);
  assert.equal(cohenKappa(["a", "a"], ["a", "a"]).kappa, null, "both raters always said the same single thing: undefined, not 1");
  assert.throws(() => cohenKappa(["a"], ["a", "b"]), /equal, non-empty/);
  assert.throws(() => cohenKappa([], []), /equal, non-empty/);
});

// ── Forecasts ──────────────────────────────────────────────────────────────────

test("a request's forecast becomes the same shape the weather service returns, with the ranker's weather word", () => {
  const spec = { description: "light snow", highC: 2, lowC: -4, precipitationChance: 40, windMph: 12 };
  const forecast = buildForecast(spec, "2026-01-21");
  assert.equal(forecast.outfitWeather, "cold");
  assert.equal(forecast.today.highF, 36);
  assert.equal(forecast.today.lowF, 25);
  assert.match(forecast.summary, /light snow, 25–36°F \(-4–2°C\), 40% chance of rain/);
  assert.equal(weatherWord({ ...spec, precipitationChance: 85, highC: 14 }), "wet");
  assert.equal(weatherWord({ ...spec, highC: 31, precipitationChance: 5 }), "warm");
  assert.equal(weatherWord({ ...spec, highC: 15, precipitationChance: 10 }), null);
  for (const request of requests.filter((entry) => entry.kind === "weather")) assert.ok(request.forecast && !/rain|cold|hot|warm|snow|weather/i.test(request.text), `${request.id}: the request leaves the weather for Hanger to look up`);
});

// ── The scorer, on a tiny fixture worked out by hand ───────────────────────────

const tinyCloset: EvalCloset = {
  id: "t", name: "Tiny closet", synthetic: true, note: "synthetic",
  pieces: [
    { id: "t1", name: "Tee", category: "top", subtype: "t-shirt", color: "white", pattern: "solid", material: "cotton", style: [], season: "all-season", wearCount: 1, lastWornDays: 1 },
    { id: "b1", name: "Jeans", category: "bottom", subtype: "jeans", color: "blue", pattern: "solid", material: "denim", style: [], season: "all-season", wearCount: 1, lastWornDays: 1 },
    { id: "s1", name: "Sneakers", category: "shoe", subtype: "sneakers", color: "white", pattern: "solid", material: "leather", style: [], season: "all-season", wearCount: 1, lastWornDays: 1 },
    { id: "s2", name: "Boots", category: "shoe", subtype: "boots", color: "black", pattern: "solid", material: "leather", style: [], season: "all-season", wearCount: 1, lastWornDays: 1 },
  ],
};
const tinyRequests: EvalRequest[] = [
  { id: "r1", closet: "t", kind: "occasion", text: "Coffee", today: "2026-05-01" },
  { id: "r2", closet: "t", kind: "occasion", text: "Dinner", today: "2026-05-02" },
  { id: "r3", closet: "t", kind: "weather", text: "Out", today: "2026-05-03" },
  { id: "r4", closet: "t", kind: "impossible", text: "A tuxedo", today: "2026-05-04" },
];
const tinyKey: EvalKey = {
  version: 1, seed: "tiny",
  items: [
    { id: "r1", closet: "t", kind: "occasion", a: "hanger", b: "baseline", digest: "" },
    { id: "r2", closet: "t", kind: "occasion", a: "baseline", b: "hanger", digest: "" },
    { id: "r3", closet: "t", kind: "weather", a: "hanger", b: "baseline", digest: "" },
    { id: "r4", closet: "t", kind: "impossible", a: "baseline", b: "hanger", digest: "" },
  ],
};
const tinyRecord = (hanger: string[] | null, extra: Partial<RunRecord> = {}): RunRecord => ({ hangerOutfit: hanger, baselineOutfit: ["t1", "b1", "s2"], reply: "ok", toolsUsed: ["outfit builder"], fallback: null, modelCalls: 2, toolUses: 1, corrections: 0, ...extra });
const tinyRun: RunFile = {
  version: 1, seed: "tiny", spend: { spentUsd: 0.1234, largestInput: 3000, callsSent: 9 },
  records: {
    r1: tinyRecord(["t1", "b1", "s1"]), r2: tinyRecord(["t1", "b1", "s1"], { toolUses: 2, modelCalls: 3 }),
    r3: tinyRecord(["t1", "b1", "s1"], { reply: "Rain is coming, so boots.", fallback: { kind: "out-of-time" }, toolsUsed: [], toolUses: 0, modelCalls: 1, corrections: 1 }),
    r4: tinyRecord(null, { reply: "I don't see a tuxedo in your closet.", toolsUsed: [], toolUses: 0, modelCalls: 1 }),
  },
};
const choices = (...picks: Array<"A" | "B" | "tie">) => Object.fromEntries(picks.map((choice, index) => [`r${index + 1}`, { choice, reason: `reason ${index + 1}` }]));

test("two verdicts combine to Hanger above half, the baseline below it, and a tie at exactly half", () => {
  assert.equal(combineVerdicts("hanger", "hanger"), "hanger");
  assert.equal(combineVerdicts("hanger", "tie"), "hanger");
  assert.equal(combineVerdicts("tie", "hanger"), "hanger");
  assert.equal(combineVerdicts("tie", "tie"), "tie");
  assert.equal(combineVerdicts("hanger", "baseline"), "tie");
  assert.equal(combineVerdicts("baseline", "hanger"), "tie");
  assert.equal(combineVerdicts("baseline", "tie"), "baseline");
  assert.equal(combineVerdicts("baseline", "baseline"), "baseline");
});

test("the scorer unblinds with the key, keeps impossible asks out of the headline, and reports agreement, losses and tool use", () => {
  // Rater 1 → Hanger, baseline, baseline, tie.  Rater 2 → Hanger, Hanger, baseline, baseline.
  const { report, losing } = scoreEvaluation({
    key: tinyKey, run: tinyRun, closets: [tinyCloset], requests: tinyRequests, date: "2026-10-31",
    raters: [choices("A", "A", "B", "tie"), choices("A", "B", "B", "A")],
  });
  assert.deepEqual({ ...report.headline, winRate: undefined }, { requests: 3, hangerWins: 1, baselineWins: 1, ties: 1, winRate: undefined, basis: report.headline.basis });
  assert.deepEqual(report.headline.winRate, wilson(1, 2));
  assert.deepEqual(report.allRequests.winRate, wilson(1, 3));
  assert.equal(report.allRequests.hangerWins, 1);
  assert.equal(report.allRequests.baselineWins, 2);
  assert.deepEqual(report.agreement, { n: 4, observed: 0.5, expected: 0.375, kappa: 0.2 });
  assert.deepEqual(report.perRater.map((rater) => [rater.hangerPicks, rater.baselinePicks, rater.ties]), [[1, 2, 1], [2, 2, 0]]);
  assert.deepEqual(report.byKind.occasion, { requests: 2, hangerWins: 1, baselineWins: 0, ties: 1, winRate: wilson(1, 1) });
  assert.equal(report.byCloset.t.requests, 4);
  assert.deepEqual(report.impossibleAsks, { requests: 1, hangerOfferedAnOutfit: 0, hangerOfferedNone: 1, outcomes: { requests: 1, hangerWins: 0, baselineWins: 1, ties: 0 } });
  assert.equal(report.toolUse.turns, 4);
  assert.deepEqual(report.toolUse.toolCallsPerTurn, { mean: 0.75, median: 0.5, max: 2 });
  assert.deepEqual(report.toolUse.modelCallsPerTurn, { mean: 1.75, median: 1.5, max: 3 });
  assert.deepEqual(report.toolUse.fallbacks, { count: 1, rate: 0.25, byKind: { "out-of-time": 1 } });
  assert.deepEqual(report.toolUse.inventedOutfitCorrections, { count: 1, turnsCorrected: 1 });
  assert.equal(report.toolUse.countedSpendUsd, 0.12);
  assert.equal(report.toolUse.turnsWithNoToolCall, 2);

  assert.deepEqual(losing.map((entry) => entry.id), ["r3", "r4"]);
  assert.deepEqual(losing[0].raters, [{ picked: "baseline", reason: "reason 3" }, { picked: "baseline", reason: "reason 3" }]);
  assert.equal(losing[0].fallback, "out-of-time");
  assert.equal(losing[1].hangerOutfit, "(no outfit offered)");
  assert.match(losing[0].baselineOutfit, /Top: Tee\nBottom: Jeans\nShoe: Boots/);

  const markdown = renderResultsMarkdown(report, losing);
  assert.match(markdown, /1 of 2 decided \(50\.0%, 95% CI 9\.5%–90\.5%\); 1 tied/);
  assert.match(markdown, /kappa\)[^\n]*0\.20/);
  assert.match(markdown, /### r3 — Tiny closet \(weather\)/);
  assert.match(markdown, /Rater 2 chose the baseline: reason 3/);
  assert.match(markdown, /random valid outfit/);
  assert.doesNotMatch(JSON.stringify(report), /Tee|Jeans|Boots|tuxedo|reason 3/, "the published aggregates carry no outfits, replies or reasons");
});

test("the scorer reports no Hanger loss when there is none, and leaves kappa undefined when the raters never vary", () => {
  const allHanger = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { choice: tinyKey.items.find((item) => item.id === id)!.a === "hanger" ? "A" : "B", reason: "" }]));
  const { report, losing } = scoreEvaluation({
    key: tinyKey, run: tinyRun, closets: [tinyCloset], requests: tinyRequests, date: "2026-10-31",
    raters: [allHanger("r1", "r2", "r3", "r4") as never, allHanger("r1", "r2", "r3", "r4") as never],
  });
  assert.equal(report.headline.hangerWins, 3);
  assert.equal(report.agreement.kappa, null);
  assert.equal(losing.length, 0);
  assert.match(renderResultsMarkdown(report, losing), /No request went to the baseline\./);
  assert.match(renderResultsMarkdown(report, losing), /undefined \(both raters gave one answer throughout\)/);
});
