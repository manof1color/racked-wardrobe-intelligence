/**
 * What Hanger remembers between messages, and what it is allowed to remember.
 *
 * Conversation state lives on the account rather than in a browser tab, so closing the drawer,
 * refreshing, or picking the phone up later continues the same conversation. Two rules shape the
 * whole module. Memory is bounded: turns fall off the record, and the context handed to the model
 * is chosen against a character budget rather than by luck. And memory is a controlled vocabulary:
 * a remembered preference can only ever be a garment type, category, colour, or style the person's
 * own wardrobe and the taxonomy already contain, so a sentence about health, body, or anything else
 * sensitive leaves nothing behind.
 */
import type { AgentChatTurn } from "./platform-types.ts";
import type { WardrobeItem } from "./types.ts";
import { OUTFIT_OCCASIONS, OUTFIT_WEATHERS, STYLE_VOCABULARY, type OutfitIntent } from "./outfit-ranking.ts";

/** Turns kept on the record. Older ones fall away; what was learned from them does not. */
export const MAX_STORED_TURNS = 40;
/** Characters of conversation handed to the model in one turn: the context window, decided. */
export const PROMPT_HISTORY_CHAR_BUDGET = 4_000;
export const MAX_PREFERENCES = 12;
export const MAX_SUGGESTED_ITEM_IDS = 100;
/** A held-open request cannot ask for more outfits than a set will ever build. */
export const MAX_PENDING_OUTFIT_COUNT = 5;
const MAX_TURN_CHARS = 1_000;

export type PreferenceKind = "avoid" | "prefer";
export type PreferenceFacet = "subtype" | "category" | "color" | "style";

export interface HangerPreference {
  kind: PreferenceKind;
  facet: PreferenceFacet;
  value: string;
}

export interface HangerActiveOutfit {
  /** The latest outfit being discussed, distinct from the cumulative rotation history. */
  itemIds: string[];
  /** Controlled intent survives short follow-ups such as "swap the shoes" without storing prose. */
  intent: OutfitIntent;
}

/**
 * The request Hanger was in the middle of when it asked a question. "Build me five outfits" →
 * "what is the weather?" → "cold" has to answer the *first* message, not start a new one, or the
 * customer has to repeat themselves to get what they already asked for.
 */
export interface HangerPendingRequest {
  /** The request that is still unanswered, so the reply can be built from both messages. */
  message: string;
  /** How many outfits that request asked for, which a one-word answer would otherwise lose. */
  count: number;
}

export interface HangerConversationState {
  turns: AgentChatTurn[];
  preferences: HangerPreference[];
  /** Pieces already offered, so a follow-up brings something new rather than the same outfit. */
  suggestedItemIds: string[];
  activeOutfit: HangerActiveOutfit | null;
  pendingRequest: HangerPendingRequest | null;
  /** Messages that have fallen off the record, so the prompt can say so instead of pretending. */
  earlierTurnCount: number;
  updatedAt: string;
}

export interface PreferenceVocabulary {
  subtypes?: Iterable<string>;
  categories?: Iterable<string>;
  colors?: Iterable<string>;
  styles?: Iterable<string>;
}

const text = (value: unknown, maximum = MAX_TURN_CHARS) => (typeof value === "string" ? value.trim().slice(0, maximum) : "");
const normalize = (value: string) => value.toLocaleLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

export function emptyHangerConversation(): HangerConversationState {
  return { turns: [], preferences: [], suggestedItemIds: [], activeOutfit: null, pendingRequest: null, earlierTurnCount: 0, updatedAt: new Date(0).toISOString() };
}

/** Reads a stored record defensively: anything unexpected becomes an empty conversation. */
export function readHangerConversation(value: unknown): HangerConversationState {
  if (!value || typeof value !== "object") return emptyHangerConversation();
  const record = value as Record<string, unknown>;
  const turns = Array.isArray(record.turns)
    ? record.turns
        .filter((turn): turn is Record<string, unknown> => Boolean(turn) && typeof turn === "object")
        .filter((turn) => turn.role === "user" || turn.role === "assistant")
        .map((turn) => ({ role: turn.role as "user" | "assistant", content: text(turn.content) }))
        .filter((turn) => turn.content.length > 0)
        .slice(-MAX_STORED_TURNS)
    : [];
  const preferences = Array.isArray(record.preferences)
    ? record.preferences
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
          kind: entry.kind === "prefer" ? "prefer" as const : "avoid" as const,
          facet: (["subtype", "category", "color", "style"] as PreferenceFacet[]).find((facet) => facet === entry.facet) ?? "style" as const,
          value: normalize(text(entry.value, 40)),
        }))
        .filter((entry) => entry.value.length > 0)
        .slice(-MAX_PREFERENCES)
    : [];
  const suggestedItemIds = Array.isArray(record.suggestedItemIds)
    ? [...new Set(record.suggestedItemIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 128))].slice(-MAX_SUGGESTED_ITEM_IDS)
    : [];
  const activeRecord = record.activeOutfit && typeof record.activeOutfit === "object" ? record.activeOutfit as Record<string, unknown> : null;
  const activeIntentRecord = activeRecord?.intent && typeof activeRecord.intent === "object" ? activeRecord.intent as Record<string, unknown> : null;
  const activeItemIds = Array.isArray(activeRecord?.itemIds)
    ? [...new Set(activeRecord.itemIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 128))].slice(0, 4)
    : [];
  const activeOccasion = OUTFIT_OCCASIONS.find((value) => value === activeIntentRecord?.occasion) ?? null;
  const activeWeather = OUTFIT_WEATHERS.find((value) => value === activeIntentRecord?.weather) ?? null;
  const storedActiveStyles = Array.isArray(activeIntentRecord?.styleHints) ? activeIntentRecord.styleHints : [];
  const activeStyles = storedActiveStyles.length
    ? STYLE_VOCABULARY.filter((style) => storedActiveStyles.includes(style)).slice(0, 8)
    : [];
  // Older stored conversations predate styleSource. Their controlled style hints came from
  // the customer's request; preserve that meaning when restoring the current outfit.
  const activeStyleSource = !activeStyles.length ? "none"
    : activeIntentRecord?.styleSource === "request" || activeIntentRecord?.styleSource === "inspiration"
      ? activeIntentRecord.styleSource
      : activeIntentRecord?.styleSource === undefined ? "request" : "none";
  const activeOutfit: HangerActiveOutfit | null = activeItemIds.length ? {
    itemIds: activeItemIds,
    intent: {
      mode: activeIntentRecord?.mode === "rotation" ? "rotation" : "outfit",
      occasion: activeOccasion,
      weather: activeWeather,
      styleHints: activeStyles,
      styleSource: activeStyleSource,
      alternativeRequested: false,
    },
  } : null;
  const pendingRecord = record.pendingRequest && typeof record.pendingRequest === "object" ? record.pendingRequest as Record<string, unknown> : null;
  const pendingMessage = text(pendingRecord?.message);
  const pendingCount = Number.isFinite(pendingRecord?.count) ? Math.max(1, Math.min(MAX_PENDING_OUTFIT_COUNT, Math.floor(Number(pendingRecord?.count)))) : 1;
  const pendingRequest: HangerPendingRequest | null = pendingMessage ? { message: pendingMessage, count: pendingCount } : null;
  const earlierTurnCount = Number.isFinite(record.earlierTurnCount) ? Math.max(0, Math.floor(Number(record.earlierTurnCount))) : 0;
  return { turns, preferences, suggestedItemIds, activeOutfit, pendingRequest, earlierTurnCount, updatedAt: text(record.updatedAt, 40) || new Date(0).toISOString() };
}

export function appendTurns(state: HangerConversationState, turns: AgentChatTurn[], now: Date = new Date()): HangerConversationState {
  const additions = turns.map((turn) => ({ role: turn.role, content: text(turn.content) })).filter((turn) => turn.content.length > 0);
  const merged = [...state.turns, ...additions];
  const overflow = Math.max(0, merged.length - MAX_STORED_TURNS);
  return { ...state, turns: merged.slice(overflow), earlierTurnCount: state.earlierTurnCount + overflow, updatedAt: now.toISOString() };
}

export function rememberSuggestedItemIds(state: HangerConversationState, itemIds: Iterable<string>): HangerConversationState {
  const merged = [...new Set([...state.suggestedItemIds, ...[...itemIds].filter((id) => typeof id === "string" && id.length > 0)])];
  return { ...state, suggestedItemIds: merged.slice(-MAX_SUGGESTED_ITEM_IDS) };
}

/**
 * Hold the request open while Hanger waits for an answer, and drop it once one arrives. A request
 * is only worth holding when Hanger actually asked something back; otherwise the next unrelated
 * message would be read as an answer to a question nobody asked.
 */
export function rememberPendingRequest(state: HangerConversationState, pending: HangerPendingRequest | null): HangerConversationState {
  const message = text(pending?.message);
  if (!message) return { ...state, pendingRequest: null };
  const count = Math.max(1, Math.min(MAX_PENDING_OUTFIT_COUNT, Math.floor(Number(pending?.count) || 1)));
  return { ...state, pendingRequest: { message, count } };
}

export function rememberActiveOutfit(state: HangerConversationState, itemIds: Iterable<string>, intent: OutfitIntent): HangerConversationState {
  const ownedIds = [...new Set([...itemIds].filter((id) => typeof id === "string" && id.length > 0 && id.length <= 128))].slice(0, 4);
  return {
    ...state,
    activeOutfit: ownedIds.length ? {
      itemIds: ownedIds,
      intent: {
        mode: intent.mode,
        occasion: intent.occasion,
        weather: intent.weather,
        styleHints: STYLE_VOCABULARY.filter((style) => intent.styleHints.includes(style)).slice(0, 8),
        styleSource: intent.styleHints.length && (intent.styleSource === "request" || intent.styleSource === "inspiration") ? intent.styleSource : "none",
        alternativeRequested: false,
      },
    } : null,
  };
}

/**
 * The context window, spent deliberately. Turns are taken newest first until the budget runs out,
 * and a turn is never cut in half — a sentence sliced down the middle is worse than an absent one.
 */
export function conversationForPrompt(state: HangerConversationState, budget: number = PROMPT_HISTORY_CHAR_BUDGET) {
  const history: AgentChatTurn[] = [];
  let usedCharacters = 0;
  let droppedForBudget = 0;
  for (let index = state.turns.length - 1; index >= 0; index--) {
    const turn = state.turns[index];
    const cost = turn.content.length + turn.role.length + 2;
    if (usedCharacters + cost > budget) { droppedForBudget = index + 1; break; }
    history.unshift(turn);
    usedCharacters += cost;
  }
  return { history, usedCharacters, omittedTurnCount: state.earlierTurnCount + droppedForBudget };
}

/** Says plainly that older messages are no longer quoted, so the model never invents what they said. */
export function earlierConversationNote(omittedTurnCount: number) {
  if (omittedTurnCount <= 0) return null;
  return `${omittedTurnCount} earlier message${omittedTurnCount === 1 ? "" : "s"} in this conversation are no longer quoted. Rely on the remembered preferences below rather than guessing what they said.`;
}

const AVOID_CUES = ["don't wear", "dont wear", "do not wear", "don't like", "dont like", "do not like", "never wear", "never", "avoid", "stop suggesting", "no more", "not into", "hate", "skip"];
const PREFER_CUES = ["prefer", "i like", "i love", "mostly wear", "usually wear", "lean towards", "lean toward", "stick to", "more of", "favourite", "favorite"];

function lastCueIndex(lead: string, cues: string[]) {
  return cues.reduce((furthest, cue) => Math.max(furthest, lead.lastIndexOf(cue)), -1);
}

/**
 * Turns a sentence into remembered preferences, but only where the words are ones the wardrobe and
 * taxonomy already use. "I never wear heels" is remembered; anything about a person is not, because
 * only a vocabulary term can ever be stored.
 */
export function extractPreferences(message: string, vocabulary: PreferenceVocabulary): HangerPreference[] {
  const haystack = ` ${normalize(text(message))} `;
  const found: HangerPreference[] = [];
  const facets: Array<[PreferenceFacet, Iterable<string> | undefined]> = [
    ["subtype", vocabulary.subtypes],
    ["category", vocabulary.categories],
    ["color", vocabulary.colors],
    ["style", vocabulary.styles],
  ];
  for (const [facet, terms] of facets) {
    for (const rawTerm of terms ?? []) {
      const term = normalize(text(rawTerm, 40));
      if (term.length < 3) continue;
      const at = haystack.indexOf(` ${term}`);
      if (at < 0) continue;
      const lead = haystack.slice(Math.max(0, at - 60), at);
      const avoidAt = lastCueIndex(lead, AVOID_CUES);
      const preferAt = lastCueIndex(lead, PREFER_CUES);
      if (avoidAt < 0 && preferAt < 0) continue;
      found.push({ kind: avoidAt > preferAt ? "avoid" : "prefer", facet, value: term });
    }
  }
  return mergePreferences([], found);
}

/** The newest statement wins, so "actually I do wear heels now" replaces the older instruction. */
export function mergePreferences(existing: HangerPreference[], found: HangerPreference[]): HangerPreference[] {
  const merged: HangerPreference[] = [];
  for (const preference of [...existing, ...found]) {
    const value = normalize(preference.value);
    if (!value) continue;
    const at = merged.findIndex((entry) => entry.facet === preference.facet && entry.value === value);
    if (at >= 0) merged.splice(at, 1);
    merged.push({ ...preference, value });
  }
  return merged.slice(-MAX_PREFERENCES);
}

export function preferenceSummary(preferences: HangerPreference[]) {
  const avoids = preferences.filter((entry) => entry.kind === "avoid").map((entry) => entry.value);
  const prefers = preferences.filter((entry) => entry.kind === "prefer").map((entry) => entry.value);
  const parts = [avoids.length ? `avoids ${avoids.join(", ")}` : "", prefers.length ? `prefers ${prefers.join(", ")}` : ""].filter(Boolean);
  return parts.join("; ");
}

/** Owned pieces a remembered "I don't wear that" applies to, for the ranker to set aside. */
export function avoidedItemIds(preferences: HangerPreference[], wardrobe: WardrobeItem[]) {
  const avoided = preferences.filter((entry) => entry.kind === "avoid");
  if (!avoided.length) return [];
  return wardrobe
    .filter((item) => avoided.some((preference) => {
      const value = preference.value;
      if (preference.facet === "category") return normalize(String(item.category ?? "")) === value;
      if (preference.facet === "subtype") return normalize(String(item.subtype ?? "")) === value;
      if (preference.facet === "color") return normalize(String(item.color ?? "")) === value;
      return (item.style ?? []).some((style) => normalize(String(style)) === value);
    }))
    .map((item) => item.id);
}
