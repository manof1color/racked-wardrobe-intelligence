/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useRef, useState } from "react";
import type { CatalogCandidate, CatalogProductSummary } from "@/lib/catalog-match";
import type { GarmentAnalysis } from "@/lib/platform-types";
import type { DetectedLookGarment } from "@/lib/look-garment-detection";
import { garmentSubtypeLabel, garmentTypeSuggestions, normalizeGarmentCategory, resolveTypedGarmentType, subtypeForCategory } from "@/lib/garment-taxonomy";
import { PLANNED_CATEGORIES } from "@/lib/photo-plan";
import { batchSummary, MAX_SCAN_PHOTOS, planScanBatch, remainingPieceCapacity, scanProgressLabel } from "@/lib/look-scan-batch";
import { prepareImageForUpload, readJsonResponse } from "@/lib/upload-client";
import type { GarmentOverrides } from "@/lib/types";
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
 *
 * A label is often cut out or unreadable, so a piece can also be linked without one: Racked
 * suggests enrolled products that look like it, and the person can search the brand they
 * bought from. Either way the link is saved as their own pick, shown to them alone, and never
 * as verified — verification still takes the code from the label.
 */

type LinkState =
  | { status: "none" }
  | { status: "checking" }
  | { status: "verified"; product: { registryProductId: string; name: string; brand: string; sku: string }; matchMethod: string }
  | { status: "selected"; product: CatalogProductSummary }
  | { status: "unverified"; reason: string; boundary: string };

interface Piece extends DetectedLookGarment {
  selected: boolean;
  overrides: GarmentOverrides;
  labelText: string;
  link: LinkState;
  expanded: boolean;
  /** What the Type field shows: the recognised type's label, or the person's own words. */
  typeText: string;
  /** Which photo of the batch this piece came out of, so a card can be traced back to it. */
  sourcePhoto: number;
  /** Enrolled products that look like this piece; null until the brand section is first opened. */
  candidates: CatalogCandidate[] | null;
  candidatesState: "idle" | "loading" | "done" | "failed";
  query: string;
  results: CatalogProductSummary[];
  searching: boolean;
}

/**
 * Whether recognition left the type for the person to supply. A fallback subtype with no
 * typed words, an unknown category, a manual-review stand-in, or low confidence all mean
 * the Type field should ask rather than present a guess as an answer.
 */
function typeNeedsInput(piece: Piece) {
  if (piece.analysis.provider === "manual-review") return true;
  if (piece.overrides.category === "unknown") return true;
  if (piece.overrides.subtype.startsWith("other-") && !piece.overrides.customType) return true;
  return piece.analysis.confidence < 50;
}

export interface GarmentIntakeSelection {
  analysis: GarmentAnalysis;
  overrides: GarmentOverrides;
}

function statusLabel(piece: Piece) {
  if (piece.link.status === "verified") return { text: "BRAND PRODUCT", tone: "verified" };
  if (piece.link.status === "selected") return { text: "BRAND · YOUR PICK", tone: "picked" };
  if (piece.analysis.provider === "manual-review") return { text: "NEEDS YOUR LABEL", tone: "manual" };
  return { text: "YOUR GARMENT", tone: "plain" };
}

/** One enrolled product, as its brand page shows it: photo, name, brand, and why it was offered. */
function CatalogOption({ product, detail }: { product: CatalogProductSummary; detail?: string }) {
  return <div className="catalog-option">
    {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span className="catalog-option-blank" aria-hidden="true" />}
    <span><strong>{product.name}</strong><small>{product.brand}{detail ? ` · ${detail}` : ""}</small></span>
  </div>;
}

export function GarmentIntake({ onConfirmed }: { onConfirmed: (pieces: GarmentIntakeSelection[]) => Promise<void> }) {
  const [files, setFiles] = useState<File[]>([]);
  const [summary, setSummary] = useState("");
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const selectedCount = useMemo(() => pieces.filter((piece) => piece.selected).length, [pieces]);
  const verifiedCount = useMemo(() => pieces.filter((piece) => piece.selected && piece.link.status === "verified").length, [pieces]);
  const pickedCount = useMemo(() => pieces.filter((piece) => piece.selected && piece.link.status === "selected").length, [pieces]);
  const searchTimers = useRef(new Map<string, number>());

  function chooseFiles(next: File[]) {
    // Several photos are how a wardrobe actually arrives: a rail, a shelf, a pile on the bed.
    const plan = planScanBatch(next);
    setFiles(plan.accepted);
    setPieces([]);
    setConfirmed(false);
    setError("");
    setSummary("");
    void scan(plan.accepted, plan.skipped);
  }

  /**
   * One photo at a time, because that is how recognition works, but one review list at the end.
   * A photo that fails does not take the batch with it: what was found is kept, and the summary
   * says which photo could not be read.
   */
  async function scan(batch = files, skippedPhotos = 0) {
    if (!batch.length) return;
    setBusy(true); setError(""); setPieces([]); setConfirmed(false); setSummary("");
    const found: Piece[] = [];
    const failedPhotos: number[] = [];
    let reachedPieceLimit = false;
    try {
      for (const [index, entry] of batch.entries()) {
        const photoNumber = index + 1;
        if (remainingPieceCapacity(found.length) === 0) { reachedPieceLimit = true; break; }
        try {
          const form = new FormData();
          setProgress(batch.length === 1 ? "Preparing your photo" : `Preparing photo ${photoNumber} of ${batch.length}`);
          form.append("photo", await prepareImageForUpload(entry));
          setProgress(scanProgressLabel({ photoNumber, photoCount: batch.length }));
          const response = await fetch("/api/garments/detect", { method: "POST", body: form });
          const data = await readJsonResponse<{ error?: string; detections?: DetectedLookGarment[] }>(response, "The scanner returned an unreadable response.");
          if (!response.ok || !data.detections) throw new Error(data.error ?? "The pieces could not be detected.");
          const room = remainingPieceCapacity(found.length);
          if (data.detections.length > room) reachedPieceLimit = true;
          found.push(...data.detections.slice(0, room).map((detection) => piece(detection, photoNumber)));
          setPieces([...found]);
        } catch (reason) {
          // A batch stops only when the server says to stop; one unreadable photo does not.
          const message = reason instanceof Error ? reason.message : "That photo could not be read.";
          failedPhotos.push(photoNumber);
          if (/too many|try again in a few minutes/i.test(message)) { setError(message); break; }
        }
      }
      if (!found.length && failedPhotos.length) setError("None of those photos could be read. Try again, or pick different ones.");
      setSummary(batchSummary({ photoCount: batch.length, pieceCount: found.length, failedPhotos, skippedPhotos, reachedPieceLimit }));
    } finally { setBusy(false); setProgress(""); }
  }

  function piece(detection: DetectedLookGarment, sourcePhoto: number): Piece {
    return {
      ...detection,
      selected: true,
      expanded: false,
      labelText: "",
      link: { status: "none" },
      candidates: null,
      candidatesState: "idle",
      query: "",
      results: [],
      searching: false,
      sourcePhoto,
      // A fallback subtype is an absence of recognition, so the field starts empty and
      // asks, rather than prefilling "Other Shoes" as though that were an answer.
      typeText: detection.analysis.garment.subtype.startsWith("other-")
        ? ""
        : garmentSubtypeLabel(detection.analysis.garment.subtype, detection.analysis.garment.wearableUnit),
      overrides: {
        name: detection.analysis.garment.name,
        brand: /^brand not verified$/i.test(detection.analysis.label.brand) ? "" : detection.analysis.label.brand,
        sku: "",
        category: detection.analysis.garment.category,
        subtype: detection.analysis.garment.subtype,
        customType: null,
      },
    };
  }

  function update(id: string, change: (piece: Piece) => Piece) {
    setPieces((current) => current.map((piece) => (piece.id === id ? change(piece) : piece)));
  }

  function changeCategory(piece: Piece, value: string) {
    const category = normalizeGarmentCategory(value);
    update(piece.id, (current) => {
      // Whatever was typed is re-read against the new category rather than thrown away.
      const typed = resolveTypedGarmentType(category, current.typeText);
      return {
        ...current,
        overrides: typed
          ? { ...current.overrides, category, subtype: typed.subtype, customType: typed.customType }
          : { ...current.overrides, category, subtype: subtypeForCategory(category, current.overrides.subtype), customType: null },
      };
    });
  }

  function changeType(piece: Piece, value: string) {
    update(piece.id, (current) => {
      const typed = resolveTypedGarmentType(current.overrides.category, value);
      if (!typed) {
        return { ...current, typeText: value, overrides: { ...current.overrides, subtype: subtypeForCategory(current.overrides.category, ""), customType: null } };
      }
      return { ...current, typeText: value, overrides: { ...current.overrides, category: typed.category, subtype: typed.subtype, customType: typed.customType } };
    });
  }

  /** Asks the catalog which enrolled products look like this piece, once, when the section opens. */
  async function loadCandidates(piece: Piece) {
    update(piece.id, (current) => ({ ...current, candidatesState: "loading" }));
    try {
      const garment = piece.analysis.garment;
      const response = await fetch("/api/catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: piece.overrides.category, subtype: piece.overrides.subtype, color: garment.color, pattern: garment.pattern, material: garment.material, style: garment.style, brandText: piece.overrides.brand }),
      });
      const data = await readJsonResponse<{ error?: string; candidates?: CatalogCandidate[] }>(response, "The catalog returned an unreadable response.");
      if (!response.ok) throw new Error(data.error ?? "The catalog could not be searched.");
      update(piece.id, (current) => ({ ...current, candidates: data.candidates ?? [], candidatesState: "done" }));
    } catch {
      update(piece.id, (current) => ({ ...current, candidates: [], candidatesState: "failed" }));
    }
  }

  function toggleBrandSection(piece: Piece) {
    const opening = !piece.expanded;
    update(piece.id, (current) => ({ ...current, expanded: !current.expanded }));
    if (opening && piece.candidatesState === "idle" && piece.overrides.category !== "unknown") void loadCandidates(piece);
  }

  /** Searches as the person types, a moment after they pause, within this piece's category. */
  function searchCatalog(piece: Piece, query: string) {
    update(piece.id, (current) => ({ ...current, query }));
    const timers = searchTimers.current;
    window.clearTimeout(timers.get(piece.id));
    if (query.trim().length < 2) { update(piece.id, (current) => ({ ...current, results: [], searching: false })); return; }
    timers.set(piece.id, window.setTimeout(async () => {
      update(piece.id, (current) => ({ ...current, searching: true }));
      try {
        const params = new URLSearchParams({ q: query.trim() });
        if (piece.overrides.category !== "unknown") params.set("category", piece.overrides.category);
        const response = await fetch(`/api/catalog?${params.toString()}`);
        const data = await readJsonResponse<{ error?: string; results?: CatalogProductSummary[] }>(response, "The catalog returned an unreadable response.");
        if (!response.ok) throw new Error(data.error ?? "The catalog could not be searched.");
        // A slower, older search must not overwrite the results for what is typed now.
        update(piece.id, (current) => current.query === query ? { ...current, results: data.results ?? [], searching: false } : current);
      } catch {
        update(piece.id, (current) => current.query === query ? { ...current, results: [], searching: false } : current);
      }
    }, 300));
  }

  function choose(piece: Piece, product: CatalogProductSummary) {
    update(piece.id, (current) => ({
      ...current,
      link: { status: "selected", product },
      overrides: { ...current.overrides, brand: product.brand, sku: product.sku },
    }));
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
    if (selected.some((piece) => piece.overrides.category === "unknown")) { setError("Choose a category for every selected piece so it can be used in outfits."); return; }
    if (!confirmed) { setError("Confirm the pieces before saving."); return; }
    setBusy(true); setError("");
    try {
      await onConfirmed(selected.map((piece) => ({
        analysis: piece.analysis,
        // A matched label travels with the piece as evidence. The server checks it again and
        // stores the product link itself; a "verified" flag from the browser would prove nothing.
        // A catalog pick travels as the person's selection, which the server never promotes.
        overrides: { ...piece.overrides, name: piece.overrides.name.trim(), brand: piece.overrides.brand.trim(), sku: piece.overrides.sku.trim(), customType: piece.overrides.customType ?? null, labelText: piece.link.status === "verified" ? piece.labelText : null, catalogProductId: piece.link.status === "selected" ? piece.link.product.registryProductId : null },
      })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The pieces could not be saved.");
    } finally { setBusy(false); }
  }

  return <div className="intake">
    <div className={`intake-drop ${files.length ? "has-file" : ""}`}>
      {/* No local thumbnail of the chosen file: a value read from a file input has no business
          reaching an image source, and the real cropped pieces appear moments later anyway. */}
      <span className="intake-drop-mark" aria-hidden="true">{files.length ? files.length : "＋"}</span>
      <div className="intake-drop-copy">
        <strong>{files.length ? (busy ? "Reading your photos…" : `${files.length} photo${files.length === 1 ? "" : "s"} added`) : "Add photos of your clothing"}</strong>
        <small>{files.length
          ? files.map((entry) => entry.name).join(", ")
          : `One garment, a flat lay, a whole outfit, or a full rail — Racked separates the pieces. Pick up to ${MAX_SCAN_PHOTOS} photos at once. A plain surface — a bed, a floor, a wall — gives the cleanest cut-outs.`}</small>
      </div>
      <PhotoSourcePicker label={files.length ? "Use different photos" : "Add photos"} multiple onFiles={chooseFiles} />
    </div>

    {progress && <div className="upload-progress" role="status" aria-live="polite">
      <span /><strong>{progress}…</strong>
      <small>The original stays on your device. Racked uploads a smaller private copy.</small>
    </div>}
    {error && <div className="form-error" role="alert">{error}</div>}

    {summary && !busy && <p className="intake-batch-summary" role="status">{summary}</p>}

    {pieces.length === 0 && files.length > 0 && !busy &&
      <button type="button" className="button button-dark button-full" onClick={() => void scan()}>Scan {files.length === 1 ? "this photo" : "these photos"} again</button>}

    {pieces.length > 0 && <section className="intake-results" aria-live="polite">
      <div className="intake-results-head">
        <div>
          <span className="fallback-pill">{pieces.length} {pieces.length === 1 ? "PIECE" : "PIECES"} FOUND{files.length > 1 ? ` IN ${files.length} PHOTOS` : ""}</span>
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
            {files.length > 1 && <span className="intake-source" title={`Found in photo ${piece.sourcePhoto}`}>Photo {piece.sourcePhoto}</span>}
            <span className={`intake-status ${status.tone}`}>{status.text}</span>
          </header>

          {piece.analysis.processedImage && <div className={`intake-cutout ${piece.analysis.processedImage.backgroundRemoved ? "cutout" : "photo"}`}>
            <img src={piece.analysis.processedImage.url} alt={piece.overrides.name || `Detected piece ${index + 1}`} />
          </div>}

          <div className="intake-fields">
            <label>Name<input value={piece.overrides.name} maxLength={100} disabled={!piece.selected}
              onChange={(event) => update(piece.id, (current) => ({ ...current, overrides: { ...current.overrides, name: event.target.value } }))} /></label>
            <div className="intake-field-row">
              <label>Category<select value={piece.overrides.category} disabled={!piece.selected} onChange={(event) => changeCategory(piece, event.target.value)}>
                {PLANNED_CATEGORIES.map((category) => <option value={category} key={category}>{category}</option>)}
              </select></label>
              {/* A typeable field rather than a fixed list: recognition fills it when it can,
                  and when it cannot the person types what the piece is. Known words map onto
                  the controlled taxonomy; anything else is kept in their own words. */}
              <label>Type<input value={piece.typeText} maxLength={60} disabled={!piece.selected}
                list={`intake-types-${piece.id}`}
                className={typeNeedsInput(piece) ? "needs-type" : undefined}
                aria-describedby={typeNeedsInput(piece) ? `intake-type-hint-${piece.id}` : undefined}
                placeholder="Type what this is"
                onChange={(event) => changeType(piece, event.target.value)} />
                <datalist id={`intake-types-${piece.id}`}>
                  {garmentTypeSuggestions(piece.overrides.category, piece.analysis.garment.wearableUnit ?? "pair")
                    .filter((option) => !option.subtype.startsWith("other-"))
                    .map((option) => <option value={option.label} key={option.subtype} />)}
                </datalist>
              </label>
            </div>
            {/* The hint sits under the field it refers to. It never overlays the photograph:
                the point of the prompt is that the person can see the garment while deciding
                what to call it. */}
            {typeNeedsInput(piece) && <p className="intake-type-hint" id={`intake-type-hint-${piece.id}`}>
              {piece.analysis.provider === "manual-review"
                ? "AI could not classify this photo. Choose a category and type what this piece is."
                : "AI wasn\u2019t sure what this is. Type it in, or pick a suggestion."}
            </p>}
            {piece.overrides.customType && <p className="intake-type-kept">Saved as &ldquo;{piece.overrides.customType}&rdquo; in your own words.</p>}
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
                    onClick={() => toggleBrandSection(piece)}>
                    {piece.expanded ? "▾" : "▸"} {piece.link.status === "selected" ? `${piece.link.product.brand} · ${piece.link.product.name}` : "Is this a brand product?"} <span>Optional</span>
                  </button>
                  {piece.expanded && <div className="intake-link-body">
                    {piece.link.status === "selected"
                      ? <div className="catalog-picked">
                          <CatalogOption product={piece.link.product} />
                          <p>Linked as your pick, visible only to you. Add the code from its care label below to verify it.</p>
                          <button type="button" className="button button-light button-small" onClick={() => update(piece.id, (current) => ({ ...current, link: { status: "none" } }))}>Choose a different product</button>
                        </div>
                      : <>
                          <p className="catalog-note">Linked pieces show their product details in your Closet, and their cost per wear where the brand lists a price.</p>
                          {piece.candidatesState === "loading" && <p className="catalog-note" role="status">Looking through brand catalogs…</p>}
                          {piece.candidates && piece.candidates.length > 0 && <div className="catalog-group">
                            <h4>Looks like</h4>
                            <ul className="catalog-options">{piece.candidates.map((candidate) => <li key={candidate.registryProductId}>
                              <CatalogOption product={candidate} detail={candidate.reasons[0]} />
                              <button type="button" className="button button-dark button-small" disabled={!piece.selected} onClick={() => choose(piece, candidate)}>This is mine</button>
                            </li>)}</ul>
                          </div>}
                          {piece.candidatesState === "done" && piece.candidates?.length === 0 && <p className="catalog-note">No enrolled product looks like this one. Search for the brand below.</p>}
                          <label>Search brands
                            <input type="search" value={piece.query} maxLength={80} placeholder="Brand, product name, or style code" disabled={!piece.selected}
                              onChange={(event) => searchCatalog(piece, event.target.value)} />
                          </label>
                          {piece.searching && <p className="catalog-note" role="status">Searching…</p>}
                          {!piece.searching && piece.query.trim().length >= 2 && piece.results.length === 0 && <p className="catalog-note">No enrolled product matches &ldquo;{piece.query.trim()}&rdquo;{piece.overrides.category !== "unknown" ? ` in ${piece.overrides.category}` : ""}. The brand may not be on Racked yet.</p>}
                          {piece.results.length > 0 && <ul className="catalog-options">{piece.results.map((result) => <li key={result.registryProductId}>
                            <CatalogOption product={result} />
                            <button type="button" className="button button-dark button-small" disabled={!piece.selected} onClick={() => choose(piece, result)}>This is mine</button>
                          </li>)}</ul>}
                        </>}
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
            {verifiedCount > 0 ? `, ${verifiedCount} verified as an enrolled brand product` : ""}
            {pickedCount > 0 ? `, ${pickedCount} linked to a brand product you picked` : ""}. The source photo stays private.
          </small>
        </span>
      </label>
      <button type="button" className="button button-accent button-full" disabled={busy || selectedCount === 0} onClick={save}>
        {busy ? "Adding to your closet…" : `Add ${selectedCount} ${selectedCount === 1 ? "piece" : "pieces"}`}
      </button>
    </section>}
  </div>;
}
