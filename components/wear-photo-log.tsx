/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PhotoSourcePicker } from "./photo-source-picker";
import { useDialogFocus } from "./use-dialog-focus";
import { Icon } from "./icons";
import { prepareImageForUpload, readJsonResponse } from "@/lib/upload-client";
import { MAX_WEAR_PIECES, type WearPhotoSuggestion } from "@/lib/wear-photo-match";
import { chooseForRow, chosenItemIds, startReview, statusLine, toggleExtra, usedElsewhere, type ReviewState } from "@/lib/wear-photo-review";
import type { WearPhotoScanResult } from "@/lib/wear-photo-scan";
import type { WardrobeItem } from "@/lib/types";

/** Longer than the detector's own timeout, so a slow scan ends in its honest fallback rather than here. */
const SCAN_TIMEOUT_MS = 45_000;

type Step = "photo" | "scanning" | "review";

function Thumb({ item }: { item: WardrobeItem }) {
  return <span className={`wear-photo-thumb ${item.imageUrl ? "" : item.art}`} aria-hidden="true">{item.imageUrl && <img src={item.imageUrl} alt="" />}</span>;
}

/**
 * "Log with a photo": photograph today's outfit, see which of your own closet pieces Racked thinks
 * they are, confirm or change each one, then record. Nothing is recorded until "Record" is tapped,
 * and that goes through the same wear request as logging by hand. The photo is not kept.
 */
export function WearPhotoLog({ items, onRecord, onClose }: { items: WardrobeItem[]; onRecord: (itemIds: string[]) => Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const [step, setStep] = useState<Step>("photo");
  const [suggestions, setSuggestions] = useState<WearPhotoSuggestion[]>([]);
  const [review, setReview] = useState<ReviewState>({ rows: [], extras: [] });
  const [message, setMessage] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const scan = useRef<AbortController | null>(null);
  const close = useCallback(() => { scan.current?.abort(); onClose(); }, [onClose]);
  useDialogFocus(dialog, true, close);
  useEffect(() => () => scan.current?.abort(), []);

  const byId = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  const chosen = chosenItemIds(review);
  const full = chosen.length >= MAX_WEAR_PIECES;

  function pickByHand(reason: string) {
    setSuggestions([]);
    setReview({ rows: [], extras: [] });
    setMessage(reason);
    setShowManual(true);
    setStep("review");
  }

  async function scanPhoto(file: File) {
    setStep("scanning");
    setMessage("");
    const controller = new AbortController();
    scan.current = controller;
    const timer = window.setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
    try {
      const form = new FormData();
      form.append("photo", await prepareImageForUpload(file));
      const response = await fetch("/api/wears/photo", { method: "POST", body: form, signal: controller.signal });
      const data = await readJsonResponse<Partial<WearPhotoScanResult> & { error?: string }>(response, "The photo scan returned an unreadable answer.");
      if (!response.ok || data.outcome !== "suggestions" || !data.suggestions?.length) {
        pickByHand(data.message ?? data.error ?? "Racked could not match this photo. Choose the pieces by hand instead.");
        return;
      }
      // Only pieces this screen can show; the server already limited them to this closet.
      const usable = data.suggestions.map(entry => ({ ...entry, candidates: entry.candidates.filter(candidate => byId.has(candidate.itemId)), preselectedItemId: entry.preselectedItemId && byId.has(entry.preselectedItemId) ? entry.preselectedItemId : null }));
      setSuggestions(usable);
      setReview(startReview(usable));
      setShowManual(false);
      setStep("review");
    } catch (error) {
      if (controller.signal.aborted && scan.current !== controller) return;
      pickByHand(controller.signal.aborted ? "The photo took too long to read. Choose the pieces by hand instead." : `${error instanceof Error ? error.message : "The photo could not be read."} You can choose the pieces by hand instead.`);
    } finally {
      window.clearTimeout(timer);
      if (scan.current === controller) scan.current = null;
    }
  }

  async function record() {
    if (!chosen.length) return;
    setBusy(true);
    try { await onRecord(chosen); onClose(); } finally { setBusy(false); }
  }

  return <div className="modal-backdrop" role="presentation">
    <section ref={dialog} tabIndex={-1} className={`modal wear-photo-modal step-${step}`} role="dialog" aria-modal="true" aria-labelledby="wear-photo-title">
      <button className="modal-close" aria-label="Close" onClick={close}>×</button>
      <div className="eyebrow">LOG WITH A PHOTO</div>
      <h2 id="wear-photo-title">Log today&rsquo;s outfit from a photo.</h2>

      {step === "photo" && <>
        <p>Take a photo of your outfit. Racked suggests the matching pieces from your own closet, and you confirm each one. Nothing is recorded until you tap Record.</p>
        <PhotoSourcePicker label="Photo of today's outfit" onFile={scanPhoto} />
        <p className="wear-photo-privacy">Racked sends the photo to its AI service, Amazon Bedrock, to read the pieces, and does not save it.</p>
        <button type="button" className="text-button" onClick={() => pickByHand("")}>Choose pieces by hand instead</button>
      </>}

      {step === "scanning" && <div className="wear-photo-scanning" role="status">
        <span aria-hidden="true"><Icon name="camera" size={40}/></span>
        <p>Reading your photo and checking your closet…</p>
        <button type="button" className="text-button" onClick={() => { scan.current?.abort(); scan.current = null; pickByHand(""); }}>Choose pieces by hand instead</button>
      </div>}

      {step === "review" && <>
        {message && <div className="wear-photo-message" role="status">{message}</div>}
        {suggestions.length > 0 && <>
          <p>Check each piece. Change any that are wrong and leave out anything you are not wearing.</p>
          <ol className="wear-photo-rows">{suggestions.map((suggestion, rowIndex) => {
            const current = review.rows[rowIndex]?.chosen ?? null;
            const name = `wear-photo-row-${rowIndex}`;
            return <li key={suggestion.detectionId} className={`wear-photo-row status-${suggestion.status}`}>
              <div className="wear-photo-row-head">
                <small>IN YOUR PHOTO</small>
                <strong>{suggestion.detectedName}</strong>
                <p>{statusLine(suggestion.status)}</p>
              </div>
              <fieldset className="wear-photo-options">
                <legend className="sr-only">Closet piece for {suggestion.detectedName}</legend>
                {suggestion.candidates.map(candidate => {
                  const item = byId.get(candidate.itemId)!;
                  const taken = usedElsewhere(review, item.id, rowIndex);
                  const blocked = taken || (current === null && full);
                  return <label key={item.id} className={`wear-photo-option${current === item.id ? " selected" : ""}${blocked ? " blocked" : ""}`}>
                    <input type="radio" name={name} checked={current === item.id} disabled={blocked} onChange={() => setReview(state => chooseForRow(state, rowIndex, item.id))} />
                    <Thumb item={item} />
                    <span className="wear-photo-option-text">
                      <strong>{item.name}</strong>
                      <small>{taken ? "Already in this outfit" : [candidate.strength === "strong" ? "Likely" : "Possible", ...candidate.reasons].join(" · ")}</small>
                    </span>
                  </label>;
                })}
                <label className={`wear-photo-option none${current === null ? " selected" : ""}`}>
                  <input type="radio" name={name} checked={current === null} onChange={() => setReview(state => chooseForRow(state, rowIndex, null))} />
                  <span className="wear-photo-option-text"><strong>{suggestion.candidates.length ? "Leave this out" : "Not recorded"}</strong></span>
                </label>
              </fieldset>
            </li>;
          })}</ol>
        </>}

        <details className="wear-photo-manual" open={showManual} onToggle={event => setShowManual(event.currentTarget.open)}>
          <summary>{suggestions.length ? "Add another piece by hand" : "Choose the pieces you wore"}</summary>
          {items.length === 0 ? <p>Your closet is empty. Add your clothes first.</p> : <ul>{items.map(item => {
            const inRow = review.rows.some(row => row.chosen === item.id);
            const checked = inRow || review.extras.includes(item.id);
            return <li key={item.id}><label className={inRow ? "blocked" : ""}>
              <input type="checkbox" checked={checked} disabled={inRow || (!checked && full)} onChange={() => setReview(state => toggleExtra(state, item.id))} />
              <Thumb item={item} />
              <span>{item.name}{inRow && <small> · chosen above</small>}</span>
            </label></li>;
          })}</ul>}
        </details>

        <div className="wear-photo-actions">
          <p>{chosen.length ? `${chosen.length} piece${chosen.length === 1 ? "" : "s"} chosen${full ? ` (the most for one wear is ${MAX_WEAR_PIECES})` : ""}.` : "No pieces chosen yet."} Nothing is recorded until you tap Record.</p>
          <button type="button" className="button button-accent" disabled={busy || chosen.length === 0} onClick={record}>{busy ? "Recording…" : `Record ${chosen.length || ""} piece${chosen.length === 1 ? "" : "s"} as worn today`.replace("  ", " ")}</button>
          <button type="button" className="text-button" onClick={() => { setStep("photo"); setMessage(""); setSuggestions([]); setReview({ rows: [], extras: [] }); }}>Use a different photo</button>
        </div>
      </>}
    </section>
  </div>;
}
