/**
 * Wear points: a small, private nudge to record what you actually wear, because recorded wear is the
 * only thing that ever reaches a brand (and only as consented totals at k ≥ 25).
 *
 * The rules (docs/brand-linking-incentives.md):
 * - Points are earned for recording a wear, identically whether or not the person shares with brands.
 *   A reward for sharing would buy consent.
 * - Points stay on the account. No brand sees them, and they never become money, discounts or entries.
 * - A daily streak (owner decision, 2026-10-29): consecutive days with at least one recorded wear.
 *   It counts the day, not the points, so a wear at the daily cap still keeps it. It earns no extra
 *   points, and like the points it is private and has nothing to do with sharing.
 * - Each piece earns once per day, and the day is capped, so tapping Record again earns nothing. The
 *   same once-a-day rule decides which wears reach brand data, so points cannot inflate it.
 */

export const POINTS_PER_PIECE = 1;
/** Extra points for wearing a piece that has sat unworn: the sustainability nudge. */
export const REDISCOVERY_BONUS = 3;
export const REDISCOVERY_DAYS = 60;
export const DAILY_POINTS_CAP = 15;
export const POINTS_WEEK_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The calendar day a wear counts towards. The browser sends its own local date, so a wear at 9 pm
 * in New York counts for that evening; it is accepted only if some place on Earth is on that date
 * now (UTC−12 to UTC+14). Anything else falls back to the server's UTC date.
 */
export function wearDay(localDate: unknown, now: number) {
  const possible = new Set([isoDay(now - 12 * 60 * 60 * 1000), isoDay(now), isoDay(now + 14 * 60 * 60 * 1000)]);
  return typeof localDate === "string" && DATE.test(localDate) && possible.has(localDate) ? localDate : isoDay(now);
}

/** The day before or after a YYYY-MM-DD date. */
export function shiftDay(day: string, days: number) {
  return isoDay(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS);
}

export interface PointsPiece {
  id: string;
  /** When the piece was added to the wardrobe. */
  createdAt?: string | null;
  /** When it was last recorded as worn, before this wear. */
  lastWornAt?: string | null;
  /** Already recorded as worn on this day: earns nothing again. */
  wornToday: boolean;
}

/**
 * A piece is rediscovered when it has been in the wardrobe for at least 60 days and not worn in
 * them. A newly added piece never qualifies, so adding pieces cannot farm the bonus.
 */
export function isRediscovered(piece: PointsPiece, now: number) {
  const cutoff = now - REDISCOVERY_DAYS * DAY_MS;
  const added = piece.createdAt ? Date.parse(piece.createdAt) : NaN;
  if (!Number.isFinite(added) || added > cutoff) return false;
  const worn = piece.lastWornAt ? Date.parse(piece.lastWornAt) : NaN;
  return !Number.isFinite(worn) || worn <= cutoff;
}

/** What recording these pieces earns today, given what the day has already earned. */
export function wearAward(pieces: PointsPiece[], earnedToday: number, now: number) {
  const firstToday = pieces.filter((piece) => !piece.wornToday);
  const rediscovered = firstToday.filter((piece) => isRediscovered(piece, now));
  const earned = firstToday.length * POINTS_PER_PIECE + rediscovered.length * REDISCOVERY_BONUS;
  const room = Math.max(0, DAILY_POINTS_CAP - Math.max(0, earnedToday));
  return {
    points: Math.min(earned, room),
    firstToday: firstToday.map((piece) => piece.id),
    rediscovered: rediscovered.map((piece) => piece.id),
    capped: earned > room,
  };
}

export interface PointsDay {
  day: string;
  points: number;
}

/** The rolling seven days ending today, oldest first: points, and whether anything was recorded. */
export function pointsWeek(days: PointsDay[], today: string) {
  const byDay = new Map(days.map((entry) => [entry.day, entry]));
  const week = Array.from({ length: POINTS_WEEK_DAYS }, (_, index) => {
    const day = shiftDay(today, index - (POINTS_WEEK_DAYS - 1));
    const entry = byDay.get(day);
    return { day, points: entry ? Math.max(0, entry.points) : 0, logged: Boolean(entry) };
  });
  return {
    days: week,
    points: week.reduce((sum, entry) => sum + entry.points, 0),
    daysLogged: week.filter((entry) => entry.logged).length,
  };
}

export interface StreakState {
  /** Consecutive days with a recorded wear, ending on `day`. */
  streak?: number | null;
  best?: number | null;
  /** The last day with a recorded wear. */
  day?: string | null;
}

const streakFields = (state: StreakState) => {
  const day = typeof state.day === "string" && DATE.test(state.day) ? state.day : null;
  const streak = day ? Math.max(0, Math.floor(Number(state.streak) || 0)) : 0;
  return { day, streak, best: Math.max(streak, Math.floor(Number(state.best) || 0)) };
};

/**
 * The streak after recording a wear on `day`. The day after the last logged day extends it; a gap
 * starts again at 1. A day already logged, or an earlier one (a wear recorded from behind the
 * date line), leaves it as it is.
 */
export function streakAfterWear(state: StreakState, day: string) {
  const current = streakFields(state);
  if (current.day && current.day >= day) return { ...current, grew: false };
  const streak = current.day && shiftDay(current.day, 1) === day ? current.streak + 1 : 1;
  return { day, streak, best: Math.max(current.best, streak), grew: true };
}

/**
 * The streak as it stands on `today`. Logged yesterday but not yet today, it is still alive: today
 * is the day to keep it. Older than that, it has ended, and only the best is kept.
 */
export function streakOn(state: StreakState, today: string) {
  const current = streakFields(state);
  const alive = current.day !== null && (current.day >= today || current.day === shiftDay(today, -1));
  return { streak: alive ? current.streak : 0, best: current.best, loggedToday: current.day !== null && current.day >= today };
}

/** Home's streak line: how long it is, and whether today still needs a wear to keep it. */
export function streakLine({ streak, best, loggedToday }: ReturnType<typeof streakOn>) {
  if (streak === 0) return best > 0 ? `Log an outfit to start a new streak. Best: ${best} days.` : "Log an outfit to start a daily streak.";
  const days = `${streak}-day streak`;
  if (!loggedToday) return `${days} — log today to keep it going.`;
  return streak >= best && streak > 1 ? `${days} — your best yet.` : `${days}. Back tomorrow to make it ${streak + 1}.`;
}

/** The line under a recorded wear: what it earned, and why when it earned nothing. */
export function awardNotice(award: { points: number; rediscovered: number; capped: boolean; repeat: boolean; streak?: number; streakGrew?: boolean }) {
  const streak = award.streakGrew && award.streak ? (award.streak === 1 ? " Streak started — log tomorrow to keep it." : ` ${award.streak}-day streak.`) : "";
  if (award.points > 0) {
    const bonus = award.rediscovered ? ` — ${award.rediscovered === 1 ? "a piece" : `${award.rediscovered} pieces`} back in rotation` : "";
    return `+${award.points} point${award.points === 1 ? "" : "s"}${bonus}.${streak}`;
  }
  if (award.capped) return `You've earned today's ${DAILY_POINTS_CAP} points; the wear still counts.${streak}`;
  if (award.repeat) return "Already counted today; the wear is still recorded.";
  return streak.trim();
}
