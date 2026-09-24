"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import type { CatalogProductSummary } from "@/lib/catalog-match";
import { isVerifiedPiece, SEASONS, type GarmentEdit } from "@/lib/garment-edit";
import { garmentSubtypeLabel, garmentTypeSuggestions, normalizeGarmentCategory, resolveTypedGarmentType, type GarmentSubtype } from "@/lib/garment-taxonomy";
import { PLANNED_CATEGORIES } from "@/lib/photo-plan";
import { readJsonResponse } from "@/lib/upload-client";
import type { Season, WardrobeItem } from "@/lib/types";

/**
 * Edits a piece already in the wardrobe, with the same fields a scan offers. Only what changed is
 * sent, so saving the name never re-normalises a type nobody touched. Wear history and the photo
 * are not on this form at all, and a verified brand link is shown but cannot be changed here.
 */
export function GarmentEditor({ item, onSaved, onCancel }: { item: WardrobeItem; onSaved: (item: WardrobeItem) => void; onCancel: () => void }) {
  const initialType = item.customType ?? (item.subtype ? garmentSubtypeLabel(item.subtype as GarmentSubtype, item.wearableUnit ?? "pair") : "");
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(String(item.category));
  const [typeText, setTypeText] = useState(initialType);
  const [color, setColor] = useState(item.color);
  const [pattern, setPattern] = useState(item.pattern ?? "");
  const [material, setMaterial] = useState(item.material ?? "");
  const [season, setSeason] = useState<Season>(item.season);
  const [brandText, setBrandText] = useState(item.identityStatus === "owner-selected" ? "" : item.brand ?? "");
  // undefined: leave the link alone. null: unlink. A product: link it as the person's own pick.
  const [pick, setPick] = useState<CatalogProductSummary | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogProductSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const verified = isVerifiedPiece(item);
  const linkedPick = item.identityStatus === "owner-selected";

  function search(value: string) {
    setQuery(value);
    window.clearTimeout(timer.current);
    if (value.trim().length < 2) { setResults([]); return; }
    timer.current = window.setTimeout(async () => {
      const params = new URLSearchParams({ q: value.trim() });
      const known = normalizeGarmentCategory(category);
      if (known !== "unknown") params.set("category", known);
      try {
        const response = await fetch(`/api/catalog?${params.toString()}`);
        const data = await readJsonResponse<{ results?: CatalogProductSummary[] }>(response, "The catalog returned an unreadable response.");
        setResults(response.ok ? data.results ?? [] : []);
      } catch { setResults([]); }
    }, 300);
  }

  /** Everything that differs from the stored piece, and nothing that does not. */
  function changes(): GarmentEdit {
    const edit: GarmentEdit = {};
    if (name.trim() !== item.name) edit.name = name.trim();
    if (category !== String(item.category) || typeText.trim() !== initialType) {
      const resolved = resolveTypedGarmentType(normalizeGarmentCategory(category), typeText);
      edit.category = resolved?.category ?? category;
      if (resolved) { edit.subtype = resolved.subtype; edit.customType = resolved.customType; }
      else { edit.subtype = ""; edit.customType = null; }
    }
    if (color.trim() !== item.color) edit.color = color.trim();
    if (pattern.trim() !== (item.pattern ?? "")) edit.pattern = pattern.trim();
    if (material.trim() !== (item.material ?? "")) edit.material = material.trim();
    if (season !== item.season) edit.season = season;
    if (!verified) {
      if (pick !== undefined) edit.catalogProductId = pick ? pick.registryProductId : null;
      else if (!linkedPick && brandText.trim() !== (item.brand ?? "")) edit.brand = brandText.trim() || null;
    }
    return edit;
  }

  async function save() {
    const edit = changes();
    if (!Object.keys(edit).length) { onCancel(); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/consumer/wardrobe", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.id, edit }) });
      const data = await readJsonResponse<{ item?: WardrobeItem; error?: string }>(response, "The piece could not be saved.");
      if (!response.ok || !data.item) throw new Error(data.error ?? "The piece could not be saved.");
      onSaved(data.item);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The piece could not be saved.");
    } finally { setBusy(false); }
  }

  const knownCategory = normalizeGarmentCategory(category);
  return <form className="garment-editor" onSubmit={(event) => { event.preventDefault(); void save(); }} aria-label={`Edit ${item.name}`}>
    <div className="intake-fields">
      <label>Name<input value={name} maxLength={100} required onChange={(event) => setName(event.target.value)} /></label>
      <div className="intake-field-row">
        <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>
          {PLANNED_CATEGORIES.map((entry) => <option value={entry} key={entry}>{entry}</option>)}
        </select></label>
        <label>Type<input value={typeText} maxLength={60} list={`edit-types-${item.id}`} placeholder="Type what this is" onChange={(event) => setTypeText(event.target.value)} />
          <datalist id={`edit-types-${item.id}`}>
            {knownCategory !== "unknown" && garmentTypeSuggestions(knownCategory, item.wearableUnit ?? "pair")
              .filter((option) => !option.subtype.startsWith("other-"))
              .map((option) => <option value={option.label} key={option.subtype} />)}
          </datalist>
        </label>
      </div>
      <div className="intake-field-row">
        <label>Colour<input value={color} maxLength={60} required onChange={(event) => setColor(event.target.value)} /></label>
        <label>Pattern<input value={pattern} maxLength={60} onChange={(event) => setPattern(event.target.value)} /></label>
      </div>
      <div className="intake-field-row">
        <label>Material<input value={material} maxLength={100} onChange={(event) => setMaterial(event.target.value)} /></label>
        <label>Season<select value={season} onChange={(event) => setSeason(event.target.value as Season)}>
          {SEASONS.map((entry) => <option value={entry} key={entry}>{entry}</option>)}
        </select></label>
      </div>
    </div>

    <div className="garment-editor-brand">
      <strong>Brand</strong>
      {verified
        ? <p className="catalog-note">✓ Verified {item.brand} product. Brand details come from the care label and cannot be changed here.</p>
        : pick
          ? <p className="catalog-note">Will link <b>{pick.brand} · {pick.name}</b> as your pick. <button type="button" className="text-button" onClick={() => setPick(undefined)}>Undo</button></p>
          : linkedPick && pick === undefined
            ? <p className="catalog-note">{item.brand} · your pick. <button type="button" className="text-button" onClick={() => setPick(null)}>Unlink</button></p>
            : <>
                {pick === null && <p className="catalog-note">The brand product will be unlinked. <button type="button" className="text-button" onClick={() => setPick(undefined)}>Undo</button></p>}
                <label>Search brand catalogs<input type="search" value={query} maxLength={80} placeholder="Brand, product name, or style code" onChange={(event) => search(event.target.value)} /></label>
                {results.length > 0 && <ul className="catalog-options">{results.map((result) => <li key={result.registryProductId}>
                  <div className="catalog-option">{result.imageUrl ? <img src={result.imageUrl} alt="" /> : <span className="catalog-option-blank" aria-hidden="true" />}<span><strong>{result.name}</strong><small>{result.brand}</small></span></div>
                  <button type="button" className="button button-dark button-small" onClick={() => { setPick(result); setQuery(""); setResults([]); }}>This is mine</button>
                </li>)}</ul>}
                {!linkedPick && <label>Or the brand in your own words<input value={brandText} maxLength={100} placeholder="Optional" onChange={(event) => setBrandText(event.target.value)} /></label>}
              </>}
    </div>

    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="garment-editor-actions">
      <button type="submit" className="button button-accent button-small" disabled={busy || !name.trim() || !color.trim()}>{busy ? "Saving…" : "Save changes"}</button>
      <button type="button" className="button button-light button-small" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
    <small className="garment-editor-note">Wear history and the photo stay as they are. To change the photo, scan the piece again.</small>
  </form>;
}
