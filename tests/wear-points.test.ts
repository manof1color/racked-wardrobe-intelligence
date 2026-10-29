/**
 * Wear points: a private nudge to record what you wear. Earned per piece once a day, more for a
 * piece back in rotation, capped daily, never tied to sharing, and never seen by a brand.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { awardNotice, DAILY_POINTS_CAP, isRediscovered, pointsWeek, REDISCOVERY_BONUS, shiftDay, wearAward, wearDay } from "../lib/wear-points.ts";

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

test("the week is the last seven days, with no streak to lose", () => {
  const week = pointsWeek([{ day: "2026-10-29", points: 3 }, { day: "2026-10-27", points: 5 }, { day: "2026-10-20", points: 9 }], "2026-10-29");
  assert.deepEqual(week.days.map((entry) => entry.day), ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"]);
  assert.equal(week.points, 8, "older days fall out of the week");
  assert.equal(week.daysLogged, 2);
  assert.equal(pointsWeek([{ day: "2026-10-29", points: 0 }], "2026-10-29").daysLogged, 1, "a wear recorded at the cap still logs the day");
  const card = read("components/wear-points-card.tsx");
  assert.doesNotMatch(card, /streak/i);
  assert.match(card, /brands never see them/);
});

test("the person is told what a wear earned, and why when it earned nothing", () => {
  assert.equal(awardNotice({ points: 1, rediscovered: 0, capped: false, repeat: false }), "+1 point.");
  assert.equal(awardNotice({ points: 5, rediscovered: 1, capped: false, repeat: false }), "+5 points — a piece back in rotation.");
  assert.match(awardNotice({ points: 0, rediscovered: 0, capped: true, repeat: false }), /today's 15 points; the wear still counts/);
  assert.match(awardNotice({ points: 0, rediscovered: 0, capped: false, repeat: true }), /Already counted today/);
  assert.equal(awardNotice({ points: 0, rediscovered: 0, capped: false, repeat: false }), "", "nothing to add, nothing said");
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
