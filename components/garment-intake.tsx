/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";
import type { GarmentAnalysis } from "@/lib/platform-types";
import type { DetectedLookGarment } from "@/lib/look-garment-detection";
import { GARMENT_TAXONOMY, normalizeGarmentCategory, subtypeForCategory } from "@/lib/garment-taxonomy";
import { PLANNED_CATEGORIES } from "@/lib/photo-plan";
import { prepareImageForUpload, readJsonResponse } from "@/lib/upload-client";
import type { GarmentOverrides } from "./three-view-uploader";
import { PhotoSourcePicker } from "./photo-source-picker";

/**
 * One way in.
 *
 * Intake used to open on a choice between "add from one photo" and "link a brand product",
 * which asked the person to know, before photographing anything, whether the garment was
 * an enrolled brand product. Most people cannot answer that, and picking wrong meant the
 * garment could never be connected: only the three-photo flow ever consulted the registry.
 *
 * Now every garment comes in the same way. Brand linking became an optional per-piece
 * upgrade: add the code from the care label and Racked checks it against the registry.
 * The verification rule is untouched — a match still needs a barcode number, or a brand
 * together with that brand's style code, and the product must be enrolled by the brand.
 * Typing a brand name verifies nothing, here or anywhere else.
 */

type LinkState =
  | { status: "none" }
  | { status: "checking" }
  | { status: "verified"; product: { registryProductId: string; name: string; brand: string; sku: string }; matchMethod: string }
  | { status: "unverified"; reason: string; boundary: string };

interface Piece extends DetectedLookGarment {
  selected: boolean;
  overrides: GarmentOverrides;
  labelText: string;
  link: LinkState;
  expanded: boolean;
}

export interface GarmentIntakeSelection {
  analysis: GarmentAnalysis;
  overrides: GarmentOverrides;
}

function statusLabel(piece: Piece) {
  if (piece.link.status === "verified") return { text: "BRAND PRODUCT", tone: "verified" };
  if (piece.analysis.provider === "manual-review") return { text: "NEEDS YOUR LABEL", tone: "manual" };
  return { text: "YOUR GARMENT", tone: "plain" };
}

export function GarmentIntake({ onConfirmed }: { onConfirmed: (pieces: GarmentIntakeSelection[]) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const selectedCount = useMemo(() => pieces.filter((piece) => piece.selected).length, [pieces]);
  const verifiedCount = useMemo(() => pieces.filter((piece) => piece.selected && piece.link.status === "verified").length, [pieces]);

  function chooseFile(next: File) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setPieces([]);
    setConfirmed(false);
    setError("");
    void scan(next);
  }

  async function scan(selected = file) {
    if (!selected) return;
    setBusy(true); setError(""); setPieces([]); setConfirmed(false);
    try {
      const form = new FormData();
      setProgress("Preparing your photo");
      form.append("photo", await prepareImageForUpload(selected));
      setProgress("Finding the pieces in this photo");
      const response = await fetch("/api/garments/detect", { method: "POST", body: form });
      const data = await readJsonResponse<{ error?: string; detections?: DetectedLookGarment[] }>(response, "The scanner returned an unreadable response.");
      if (!response.ok || !data.detections) throw new Error(data.error ?? "The pieces could not be detected.");
      setPieces(data.detections.map((detection) => ({
        ...detection,
        selected: true,
        expanded: false,
        labelText: "",
        link: { status: "none" },
        overrides: {
          name: detection.analysis.garment.name,
          brand: /^brand not verified$/i.test(detection.analysis.label.brand) ? "" : detection.analysis.label.brand,
          sku: "",
          category: detection.analysis.garment.category,
          subtype: detection.analysis.garment.subtype,
        },
      })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The pieces could not be detected.");
    } finally { setBusy(false); setProgress(""); }
  }

  function update(id: string, change: (piece: Piece) => Piece) {
    setPieces((current) => current.map((piece) => (piece.id === id ? change(piece) : piece)));
  }

  function changeCategory(piece: Piece, value: string) {
    const category = normalizeGarmentCategory(value);
    update(piece.id, (current) => ({ ...current, overrides: { ...current.overrides, category, subtype: subtypeForCategory(category, current.overrides.subtype) } }));
  }

  async function checkLabel(piece: Piece) {
    if (!piece.labelText.trim()) return;
    update(piece.id, (current) => ({ ...current, link: { status: "checking" } }));
    try {
      const response = await fetch("/api/garments/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ labelText: piece.labelText }),
      });
      const data = await readJsonResponse<{ error?: string; verified?: boolean; reason?: string; boundary?: string; matchMethod?: string; product?: { registryProductId: string; name: string; brand: string; sku: string } }>(response, "The label check returned an unreadable response.");
      if (!response.ok) throw new Error(data.error ?? "The label could not be checked.");
      if (data.verified && data.product) {
        update(piece.id, (current) => ({
          ...current,
          link: { status: "verified", product: data.product!, matchMethod: data.matchMethod ?? "registry" },
          // A verified match supplies the authoritative brand and SKU; the person keeps
          // their own garment name.
          overrides: { ...current.overrides, brand: data.product!.brand, sku: data.product!.sku },
        }));
      } else {
        update(piece.id, (current) => ({ ...current, link: { status: "unverified", reason: data.reason ?? "No enrolled product matched this label.", boundary: data.boundary ?? "" } }));
      }
    } catch (reason) {
      update(piece.id, (current) => ({ ...current, link: { status: "unverified", reason: reason instanceof Error ? reason.message : "The label could not be checked.", boundary: "" } }));
    }
  }

  async function save() {
    const selected = pieces.filter((piece) => piece.selected);
    if (!selected.length) { setError("Select at least one piece."); return; }
    if (selected.some((piece) => !piece.overrides.name.trim())) { setError("Give every selected piece a name."); return; }
    if (!confirmed) { setError("Confirm the pieces before saving."); return; }
    setBusy(true); setError("");
    try {
      await onConfirmed(selected.map((piece) => ({
        analysis: piece.analysis,
        overrides: { ...piece.overrides, name: piece.overrides.name.trim(), brand: piece.overrides.brand.trim(), sku: piece.overrides.sku.trim() },
      })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The pieces could not be saved.");
    } finally { setBusy(false); }
  }

  return <div className="intake">
    <div className={`intake-drop ${file ? "has-file" : ""}`}>
      {preview
        ? <img className="intake-preview" src={preview} alt="Your uploaded photo" />
        : <span className="intake-drop-mark" aria-hidden="true">＋</span>}
      <div className="intake-drop-copy">
        <strong>{file ? (busy ? "Reading your photo…" : "Photo added") : "Add a photo of your clothing"}</strong>
        <small>{file ? file.name : "One garment, a flat lay, a whole outfit, or a full rail — Racked separates the pieces."}</small>
      </div>
      <PhotoSourcePicker label={file ? "Use a different photo" : "Add a photo"} onFile={chooseFile} />
    </div>

    {progress && <div className="upload-progress" role="status" aria-live="polite">
      <span /><strong>{progress}…</strong>
      <small>The original stays on your device. Racked uploads a smaller private copy.</small>
    </div>}
    {error && <div className="form-error" role="alert">{error}</div>}

    {pieces.length === 0 && file && !busy &&
      <button type="button" className="button button-dark button-full" onClick={() => void scan()}>Scan this photo again</button>}

    {pieces.length > 0 && <section className="intake-results" aria-live="polite">
      <div className="intake-results-head">
        <div>
          <span className="fallback-pill">{pieces.length} {pieces.length === 1 ? "PIECE" : "PIECES"} FOUND</span>
          <h3>Check each piece before it joins your closet.</h3>
        </div>
        <button type="button" className="button button-light button-small" disabled={busy} onClick={() => void scan()}>Rescan</button>
      </div>

      <div className="intake-grid">{pieces.map((piece, index) => {
        const status = statusLabel(piece);
        return <article className={`intake-card ${piece.selected ? "selected" : ""} ${status.tone}`} key={piece.id}>
          <header className="intake-card-head">
            <label className="intake-select">
              <input type="checkbox" checked={piece.selected} onChange={(event) => update(piece.id, (current) => ({ ...current, selected: event.target.checked }))} />
              <span className="sr-only">Include piece {index + 1}</span>
            </label>
            <span className={`intake-status ${status.tone}`}>{status.text}</span>
          </header>

          {piece.analysis.processedImage && <div className="intake-cutout">
            <img src={piece.analysis.processedImage.url} alt={piece.overrides.name || `Detected piece ${index + 1}`} />
          </div>}

          {piece.analysis.provider === "manual-review" &&
            <p className="intake-manual">AI could not classify this photo. Set the name and category yourself, or rescan with the piece laid flat and fully in frame.</p>}

          <div className="intake-fields">
            <label>Name<input value={piece.overrides.name} maxLength={100} disabled={!piece.selected}
              onChange={(event) => update(piece.id, (current) => ({ ...current, overrides: { ...current.overrides, name: event.target.value } }))} /></label>
            <div className="intake-field-row">
              <label>Category<select value={piece.overrides.category} disabled={!piece.selected} onChange={(event) => changeCategory(piece, event.target.value)}>
                {PLANNED_CATEGORIES.map((category) => <option value={category} key={category}>{category}</option>)}
              </select></label>
              <label>Type<select value={piece.overrides.subtype} disabled={!piece.selected}
                onChange={(event) => update(piece.id, (current) => ({ ...current, overrides: { ...current.overrides, subtype: event.target.value } }))}>
                {GARMENT_TAXONOMY[piece.overrides.category].map((subtype) => <option value={subtype} key={subtype}>{subtype}</option>)}
              </select></label>
            </div>
          </div>

          {/* Brand linking as an upgrade, not a mode. Collapsed until asked for, because
              most garments in a wardrobe are not enrolled products and should not have to
              answer for it. */}
          <div className="intake-link">
            {piece.link.status === "verified"
              ? <div className="intake-link-verified">
                  <strong>{piece.link.product.brand} · {piece.link.product.name}</strong>
                  <small>Matched an enrolled product on {piece.link.matchMethod === "gtin" ? "its barcode number" : "brand and style code"}. Wear you record can join this brand&rsquo;s anonymous totals only if you turn on brand data sharing in Settings.</small>
                </div>
              : <>
                  <button type="button" className="intake-link-toggle" disabled={!piece.selected}
                    aria-expanded={piece.expanded}
                    onClick={() => update(piece.id, (current) => ({ ...current, expanded: !current.expanded }))}>
                    {piece.expanded ? "▾" : "▸"} Is this a brand product? <span>Optional</span>
                  </button>
                  {piece.expanded && <div className="intake-link-body">
                    <label>Code from the care label
                      <input value={piece.labelText} maxLength={200} placeholder="Barcode number, or brand + style code"
                        disabled={!piece.selected}
                        onChange={(event) => update(piece.id, (current) => ({ ...current, labelText: event.target.value, link: { status: "none" } }))} />
                    </label>
                    <button type="button" className="button button-dark button-small"
                      disabled={!piece.selected || !piece.labelText.trim() || piece.link.status === "checking"}
                      onClick={() => void checkLabel(piece)}>
                      {piece.link.status === "checking" ? "Checking…" : "Check the registry"}
                    </button>
                    {piece.link.status === "unverified" && <p className="intake-link-miss">
                      <strong>{piece.link.reason}</strong>
                      {piece.link.boundary && <span>{piece.link.boundary}</span>}
                      <span>You can still save this piece — it simply stays your own garment, with no brand connection.</span>
                    </p>}
                  </div>}
                </>}
          </div>
        </article>;
      })}</div>

      <label className="consent-row compact">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>
          <strong>These are pieces in my wardrobe.</strong>
          <small>
            {selectedCount} {selectedCount === 1 ? "piece" : "pieces"} will be added
            {verifiedCount > 0 ? `, ${verifiedCount} linked to an enrolled brand product` : ""}. The source photo stays private.
          </small>
        </span>
      </label>
      <button type="button" className="button button-accent button-full" disabled={busy || selectedCount === 0} onClick={save}>
        {busy ? "Adding to your closet…" : `Add ${selectedCount} ${selectedCount === 1 ? "piece" : "pieces"}`}
      </button>
    </section>}
  </div>;
}
