/**
 * Weather for Hanger, from Open-Meteo (open-meteo.com): no key, no account, and nothing sent but a
 * rounded coordinate. Its free tier is for non-commercial use, which covers the competition build;
 * charging customers would need Open-Meteo's commercial plan or another provider.
 *
 * A forecast is an enhancement, never a dependency. Every fetch has a short deadline and every
 * failure returns null, so a slow weather service can only cost a reply its forecast — never the
 * reply itself. Pure parsing is kept separate from the network so it is tested offline.
 */
import type { OutfitWeather } from "./outfit-ranking.ts";

export const WEATHER_TIMEOUT_MS = 2_500;
const CACHE_MS = 20 * 60 * 1000;
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

export interface Place {
  name: string;
  region: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
}

export interface DayForecast {
  date: string;
  description: string;
  highF: number;
  lowF: number;
  highC: number;
  lowC: number;
  /** Highest chance of precipitation in the day, as a percentage. */
  precipitationChance: number;
  windMph: number;
}

export interface Forecast {
  place: string;
  now: { tempF: number; tempC: number; description: string } | null;
  today: DayForecast;
  tomorrow: DayForecast | null;
  /** The ranker's weather word for today, or null for a mild, dry day. */
  outfitWeather: OutfitWeather | null;
  /** One line a stylist can read aloud. */
  summary: string;
}

/**
 * Coordinates are rounded to two decimals — about a kilometre — before they are stored or sent
 * anywhere. Enough for a forecast; not enough to place someone on a street.
 */
export const roundCoordinate = (value: number) => Math.round(value * 100) / 100;

export function validCoordinates(latitude: unknown, longitude: unknown): { latitude: number; longitude: number } | null {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { latitude: roundCoordinate(lat), longitude: roundCoordinate(lon) };
}

/** WMO weather interpretation codes, in the words a person would use. */
export function describeWeatherCode(code: unknown) {
  const value = Number(code);
  if (value === 0) return "clear";
  if (value === 1 || value === 2) return "partly cloudy";
  if (value === 3) return "overcast";
  if (value === 45 || value === 48) return "foggy";
  if (value >= 51 && value <= 57) return "drizzle";
  if (value >= 61 && value <= 67) return "rain";
  if (value >= 71 && value <= 77) return "snow";
  if (value >= 80 && value <= 82) return "rain showers";
  if (value === 85 || value === 86) return "snow showers";
  if (value >= 95 && value <= 99) return "thunderstorms";
  return "mixed conditions";
}

const toF = (celsius: number) => Math.round(celsius * 9 / 5 + 32);

/**
 * The ranker understands three weather words, and each pulls toward seasons: warm toward spring and
 * summer, cold and wet toward fall and winter. Warm is decided first, so a warm rainy day is still
 * dressed as warm — rain alone must not push someone into winter clothes in July. The line sits at
 * 70°F: checked against a live forecast, a rainy 70°F day at 75 had read as "wet" and leaned toward
 * winter pieces, too heavy for the temperature.
 */
export function forecastToOutfitWeather(day: Pick<DayForecast, "highF" | "precipitationChance">): OutfitWeather | null {
  if (day.highF >= 70) return "warm";
  if (day.precipitationChance >= 50) return "wet";
  if (day.highF <= 55) return "cold";
  return null;
}

function day(daily: Record<string, unknown[]>, index: number): DayForecast | null {
  const at = (key: string) => (Array.isArray(daily[key]) ? daily[key][index] : undefined);
  const high = Number(at("temperature_2m_max"));
  const low = Number(at("temperature_2m_min"));
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;
  return {
    date: String(at("time") ?? ""),
    description: describeWeatherCode(at("weather_code")),
    highC: Math.round(high),
    lowC: Math.round(low),
    highF: toF(high),
    lowF: toF(low),
    precipitationChance: Math.max(0, Math.min(100, Math.round(Number(at("precipitation_probability_max")) || 0))),
    windMph: Math.max(0, Math.round(Number(at("wind_speed_10m_max")) || 0)),
  };
}

/** Turns an Open-Meteo forecast response into what Hanger needs. Null when it is unusable. */
export function parseForecast(raw: unknown, place: string): Forecast | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as { current?: Record<string, unknown>; daily?: Record<string, unknown[]> };
  if (!body.daily || typeof body.daily !== "object") return null;
  const today = day(body.daily, 0);
  if (!today) return null;
  const tomorrow = day(body.daily, 1);
  const nowC = Number(body.current?.temperature_2m);
  const now = Number.isFinite(nowC) ? { tempC: Math.round(nowC), tempF: toF(nowC), description: describeWeatherCode(body.current?.weather_code) } : null;
  const rain = today.precipitationChance >= 30 ? `, ${today.precipitationChance}% chance of rain` : "";
  const wind = today.windMph >= 15 ? `, wind up to ${today.windMph} mph` : "";
  const summary = `Today in ${place}: ${today.description}, ${today.lowF}–${today.highF}°F (${today.lowC}–${today.highC}°C)${rain}${wind}.${now ? ` Right now ${now.tempF}°F and ${now.description}.` : ""}`;
  return { place, now, today, tomorrow, outfitWeather: forecastToOutfitWeather(today), summary };
}

/** Reads a chosen place from an untrusted body, or null to clear it; undefined means refuse it. */
export function readPlace(value: unknown): Place | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const place = value as Record<string, unknown>;
  const coordinates = validCoordinates(place.latitude, place.longitude);
  const text = (field: unknown) => (typeof field === "string" && field.trim() ? field.replace(/\s+/g, " ").trim().slice(0, 80) : null);
  const name = text(place.name);
  if (!coordinates || !name) return undefined;
  return { name, region: text(place.region), country: text(place.country), ...coordinates };
}

export function placeLabel(place: Pick<Place, "name" | "region" | "country">) {
  return [place.name, place.region, place.country].filter(Boolean).join(", ");
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

async function getJson(url: string, fetchImpl: FetchLike) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const cache = new Map<string, { at: number; forecast: Forecast }>();

/** Today's and tomorrow's forecast for a rounded coordinate, or null if it cannot be had quickly. */
export async function fetchForecast(location: { latitude: number; longitude: number; place: string }, fetchImpl: FetchLike = fetch as unknown as FetchLike, now = Date.now()): Promise<Forecast | null> {
  const coordinates = validCoordinates(location.latitude, location.longitude);
  if (!coordinates) return null;
  const key = `${coordinates.latitude},${coordinates.longitude}`;
  const cached = cache.get(key);
  if (cached && now - cached.at < CACHE_MS) return { ...cached.forecast, place: location.place, summary: cached.forecast.summary.replace(/^Today in [^:]+:/, `Today in ${location.place}:`) };
  const params = new URLSearchParams({
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    current: "temperature_2m,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
    wind_speed_unit: "mph",
    timezone: "auto",
    forecast_days: "2",
  });
  const forecast = parseForecast(await getJson(`${FORECAST_URL}?${params}`, fetchImpl), location.place);
  if (forecast) cache.set(key, { at: now, forecast });
  return forecast;
}

/** Up to five places matching what someone typed, for them to choose from. */
export async function searchPlaces(query: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<Place[]> {
  const name = query.replace(/\s+/g, " ").trim().slice(0, 80);
  if (name.length < 2) return [];
  const params = new URLSearchParams({ name, count: "5", language: "en", format: "json" });
  const body = await getJson(`${GEOCODING_URL}?${params}`, fetchImpl) as { results?: Array<Record<string, unknown>> } | null;
  return (body?.results ?? []).flatMap((entry) => {
    const coordinates = validCoordinates(entry.latitude, entry.longitude);
    const placeName = typeof entry.name === "string" ? entry.name.slice(0, 80) : "";
    if (!coordinates || !placeName) return [];
    return [{
      name: placeName,
      region: typeof entry.admin1 === "string" ? entry.admin1.slice(0, 80) : null,
      country: typeof entry.country === "string" ? entry.country.slice(0, 80) : null,
      ...coordinates,
    }];
  });
}

/** Test seam: forget cached forecasts. */
export function clearForecastCache() {
  cache.clear();
}
