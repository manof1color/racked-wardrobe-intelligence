"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { DemoKind } from "@/lib/demo-session";
import {
  completeJudgeTourStep,
  isJudgeTourStepId,
  JUDGE_TOUR_PROGRESS_EVENT,
  JUDGE_TOURS,
  judgeTourStorageKey,
  judgeTourTargetSelector,
  nextJudgeTourStep,
  readJudgeTourState,
  requestJudgeTour,
  type JudgeTourState,
  type JudgeTourStepId,
} from "@/lib/judge-tour";

// Progress lives in the browser's storage, with a copy in memory for a private window where storage
// throws. Reading it through useSyncExternalStore keeps the server's HTML (no progress) and the
// browser's first render in agreement, without a state update inside an effect.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
function readStored(key: string) {
  try { const value = window.localStorage.getItem(key); if (value !== null) return value; } catch { /* storage unavailable */ }
  return memory.get(key) ?? null;
}
function writeStored(key: string, value: string) {
  memory.set(key, value);
  try { window.localStorage.setItem(key, value); } catch { /* kept in memory for this visit */ }
  for (const listener of listeners) listener();
}
// The Community purchase finishes in the fictional store, which opens in a new tab. That tab has its
// own guide and writes the same key, and the browser's storage event brings the change back here.
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}

/** The attribute that rings the current step's target. An attribute, not a class, so React's own className updates never drop it. */
export const SPOTLIGHT_ATTRIBUTE = "data-tour-spotlight";

/**
 * The judge guide (lib/judge-tour.ts) as a small dock: the current step, its button, and progress
 * dots, with every step one tap away. It floats over a corner instead of pushing the page down: on a
 * phone it sits above the bottom tabs, beside the Hanger button; on a computer, in the bottom-left
 * corner. It never dims or blocks the page. The element the current step needs (the Add button, the
 * Hanger button, a product card) is ringed with a spotlight wherever it is on screen, so a judge can
 * tap it themselves or use the step's button. Dialogs and Hanger sit above it.
 */
export function JudgeTour({ kind, sessionExpiresAt, visited }: { kind: DemoKind; sessionExpiresAt: number; visited?: JudgeTourStepId }) {
  const tour = JUDGE_TOURS[kind];
  const storageKey = judgeTourStorageKey(kind, sessionExpiresAt);
  const raw = useSyncExternalStore(subscribe, () => readStored(storageKey), () => null);
  const state = useMemo(() => readJudgeTourState(raw, tour), [raw, tour]);
  const [expanded, setExpanded] = useState(false);
  // Whether the current step's target is ringed on screen right now; the dock only says "tap the
  // highlighted button" when there is one.
  const [spotlit, setSpotlit] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");

  function update(change: (current: JudgeTourState) => JudgeTourState) {
    const current = readJudgeTourState(readStored(storageKey), tour);
    const next = change(current);
    if (next !== current) writeStored(storageKey, JSON.stringify(next));
  }

  useEffect(() => {
    function onProgress(event: Event) {
      const step = (event as CustomEvent<{ step?: unknown }>).detail?.step;
      if (!isJudgeTourStepId(step)) return;
      const current = readJudgeTourState(readStored(storageKey), tour);
      const next = completeJudgeTourStep(current, tour, step);
      if (next !== current) writeStored(storageKey, JSON.stringify(next));
    }
    window.addEventListener(JUDGE_TOUR_PROGRESS_EVENT, onProgress);
    return () => window.removeEventListener(JUDGE_TOUR_PROGRESS_EVENT, onProgress);
  }, [storageKey, tour]);

  // A step that is done by arriving on a page (Community) is ticked by that page's guide.
  useEffect(() => {
    if (!visited) return;
    const current = readJudgeTourState(readStored(storageKey), tour);
    const next = completeJudgeTourStep(current, tour, visited);
    if (next !== current) writeStored(storageKey, JSON.stringify(next));
  }, [visited, storageKey, tour]);

  const next = nextJudgeTourStep(state, tour);
  const target = next?.target ?? null;

  // The spotlight follows the current step's target as views change (a tab switch, a product opening,
  // the catalog loading), so it is re-checked a few times a second rather than wired into each view.
  // Only an element actually on screen is ringed; the phone's Add tab and the desktop's Add button
  // share a target, and whichever is showing gets the ring.
  useEffect(() => {
    if (!target || state.collapsed) return;
    const selector = judgeTourTargetSelector(target);
    let lit: Element | null = null;
    const light = () => {
      const shown = Array.from(document.querySelectorAll(selector)).find((element) => element.getClientRects().length > 0) ?? null;
      if (lit && lit !== shown) lit.removeAttribute(SPOTLIGHT_ATTRIBUTE);
      if (shown && !shown.hasAttribute(SPOTLIGHT_ATTRIBUTE)) shown.setAttribute(SPOTLIGHT_ATTRIBUTE, "");
      lit = shown;
      setSpotlit(shown !== null);
    };
    const first = window.setTimeout(light, 0);
    const timer = window.setInterval(light, 500);
    return () => { window.clearTimeout(first); window.clearInterval(timer); lit?.removeAttribute(SPOTLIGHT_ATTRIBUTE); setSpotlit(false); };
  }, [target, state.collapsed]);

  async function switchSide() {
    setSwitching(true); setSwitchError("");
    try {
      const response = await fetch("/api/auth/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: tour.switchTo.kind }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The other demo is temporarily unavailable.");
      window.location.assign(data.destination);
    } catch (reason) {
      setSwitchError(reason instanceof Error ? reason.message : "The other demo is temporarily unavailable.");
      setSwitching(false);
    }
  }

  const doneCount = state.done.length;
  const total = tour.steps.length;
  const label = `Judge guide: ${tour.heading.toLowerCase()}`;
  const listId = `judge-tour-${kind}-steps`;
  const stepNumber = next ? tour.steps.findIndex((step) => step.id === next.id) + 1 : total;

  // Folded to a pill: one tap brings the dock back, and the spotlight is off meanwhile.
  if (state.collapsed) return <section className="judge-tour-pill" aria-label={label}>
    <button type="button" aria-expanded={false} onClick={() => update((current) => ({ ...current, collapsed: false }))}>
      Show guide <span aria-hidden="true">·</span> {doneCount}/{total}
    </button>
  </section>;

  const switchButton = (primary: boolean) => <button type="button" className={`button button-small ${primary ? "button-accent" : "judge-tour-ghost"}`} disabled={switching} onClick={switchSide}>
    {switching ? "Opening…" : <>{tour.switchTo.label} <span aria-hidden="true">→</span></>}
  </button>;

  return <section className={`judge-tour${expanded ? " expanded" : ""}`} aria-label={label}>
    <div className="judge-tour-bar">
      <ol className="judge-tour-dots" aria-hidden="true">
        {tour.steps.map((step) => <li key={step.id} className={state.done.includes(step.id) ? "done" : next?.id === step.id ? "current" : ""}/>)}
      </ol>
      <p className="judge-tour-progress" role="status" aria-live="polite">{doneCount === total ? "All steps done" : `${doneCount} of ${total} done`}</p>
      <button type="button" className="judge-tour-icon" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded((value) => !value)}>{expanded ? "Fewer" : "All steps"}</button>
      <button type="button" className="judge-tour-icon" aria-label="Minimize guide" onClick={() => { setExpanded(false); update((current) => ({ ...current, collapsed: true })); }}><span aria-hidden="true">–</span></button>
    </div>

    {next
      ? <div className="judge-tour-now">
        <p className="judge-tour-eyebrow">Step {stepNumber} of {total} · {tour.heading}</p>
        <h2>{next.title}</h2>
        <p className="judge-tour-detail">{next.detail}</p>
        <div className="judge-tour-actions">
          <button type="button" className="button button-accent button-small" onClick={() => requestJudgeTour(next.request)}>{next.cta}</button>
          {spotlit && <span className="judge-tour-hint">or tap the highlighted button</span>}
        </div>
      </div>
      : <div className="judge-tour-now">
        <p className="judge-tour-eyebrow">{tour.heading}</p>
        <h2>All done here.</h2>
        <p className="judge-tour-detail">The other side takes about two minutes too.</p>
        <div className="judge-tour-actions">{switchButton(true)}</div>
      </div>}

    <div id={listId} className="judge-tour-all" hidden={!expanded}>
      <p>{tour.intro}</p>
      <ol className="judge-tour-steps">
        {tour.steps.map((step, index) => {
          const done = state.done.includes(step.id);
          const current = next?.id === step.id;
          return <li key={step.id} className={done ? "done" : current ? "current" : ""} aria-current={current ? "step" : undefined}>
            <span className="judge-tour-marker" aria-hidden="true">{done ? "✓" : index + 1}</span>
            <strong>{step.title}{done && <span className="sr-only"> (done)</span>}</strong>
            <button type="button" className="judge-tour-go" aria-label={`Go: ${step.title}`} onClick={() => requestJudgeTour(step.request)}>Go</button>
          </li>;
        })}
      </ol>
      {next && <div className="judge-tour-switch">{switchButton(false)}</div>}
    </div>
    {switchError && <div className="form-error" role="alert">{switchError}</div>}
  </section>;
}
