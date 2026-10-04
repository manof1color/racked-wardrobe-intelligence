import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clearForecastCache, describeWeatherCode, fetchForecast, forecastToOutfitWeather, parseForecast, readPlace, roundCoordinate, searchPlaces, validCoordinates,
} from "../lib/weather.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The shape Open-Meteo returns for the parameters fetchForecast asks for.
const openMeteo = {
  latitude: 38.9, longitude: -77.04, timezone: "America/New_York",
  current: { time: "2026-10-04T14:00", temperature_2m: 14.6, weather_code: 3 },
  daily: {
    time: ["2026-10-04", "2026-10-05"],
    weather_code: [61, 1],
    temperature_2m_max: [16.2, 21.4],
    temperature_2m_min: [9.1, 11.0],
    precipitation_probability_max: [70, 10],
    wind_speed_10m_max: [18, 6],
  },
};

test("a forecast reads like a stylist would say it, in both units", () => {
  const forecast = parseForecast(openMeteo, "Washington")!;
  assert.equal(forecast.today.highF, 61);
  assert.equal(forecast.today.lowF, 48);
  assert.equal(forecast.today.description, "rain");
  assert.equal(forecast.tomorrow?.description, "partly cloudy");
  assert.equal(forecast.summary, "Today in Washington: rain, 48–61°F (9–16°C), 70% chance of rain, wind up to 18 mph. Right now 58°F and overcast.");
  assert.equal(forecast.outfitWeather, "wet", "a cool, rainy day dresses as wet");
  assert.equal(parseForecast({}, "x"), null, "an unusable response is no forecast, not a guess");
  assert.equal(parseForecast(null, "x"), null);
});

// Warm is decided before wet. The ranker pulls "wet" toward fall and winter pieces, so a summer
// thunderstorm must not send someone out in a wool coat.
test("a warm rainy day is still dressed as warm", () => {
  assert.equal(forecastToOutfitWeather({ highF: 84, precipitationChance: 80 }), "warm");
  assert.equal(forecastToOutfitWeather({ highF: 70, precipitationChance: 55 }), "warm", "the live DC forecast: a rainy 70°F day is not winter-coat weather");
  assert.equal(forecastToOutfitWeather({ highF: 62, precipitationChance: 60 }), "wet");
  assert.equal(forecastToOutfitWeather({ highF: 41, precipitationChance: 10 }), "cold");
  assert.equal(forecastToOutfitWeather({ highF: 66, precipitationChance: 10 }), null, "a mild dry day leaves the ranker alone");
});

test("weather codes become plain words", () => {
  assert.equal(describeWeatherCode(0), "clear");
  assert.equal(describeWeatherCode(45), "foggy");
  assert.equal(describeWeatherCode(73), "snow");
  assert.equal(describeWeatherCode(95), "thunderstorms");
  assert.equal(describeWeatherCode("nonsense"), "mixed conditions");
});

test("coordinates are rounded to about a kilometre, and nonsense is refused", () => {
  assert.equal(roundCoordinate(38.897676), 38.9);
  assert.deepEqual(validCoordinates(38.897676, -77.036529), { latitude: 38.9, longitude: -77.04 });
  assert.equal(validCoordinates(91, 0), null);
  assert.equal(validCoordinates("north", 0), null);
  assert.deepEqual(readPlace({ name: " Washington ", region: "District of Columbia", country: "United States", latitude: 38.895, longitude: -77.036 }),
    { name: "Washington", region: "District of Columbia", country: "United States", latitude: 38.9, longitude: -77.04 });
  assert.equal(readPlace(null), null, "null clears the home city");
  assert.equal(readPlace({ name: "Nowhere", latitude: 200, longitude: 0 }), undefined, "an impossible place is refused");
  assert.equal(readPlace({ latitude: 1, longitude: 1 }), undefined, "a place needs a name");
});

test("a forecast is fetched once, cached, and a failure costs only the forecast", async () => {
  clearForecastCache();
  let calls = 0;
  const ok = async (url: string) => { calls += 1; assert.match(url, /latitude=38\.9&longitude=-77\.04/, "only the rounded coordinate leaves the server"); return { ok: true, json: async () => openMeteo }; };
  const first = await fetchForecast({ latitude: 38.897, longitude: -77.036, place: "Washington" }, ok, 1_000);
  const second = await fetchForecast({ latitude: 38.897, longitude: -77.036, place: "Washington" }, ok, 1_000 + 60_000);
  assert.equal(first?.today.highF, 61);
  assert.equal(second?.today.highF, 61);
  assert.equal(calls, 1, "the second ask within twenty minutes is served from cache");

  clearForecastCache();
  assert.equal(await fetchForecast({ latitude: 1, longitude: 1, place: "x" }, async () => { throw new Error("offline"); }), null);
  assert.equal(await fetchForecast({ latitude: 1, longitude: 1, place: "x" }, async () => ({ ok: false, json: async () => ({}) })), null);
  assert.match(read("lib/weather.ts"), /setTimeout\(\(\) => controller\.abort\(\), WEATHER_TIMEOUT_MS\)/, "every fetch has a deadline");
});

test("a city search returns places to choose from, and asks nothing for a stray letter", async () => {
  let asked = false;
  const geocoder = async () => {
    asked = true;
    return { ok: true, json: async () => ({ results: [
      { name: "Springfield", admin1: "Illinois", country: "United States", latitude: 39.80172, longitude: -89.64371 },
      { name: "Springfield", admin1: "Missouri", country: "United States", latitude: 37.21533, longitude: -93.29824 },
      { name: "Broken", latitude: "x", longitude: 0 },
    ] }) };
  };
  const places = await searchPlaces("Springfield", geocoder);
  assert.deepEqual(places.map((place) => place.region), ["Illinois", "Missouri"], "an unusable result is dropped");
  assert.equal(places[0].latitude, 39.8);
  asked = false;
  assert.deepEqual(await searchPlaces("S", geocoder), []);
  assert.equal(asked, false);
});

test("the forecast shapes the outfit only when the person did not say the weather", () => {
  const route = read("app/api/agents/consumer/route.ts");
  assert.match(route, /const turnIntent = !plan\.intent\.weather && forecast\?\.outfitWeather \? \{ \.\.\.plan\.intent, weather: forecast\.outfitWeather \} : plan\.intent;/);
  assert.match(route, /intentOverride: turnIntent,/);
  assert.match(route, /Forecast for \$\{forecast\.place\} from Open-Meteo/, "the reply says where the weather came from");
  const conversation = read("lib/hanger-conversation.ts");
  assert.doesNotMatch(conversation, /Never claim live weather/);
  assert.match(conversation, /When it is not supplied, never state or guess the weather/, "with no forecast, the weather is never invented");
  assert.match(conversation, /const hasWeather = Boolean\(forecast\) \|\|/, "the grounded reply stops asking for weather it already knows");
});

// A shared phone location is used for one message and kept nowhere on the server.
test("a shared location is rounded on the phone, used once, and never stored", () => {
  const route = read("app/api/agents/consumer/route.ts");
  assert.match(route, /const shared = validCoordinates\(body\.location\?\.latitude, body\.location\?\.longitude\);/);
  assert.doesNotMatch(route, /setHomeCity/, "the chat route never writes a location");
  assert.doesNotMatch(route, /location:\s*shared|shared\s*\}\s*\)\s*;?\s*\n\s*await saveHangerConversation/, "nor does it put one into the conversation record");
  const dock = read("components/agent-panels.tsx");
  assert.match(dock, /latitude: roundCoordinate\(position\.coords\.latitude\)/, "rounded on the device, before it is sent");
  assert.match(dock, /enableHighAccuracy: false/);
  assert.match(dock, /sessionStorage\.setItem\(SHARED_LOCATION_KEY/, "kept for this browser session only");
});

test("the home city belongs to the signed-in consumer alone", () => {
  const route = read("app/api/consumer/location/route.ts");
  assert.match(route, /session\.role !== "consumer"/);
  assert.match(route, /setHomeCity\(session!\.subject, place\)/, "always the session's own profile — no account id in any request");
  assert.match(route, /RATE_LIMIT_RULES\.placeSearch/, "searches are rate-limited, since each calls an outside geocoder");
  assert.match(read("components/account-settings-panel.tsx"), /\{account\.role==="consumer"&&<HomeCitySetting\/>\}/);
});
