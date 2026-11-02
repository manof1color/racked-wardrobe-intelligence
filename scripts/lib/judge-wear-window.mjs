// The brand dashboard's eight-week wear chart, computed the way lib/metrics.ts computes it: the
// Monday-to-Sunday week `now` falls in, so far, and the seven weeks before it, oldest first. Plain
// JavaScript so scripts/verify-judge-accounts.mjs runs it under plain `node`;
// tests/judge-accounts.test.ts checks it gives the same buckets as the app.

const DAY_MS = 86_400_000;

/** What a judge must see on Judge Signature Tee, and what the verifier fails on. */
export const JUDGE_CHART_RULE = {
  weeks: 8,
  /** Weeks of the eight that must show a number rather than "fewer than 5". */
  minimumShownWeeks: 6,
  /** The dashboard withholds any week under this (MINIMUM_CELL_SIZE in lib/metrics.ts). */
  minimumWearsPerWeek: 5,
  /** A chart whose newest wear is older than this reads as abandoned. */
  maximumNewestWearAgeDays: 7,
};

export function weeklyWearBuckets(dates, now) {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const times = dates.map((value) => new Date(value).getTime()).filter((time) => !Number.isNaN(time));
  return Array.from({ length: JUDGE_CHART_RULE.weeks }, (_, index) => {
    const start = new Date(monday);
    start.setUTCDate(monday.getUTCDate() - (JUDGE_CHART_RULE.weeks - 1 - index) * 7);
    const end = start.getTime() + 7 * DAY_MS;
    return { weekStart: start.toISOString(), wears: times.filter((time) => time >= start.getTime() && time < end).length };
  });
}

/** Every way the released product's chart falls short of the rule. Empty means a judge sees a full chart. */
export function judgeChartProblems(dates, now) {
  const problems = [];
  const buckets = weeklyWearBuckets(dates, now);
  const shown = buckets.filter((bucket) => bucket.wears >= JUDGE_CHART_RULE.minimumWearsPerWeek).length;
  if (shown < JUDGE_CHART_RULE.minimumShownWeeks) problems.push(`${shown} of ${JUDGE_CHART_RULE.weeks} weeks hold ${JUDGE_CHART_RULE.minimumWearsPerWeek}+ wears; at least ${JUDGE_CHART_RULE.minimumShownWeeks} must`);
  const newest = Math.max(...dates.map((value) => new Date(value).getTime()).filter((time) => !Number.isNaN(time)));
  const age = Number.isFinite(newest) ? (now.getTime() - newest) / DAY_MS : Infinity;
  if (age > JUDGE_CHART_RULE.maximumNewestWearAgeDays) problems.push(Number.isFinite(age) ? `the newest wear is ${Math.floor(age)} days old; at most ${JUDGE_CHART_RULE.maximumNewestWearAgeDays} allowed` : "there are no wears");
  return problems;
}
