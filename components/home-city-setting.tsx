"use client";

import { useEffect, useRef, useState } from "react";
import { placeLabel, type Place } from "@/lib/weather";

/**
 * The home city Hanger checks the weather for. A search returns several matches on purpose — there
 * is more than one Springfield — and the person picks theirs. Only their own Hanger reads it.
 */
export function HomeCitySetting() {
  const [saved, setSaved] = useState<Place | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/consumer/location")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (!cancelled && data) setSaved(data.homeCity ?? null); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  function search(value: string) {
    setQuery(value); setError(""); setMessage("");
    window.clearTimeout(timer.current);
    if (value.trim().length < 2) { setResults([]); return; }
    timer.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/consumer/location?search=${encodeURIComponent(value.trim())}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "That search did not work.");
        setResults(Array.isArray(data.places) ? data.places : []);
      } catch (reason) {
        setResults([]);
        setError(reason instanceof Error ? reason.message : "That search did not work.");
      }
    }, 350);
  }

  async function save(place: Place | null) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/consumer/location", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ homeCity: place }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Your home city could not be saved.");
      setSaved(data.homeCity ?? null);
      setQuery(""); setResults([]);
      setMessage(place ? `Hanger will check the weather in ${place.name}.` : "Home city removed. Hanger won't check the weather unless you share your location.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your home city could not be saved.");
    } finally { setBusy(false); }
  }

  return <section className="settings-card" aria-labelledby="home-city-title">
    <div className="eyebrow">HANGER&rsquo;S WEATHER</div>
    <h2 id="home-city-title">Home city.</h2>
    <p>Hanger checks the forecast here before suggesting what to wear. It is used only for your own forecast — never shown to brands — and you can also share your phone&rsquo;s location from the Hanger chat whenever you like.</p>
    {saved
      ? <div className="settings-readonly"><small>CURRENT</small><strong>{placeLabel(saved)}</strong><button type="button" className="text-button" disabled={busy} onClick={() => void save(null)}>Remove</button></div>
      : <p className="home-city-empty">No home city set, so Hanger won&rsquo;t check the weather unless you share your location.</p>}
    <div className="auth-fields">
      <label><span>{saved ? "Change city" : "Find your city"}</span>
        <input value={query} maxLength={80} placeholder="e.g. Washington" autoComplete="address-level2" onChange={(event) => search(event.target.value)} />
      </label>
    </div>
    {results.length > 0 && <ul className="home-city-results">{results.map((place) =>
      <li key={`${place.latitude},${place.longitude},${place.name}`}>
        <span>{placeLabel(place)}</span>
        <button type="button" className="button button-dark button-small" disabled={busy} onClick={() => void save(place)}>Use this</button>
      </li>)}</ul>}
    {error && <div className="form-error" role="alert">{error}</div>}
    {message && <div className="success-banner" role="status">✓ {message}</div>}
  </section>;
}
