/**
 * Wear points: a private nudge to record what you wear. Earned per piece once a day, more for a
 * piece back in rotation, capped daily, never tied to sharing, and never seen by a brand.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { awardNotice, DAILY_POINTS_CAP, isRediscovered, pointsWeek, REDISCOVERY_BONUS, shiftDay, streakAfterWear, streakLine, streakOn, wearAward, wearDay } from "../lib/wear-points.ts";
import { viewHeading } from "../lib/view-headings.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(root, path), "utf8");
const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-10-29T15:00:00Z");
const ago = (days: number) => new Date(now - days * DAY).toISOString();
const piece = (id: string, patch: Partial<Parameters<typeof isRediscovered>[0]> = {}) => ({ id, createdAt: ago(10), lastWornAt: ago(2), wornToday: false, ...patch });

test("the day is the person's own date, accepted only if it is a real date somewhere now", () => {
  assert.equal(wearDay("2026-10-29", now), "2026-10-29");
  assert.equal(wearDay("2026-10-30", now), "2026-10-30", "UTC+14 is already tomorrow");
  assert.equal(wearDay("2026-10-28", Date.parse("2026-10-29T03:00:00Z")), "2026-10-28", "US evening is still yesterday in UTC terms");
  assert.equal(wearDay("2026-10-27", now), "2026-10-29", "no time zone is two days behind");
  assert.equal(wearDay("2026-11-05", now), "2026-10-29", "a future date cannot bank points");
  for (const bad of [undefined, null, 20261029, "29/10/2026", "2026-10-29T00:00:00Z"]) assert.equal(wearDay(bad, now), "2026-10-29");
  assert.equal(shiftDay("2026-11-01", -1), "2026-10-31");
});

test("a piece back in rotation earns the bonus; a new piece cannot farm it", () => {
  assert.equal(isRediscovered(piece("old", { createdAt: ago(200), lastWornAt: ago(90) }), now), true);
  assert.equal(isRediscovered(piece("never", { createdAt: ago(61), lastWornAt: null }), now), true, "owned 60+ days and never worn");
  assert.equal(isRediscovered(piece("new", { createdAt: ago(3), lastWornAt: null }), now), false, "just added");
  assert.equal(isRediscovered(piece("recent", { createdAt: ago(200), lastWornAt: ago(30) }), now), false);
  assert.equal(isRediscovered(piece("undated", { createdAt: null, lastWornAt: null }), now), false, "no added date, no bonus");
});

test("each piece earns once a day, rediscovered pieces earn more, and the day is capped", () => {
  const award = wearAward([piece("a"), piece("b", { createdAt: ago(100), lastWornAt: ago(80) }), piece("c", { wornToday: true })], 0, now);
  assert.equal(award.points, 2 + REDISCOVERY_BONUS);
  assert.deepEqual(award.firstToday, ["a", "b"]);
  assert.deepEqual(award.rediscovered, ["b"]);
  assert.equal(award.capped, false);
  assert.equal(wearAward([piece("c", { wornToday: true })], 0, now).points, 0, "recording the same piece again earns nothing");
  const near = wearAward([piece("a"), piece("b"), piece("c")], DAILY_POINTS_CAP - 1, now);
  assert.deepEqual([near.points, near.capped], [1, true]);
  assert.equal(wearAward([piece("a")], DAILY_POINTS_CAP, now).points, 0);
  const ten = Array.from({ length: 10 }, (_, index) => piece(`p${index}`, { createdAt: ago(100), lastWornAt: null }));
  assert.equal(wearAward(ten, 0, now).points, DAILY_POINTS_CAP, "even ten forgotten pieces stop at the cap");
});

test("the week is the last seven days", () => {
  const week = pointsWeek([{ day: "2026-10-29", points: 3 }, { day: "2026-10-27", points: 5 }, { day: "2026-10-20", points: 9 }], "2026-10-29");
  assert.deepEqual(week.days.map((entry) => entry.day), ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"]);
  assert.equal(week.points, 8, "older days fall out of the week");
  assert.equal(week.daysLogged, 2);
  assert.equal(pointsWeek([{ day: "2026-10-29", points: 0 }], "2026-10-29").daysLogged, 1, "a wear recorded at the cap still logs the day");
  assert.match(read("components/wear-points-card.tsx"), /brands never see them/);
});

test("the streak grows one day at a time, and a missed day starts it again", () => {
  assert.deepEqual(streakAfterWear({}, "2026-10-29"), { day: "2026-10-29", streak: 1, best: 1, grew: true }, "a first wear starts it");
  assert.deepEqual(streakAfterWear({ streak: 4, best: 6, day: "2026-10-28" }, "2026-10-29"), { day: "2026-10-29", streak: 5, best: 6, grew: true });
  assert.deepEqual(streakAfterWear({ streak: 6, best: 6, day: "2026-10-28" }, "2026-10-29"), { day: "2026-10-29", streak: 7, best: 7, grew: true }, "a new best is kept");
  assert.deepEqual(streakAfterWear({ streak: 9, best: 9, day: "2026-10-26" }, "2026-10-29"), { day: "2026-10-29", streak: 1, best: 9, grew: true }, "a gap restarts it; the best stays");
  assert.equal(streakAfterWear({ streak: 3, best: 3, day: "2026-10-29" }, "2026-10-29").grew, false, "the same day counts once");
  assert.deepEqual(streakAfterWear({ streak: 3, best: 3, day: "2026-10-30" }, "2026-10-29"), { day: "2026-10-30", streak: 3, best: 3, grew: false }, "an earlier day changes nothing");
  assert.equal(streakAfterWear({ streak: 3, best: 3, day: "2026-10-31" }, "2026-11-01").streak, 4, "months roll over");
  assert.equal(streakAfterWear({ streak: "x" as unknown as number, day: "nonsense" }, "2026-10-29").streak, 1, "a damaged record starts afresh");
});

test("on any day the streak is alive until a full day is missed", () => {
  assert.deepEqual(streakOn({ streak: 5, best: 8, day: "2026-10-29" }, "2026-10-29"), { streak: 5, best: 8, loggedToday: true });
  assert.deepEqual(streakOn({ streak: 5, best: 8, day: "2026-10-28" }, "2026-10-29"), { streak: 5, best: 8, loggedToday: false }, "yesterday's streak is kept by logging today");
  assert.deepEqual(streakOn({ streak: 5, best: 8, day: "2026-10-27" }, "2026-10-29"), { streak: 0, best: 8, loggedToday: false }, "a missed day ends it");
  assert.deepEqual(streakOn({}, "2026-10-29"), { streak: 0, best: 0, loggedToday: false });
});

test("the card says what keeps the streak going", () => {
  assert.equal(streakLine({ streak: 0, best: 0, loggedToday: false }), "Log an outfit to start a daily streak.");
  assert.equal(streakLine({ streak: 0, best: 6, loggedToday: false }), "Log an outfit to start a new streak. Best: 6 days.");
  assert.equal(streakLine({ streak: 4, best: 6, loggedToday: false }), "4-day streak — log today to keep it going.");
  assert.equal(streakLine({ streak: 4, best: 6, loggedToday: true }), "4-day streak. Back tomorrow to make it 5.");
  assert.equal(streakLine({ streak: 7, best: 7, loggedToday: true }), "7-day streak — your best yet.");
});

test("the person is told what a wear earned, and why when it earned nothing", () => {
  assert.equal(awardNotice({ points: 1, rediscovered: 0, capped: false, repeat: false }), "+1 point.");
  assert.equal(awardNotice({ points: 5, rediscovered: 1, capped: false, repeat: false }), "+5 points — a piece back in rotation.");
  assert.match(awardNotice({ points: 0, rediscovered: 0, capped: true, repeat: false }), /today's 15 points; the wear still counts/);
  assert.match(awardNotice({ points: 0, rediscovered: 0, capped: false, repeat: true }), /Already counted today/);
  assert.equal(awardNotice({ points: 0, rediscovered: 0, capped: false, repeat: false }), "", "nothing to add, nothing said");
  assert.equal(awardNotice({ points: 2, rediscovered: 0, capped: false, repeat: false, streak: 5, streakGrew: true }), "+2 points. 5-day streak.");
  assert.equal(awardNotice({ points: 1, rediscovered: 0, capped: false, repeat: false, streak: 1, streakGrew: true }), "+1 point. Streak started — log tomorrow to keep it.");
  assert.equal(awardNotice({ points: 1, rediscovered: 0, capped: false, repeat: false, streak: 5, streakGrew: false }), "+1 point.", "only the first wear of the day mentions it");
});

test("the streak is written with the wear, cannot be extended twice in a race, and is read back with the points", () => {
  const store = read("lib/server/production-store.ts");
  const record = store.slice(store.indexOf("export async function recordRealWear"), store.indexOf("export async function getWearPoints"));
  assert.match(record, /\{PK:ownerPK,SK:pointsDayKey\},\{PK:ownerPK,SK:"POINTS"\}\]/, "the last streak day is read with the wear");
  assert.match(record, /streakAfterWear\(\{streak:totalsRecord\?\.streak,best:totalsRecord\?\.bestStreak,day:totalsRecord\?\.streakDay\},day\)/);
  assert.match(record, /ConditionExpression:totalsRecord\?\.streakDay===undefined\?"attribute_not_exists\(#streakDay\)":"#streakDay = :lastDay"/);
  assert.match(record, /\.\.\.\(totals\?\[\{Update:totals\}\]:\[\]\)/, "in the same transaction as the wear");
  const reader = store.slice(store.indexOf("export async function getWearPoints"), store.indexOf("export async function listOutfits"));
  assert.match(reader, /streak:streakOn\(\{streak:total\.Item\?\.streak,best:total\.Item\?\.bestStreak,day:total\.Item\?\.streakDay\},today\)/);
});

test("each wardrobe view opens with its own heading", () => {
  const views = (["home", "looks", "closet", "outfits"] as const).map((view) => viewHeading(view, { pieces: 12, outfits: 1, outfitWears: 4, wears: 30 }));
  assert.equal(new Set(views.map((heading) => `${heading.title} ${heading.accent}`)).size, 4, "no two views share a title");
  assert.equal(new Set(views.map((heading) => heading.eyebrow)).size, 4);
  assert.deepEqual(views[2].stats, [{ label: "Pieces", value: "12" }, { label: "Wears logged", value: "30" }]);
  assert.deepEqual(views[3].stats, [{ label: "Times worn", value: "4" }]);
  assert.deepEqual(viewHeading("outfits", { pieces: 0, outfits: 0, outfitWears: 0, wears: 0 }).stats, [], "no numbers before there is anything to count");
  const css = read("app/globals.css");
  for (const view of ["home", "looks", "closet", "outfits"]) assert.match(css, new RegExp(`\\.view-${view}\\{background:`), `.view-${view} has its own colour`);
  assert.match(read("components/consumer-dashboard.tsx"), /className=\{`workspace-heading view-heading view-\$\{activeView\}`\}/);
});

test("points are written with the wear, and brands see each piece at most once a day", () => {
  const store = read("lib/server/production-store.ts");
  const record = store.slice(store.indexOf("export async function recordRealWear"), store.indexOf("export async function getWearPoints"));
  assert.match(record, /const award=wearAward\(/);
  assert.match(record, /\.\.\.unique\.filter\(id=>firstToday\.has\(id\)\)\.flatMap\(id=>\{const productKey=/, "a repeat wear the same day sends no brand event");
  assert.match(record, /SK:dayMarker\(id\),ttl:[^}]*\},ConditionExpression:"attribute_not_exists\(PK\)"/, "the once-a-day marker cannot be written twice");
  assert.match(record, /ConditionExpression:"attribute_not_exists\(#points\) OR #points <= :room"/, "the cap holds under concurrent wears");
  assert.match(record, /":room":DAILY_POINTS_CAP-award\.points/);
  assert.match(record, /await db\.send\(new TransactWriteCommand\(\{TransactItems:\[\.\.\.guards,\.\.\.writes\]\}\)\)/, "points and wear are one transaction");
  assert.doesNotMatch(record, /brandDataSharing|consent/i, "earning never depends on sharing with brands");
});

test("points are the person's alone: consumer-only route, and nothing a brand reads touches them", () => {
  const route = read("app/api/points/route.ts");
  assert.match(route, /if \(session\.role!=="consumer"\) return NextResponse\.json\(\{error:"Consumer role required\."\},\{status:403\}\);/);
  assert.match(route, /getWearPoints\(session\.subject,/, "only the session's own points");
  const brandFiles: string[] = [];
  const walk = (dir: string) => { for (const name of readdirSync(join(root, dir))) { const path = `${dir}/${name}`; if (statSync(join(root, path)).isDirectory()) walk(path); else brandFiles.push(path); } };
  walk("app/api/brand");
  for (const path of [...brandFiles, "lib/metrics.ts", "lib/brand-community-metrics.ts", "components/brand-dashboard.tsx"]) {
    assert.doesNotMatch(read(path), /POINTSDAY|wear-points|getWearPoints|pointsWeek/, `${path} must not read wear points`);
  }
  const wears = read("app/api/wears/route.ts");
  assert.match(wears, /onlyFields\(body,\["itemId","itemIds","outfitId","requestId","localDate"\]\)/);
  assert.match(wears, /points:result\.points/);
});
