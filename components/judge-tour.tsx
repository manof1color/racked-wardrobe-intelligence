"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { DemoKind } from "@/lib/demo-session";
import {
  completeJudgeTourStep,
  isJudgeTourStepId,
  JUDGE_TOUR_PROGRESS_EVENT,
  JUDGE_TOURS,
  judgeTourStorageKey,
  nextJudgeTourStep,
  readJudgeTourState,
  requestJudgeTour,
  type JudgeTourState,
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
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * The judge guide (lib/judge-tour.ts): a step list above a demo workspace. Each step has a button
 * that takes the judge straight there, and ticks itself off when the dashboard reports it done.
 * It sits in the page rather than floating over it, so it never covers the bottom tabs or Hanger
 * on a phone, and it can be folded to one line.
 */
export function JudgeTour({ kind, sessionExpiresAt }: { kind: DemoKind; sessionExpiresAt: number }) {
  const tour = JUDGE_TOURS[kind];
  const storageKey = judgeTourStorageKey(kind, sessionExpiresAt);
  const raw = useSyncExternalStore(subscribe, () => readStored(storageKey), () => null);
  const state = useMemo(() => readJudgeTourState(raw, tour), [raw, tour]);
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

  const next = nextJudgeTourStep(state, tour);
  const doneCount = state.done.length;
  const total = tour.steps.length;
  const bodyId = `judge-tour-${kind}-steps`;

  // Named in full for assistive technology; the visible heading leaves "Judge guide" to the eyebrow above it.
  return <section className={`judge-tour${state.collapsed ? " collapsed" : ""}`} aria-label={`Judge guide: ${tour.heading.toLowerCase()}`}>
    <div className="judge-tour-head">
      <div>
        <div className="eyebrow">JUDGE GUIDE</div>
        <h2>{tour.heading}</h2>
      </div>
      <p className="judge-tour-progress" role="status" aria-live="polite">{doneCount === total ? "All steps done" : `${doneCount} of ${total} done`}</p>
      <button type="button" className="judge-tour-toggle" aria-expanded={!state.collapsed} aria-controls={bodyId} onClick={() => update((current) => ({ ...current, collapsed: !current.collapsed }))}>
        {state.collapsed ? "Show guide" : "Hide guide"}
      </button>
    </div>
    <div id={bodyId} hidden={state.collapsed}>
      <p className="judge-tour-intro">{tour.intro}</p>
      <ol className="judge-tour-steps">
        {tour.steps.map((step, index) => {
          const done = state.done.includes(step.id);
          const current = next?.id === step.id;
          return <li key={step.id} className={done ? "done" : current ? "current" : ""} aria-current={current ? "step" : undefined}>
            <span className="judge-tour-marker" aria-hidden="true">{done ? "✓" : index + 1}</span>
            <span className="judge-tour-copy">
              <strong>{step.title}{done && <span className="sr-only"> (done)</span>}</strong>
              {/* Only the step to do next explains itself, so the guide stays short on a phone. */}
              {current && <small>{step.detail}</small>}
            </span>
            <button type="button" className={`button button-small ${current ? "button-accent" : "button-light"}`} onClick={() => requestJudgeTour(step.request)}>
              {step.cta}<span className="sr-only">: {step.title}</span>
            </button>
          </li>;
        })}
      </ol>
      <div className="judge-tour-switch">
        <p>{next ? "Short on time? The other side takes two minutes too." : "This side is done. The other side takes two more minutes."}</p>
        <button type="button" className={`button button-small ${next ? "button-light" : "button-accent"}`} disabled={switching} onClick={switchSide}>
          {switching ? "Opening…" : <>{tour.switchTo.label} <span aria-hidden="true">{"→"}</span></>}
        </button>
      </div>
      {switchError && <div className="form-error" role="alert">{switchError}</div>}
    </div>
  </section>;
}
