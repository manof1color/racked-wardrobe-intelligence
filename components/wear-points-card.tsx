"use client";

import { useEffect, useId, useState } from "react";
import type { SavedOutfit, WardrobeItem } from "@/lib/types";
import { DAILY_POINTS_CAP, REDISCOVERY_BONUS, REDISCOVERY_DAYS, streakLine, type streakOn } from "@/lib/wear-points";
import { localDay } from "@/lib/wear-client";

interface PointsWeek {
  points: number;
  daysLogged: number;
  days: Array<{ day: string; points: number; logged: boolean }>;
}

type Streak = ReturnType<typeof streakOn>;

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" });

/**
 * Home's "This week" card: points from recorded wears over the last seven days, and one place to log
 * what you are wearing today. Points are private to the account and never reach a brand.
 */
export function WearPointsCard({ items, outfits, refreshKey, onWearOutfit, onWearPieces }: {
  items: WardrobeItem[];
  outfits: SavedOutfit[];
  refreshKey: number;
  onWearOutfit: (outfit: SavedOutfit) => Promise<void>;
  onWearPieces: (itemIds: string[]) => Promise<void>;
}) {
  const [week, setWeek] = useState<PointsWeek | null>(null);
  const [total, setTotal] = useState(0);
  const [streak, setStreak] = useState<Streak>({ streak: 0, best: 0, loggedToday: false });
  const [unavailable, setUnavailable] = useState(false);
  const [logging, setLogging] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const panelId = useId();

  useEffect(() => {
    let live = true;
    fetch(`/api/points?today=${localDay()}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("points"))))
      .then((data: { week: PointsWeek; total: number; streak?: Streak }) => { if (live) { setWeek(data.week); setTotal(data.total); setStreak(data.streak ?? { streak: 0, best: 0, loggedToday: false }); setUnavailable(false); } })
      .catch(() => { if (live) setUnavailable(true); });
    return () => { live = false; };
  }, [refreshKey]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); setChosen([]); setLogging(false); } finally { setBusy(false); }
  }
  const toggle = (id: string) => setChosen((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : current.length >= 10 ? current : [...current, id]));

  return (
    <article className="metric-card points-card" aria-labelledby={`${panelId}-title`}>
      <span className="metric-icon coral-bg" aria-hidden="true">★</span>
      <small id={`${panelId}-title`}>THIS WEEK</small>
      {unavailable ? <p>Points are unavailable right now. Recording a wear still works.</p> : <>
        <strong>{week?.points ?? 0} <span className="points-unit">points</span></strong>
        <p className={`points-streak${streak.streak > 0 ? " live" : ""}${streak.streak > 0 && !streak.loggedToday ? " due" : ""}`}><span aria-hidden="true">{streak.streak > 0 ? "🔥" : "○"}</span> {streakLine(streak)}</p>
        <p>Logged {week?.daysLogged ?? 0} of 7 days · {total} all time</p>
        {week && <ol className="points-days" aria-label="Points for each of the last seven days">
          {week.days.map((entry) => <li key={entry.day} className={entry.logged ? "logged" : ""} aria-label={`${entry.day}: ${entry.logged ? `${entry.points} point${entry.points === 1 ? "" : "s"}` : "nothing logged"}`}><span aria-hidden="true">{weekday(entry.day)}</span></li>)}
        </ol>}
      </>}
      <p className="points-rule">1 point per piece you wear, +{REDISCOVERY_BONUS} for one unworn in {REDISCOVERY_DAYS} days, up to {DAILY_POINTS_CAP} a day. Private to you; brands never see them.</p>
      <button type="button" className="button button-accent" aria-expanded={logging} aria-controls={`${panelId}-log`} onClick={() => setLogging((open) => !open)}>{logging ? "Close" : "Log today's outfit"}</button>
      {logging && <div id={`${panelId}-log`} className="points-log">
        {outfits.length > 0 && <fieldset><legend>Wore a saved outfit?</legend>
          <ul>{outfits.slice(0, 6).map((outfit) => <li key={outfit.id}><button type="button" disabled={busy} onClick={() => run(() => onWearOutfit(outfit))}>{outfit.name}</button></li>)}</ul>
        </fieldset>}
        <fieldset><legend>Or choose the pieces (up to 10)</legend>
          <ul className="points-pieces">{items.map((item) => <li key={item.id}><label><input type="checkbox" checked={chosen.includes(item.id)} disabled={busy || (!chosen.includes(item.id) && chosen.length >= 10)} onChange={() => toggle(item.id)} /> {item.name}</label></li>)}</ul>
        </fieldset>
        <button type="button" className="button" disabled={busy || chosen.length === 0} onClick={() => run(() => onWearPieces(chosen))}>{busy ? "Recording…" : `Record ${chosen.length || ""} piece${chosen.length === 1 ? "" : "s"}`.replace("  ", " ")}</button>
      </div>}
    </article>
  );
}
