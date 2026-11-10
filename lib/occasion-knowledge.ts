/**
 * What a request is asking for, written down so the outfit builder can act on it.
 *
 * The builder knew six occasions — work, formal, evening, casual, active, travel — and each allowed
 * a wide band of formality. In the blind evaluation of 2026-11-10 a client presentation, dinner
 * with a partner's parents, a black-tie-optional wedding and casual Friday all read as "somewhere
 * between smart casual and formal", every piece in that band was equally right, and rotation then
 * picked the same least-worn blouse, skirt and boots four times. A day of sightseeing and a long
 * walk named no occasion the builder knew at all, so rotation alone dressed them: a satin formal
 * dress and heels for sightseeing at 35 °C.
 *
 * A BRIEF is the finer reading: the dress code or activity a request names, the point on the
 * formality ladder a stylist would aim at, and — for an activity — the kinds of piece it needs
 * (running shoes for a run) or rules out (heels for a long walk). An AESTHETIC is a named look
 * (streetwear, quiet luxury, coastal): the garment types, style tags, colours and materials that
 * make it recognisable.
 *
 * Like garment-knowledge.ts this is a curated dataset, not a trained model: every entry can be
 * read, argued with and tested, the same request always gets the same reading, and nothing here was
 * learned from anybody's photos or scraped from a site. It describes clothes and occasions only —
 * never a body, a gender, an age or a budget.
 */
import { garmentFormality } from "./garment-knowledge.ts";
import type { WardrobeItem } from "./types.ts";

/** The coarse occasion families the ranker and the stored conversation already use. */
export type BriefFamily = "work" | "formal" | "evening" | "casual" | "active" | "travel";
export type BriefSlot = "top" | "bottom" | "dress" | "outerwear" | "shoe" | "bag" | "accessory";

export interface SlotNeeds {
  /** Garment types the occasion is known for. One of these is right whatever its formality. */
  prefer?: string[];
  /** Garment types the occasion rules out while anything else is owned. */
  avoid?: string[];
}

export interface OutfitBrief {
  key: string;
  /** Plain words for the reply and the evidence: "a black-tie-optional event". */
  label: string;
  family: BriefFamily;
  /** The point on the 1–5 formality ladder to aim at, and the band that suits at all. */
  target: number;
  min: number;
  max: number;
  /**
   * 1 explicit dress code ("smart casual"), 2 a specific event or activity ("wedding", "run"),
   * 3 a general setting ("work", "dinner"). The most specific phrase in a request wins.
   */
  tier: 1 | 2 | 3;
  phrases: string[];
  needs?: Partial<Record<BriefSlot, SlotNeeds>>;
  /** Athletic pieces are what the activity calls for, whatever their garment type. */
  sporty?: boolean;
  /**
   * True when the occasion is something you do rather than somewhere you are seen. Then the right
   * kind of piece is right whatever its formality — running shoes for a long walk — whereas for a
   * dress code a preferred type only breaks ties and never excuses the wrong level of dress.
   */
  functional?: boolean;
}

const SNEAKERS = ["sneakers", "low-top-sneakers", "high-top-sneakers", "slip-on-sneakers"];
const DRESS_SHOES = ["dress-shoes", "oxfords", "derbies", "heels"];
const WALKING_SHOES = [...SNEAKERS, "running-shoes", "skate-shoes", "boots", "chelsea-boots", "ankle-boots", "work-boots", "hiking-boots", "flats"];
// Shoes made for exercise. A fashion sneaker is the fallback when none is owned, not an equal.
const TRAINERS = ["running-shoes", "basketball-shoes"];
const SMART_SHOES = ["loafers", "chelsea-boots", "ankle-boots", "boots", "derbies", "flats", "mules", ...SNEAKERS];
const TAILORED_TOPS = ["dress-shirt", "blouse"];
const SMART_TOPS = ["sweater", "polo", "casual-shirt", "cardigan", "blouse"];
const EASY_TOPS = ["t-shirt", "casual-shirt", "polo", "sweater", "sweatshirt", "hoodie", "tank-top"];
const GYM_TOPS = ["t-shirt", "tank-top", "sweatshirt", "hoodie"];
const GYM_BOTTOMS = ["shorts", "leggings", "sweatpants"];

/**
 * Ordered only for reading. Matching is by tier, then by where the phrase sits in the request,
 * then by its length — see `readBrief`.
 */
export const OUTFIT_BRIEFS: OutfitBrief[] = [
  // ── Tier 1: dress codes people state outright ────────────────────────────────────────────────
  { key: "black-tie", label: "a black-tie event", family: "formal", tier: 1, target: 5, min: 4.5, max: 5,
    phrases: ["black tie", "white tie", "tuxedo", "evening gown", "ball gown"],
    needs: { shoe: { prefer: DRESS_SHOES, avoid: [...SNEAKERS, "sandals", "slides", "boots", "work-boots", "hiking-boots"] }, dress: { prefer: ["formal-dress"] }, top: { prefer: ["dress-shirt", "blouse"] }, bottom: { prefer: ["dress-pants"] }, outerwear: { prefer: ["suit-jacket", "blazer"] } } },
  { key: "black-tie-optional", label: "a black-tie-optional event", family: "formal", tier: 1, target: 4.75, min: 4, max: 5,
    phrases: ["black tie optional", "black-tie optional", "black tie preferred", "formal attire", "formal dress code"],
    needs: { shoe: { prefer: DRESS_SHOES, avoid: [...SNEAKERS, "sandals", "slides", "work-boots", "hiking-boots"] }, dress: { prefer: ["formal-dress", "midi-dress", "maxi-dress", "wrap-dress"] }, top: { prefer: ["dress-shirt", "blouse"] }, bottom: { prefer: ["dress-pants", "skirt"] }, outerwear: { prefer: ["suit-jacket", "blazer"] } } },
  { key: "cocktail", label: "cocktail attire", family: "formal", tier: 1, target: 4.25, min: 3.5, max: 5,
    phrases: ["cocktail attire", "cocktail dress", "cocktail party", "cocktail", "semi formal", "semi-formal", "semiformal", "after five"],
    needs: { shoe: { prefer: [...DRESS_SHOES, "loafers", "flats"], avoid: ["sandals", "slides", "work-boots", "hiking-boots", "running-shoes"] }, dress: { prefer: ["midi-dress", "wrap-dress", "formal-dress", "mini-dress"] } } },
  { key: "business-formal", label: "business formal", family: "work", tier: 1, target: 4.5, min: 4, max: 5,
    phrases: ["business formal", "business professional", "business attire", "suit and tie", "boardroom", "courtroom", "court hearing"],
    needs: { top: { prefer: TAILORED_TOPS }, bottom: { prefer: ["dress-pants", "skirt"] }, outerwear: { prefer: ["blazer", "suit-jacket", "overcoat"] }, shoe: { prefer: [...DRESS_SHOES, "loafers", "flats"], avoid: [...SNEAKERS, "sandals", "slides"] } } },
  { key: "business-casual", label: "business casual", family: "work", tier: 1, target: 3.5, min: 3, max: 4.25,
    phrases: ["business casual", "office casual", "smart office"],
    needs: { top: { prefer: [...TAILORED_TOPS, "sweater", "polo", "cardigan", "casual-shirt"] }, bottom: { prefer: ["chinos", "dress-pants", "skirt", "casual-pants"] }, shoe: { prefer: ["loafers", "derbies", "flats", "chelsea-boots", "ankle-boots", "oxfords"], avoid: ["slides", "running-shoes"] } } },
  { key: "smart-casual", label: "smart casual", family: "evening", tier: 1, target: 3.25, min: 2.5, max: 4,
    phrases: ["smart casual", "smart-casual", "smart but", "dressy casual", "casual chic", "polished but relaxed", "nice but not", "not too formal", "not too dressy"],
    needs: { top: { prefer: SMART_TOPS }, bottom: { prefer: ["chinos", "jeans", "casual-pants", "skirt"] }, shoe: { prefer: SMART_SHOES, avoid: ["slides", "running-shoes", "hiking-boots"] } } },
  { key: "casual-friday", label: "casual Friday at work", family: "work", tier: 1, target: 2.75, min: 2, max: 3.5,
    phrases: ["casual friday", "dress down friday", "dress-down friday", "dress down day", "jeans day"],
    needs: { top: { prefer: ["polo", "casual-shirt", "sweater", "t-shirt", "cardigan"] }, bottom: { prefer: ["jeans", "chinos", "casual-pants"] }, shoe: { prefer: [...SNEAKERS, "loafers", "chelsea-boots", "boots", "flats"], avoid: ["slides", "running-shoes"] } } },

  // ── Tier 2: events ───────────────────────────────────────────────────────────────────────────
  { key: "gala", label: "a gala or formal evening", family: "formal", tier: 2, target: 4.75, min: 4, max: 5,
    phrases: ["gala", "opera", "ballet", "charity ball", "ball", "awards", "banquet", "state dinner", "prom"],
    needs: { shoe: { prefer: DRESS_SHOES, avoid: [...SNEAKERS, "sandals", "slides", "work-boots", "hiking-boots"] }, dress: { prefer: ["formal-dress", "maxi-dress", "midi-dress"] } } },
  { key: "wedding", label: "a wedding", family: "formal", tier: 2, target: 4.25, min: 3.5, max: 5,
    phrases: ["wedding", "ceremony", "reception", "christening", "baptism", "bar mitzvah", "bat mitzvah", "quinceanera", "graduation", "engagement party", "rehearsal dinner"],
    needs: { shoe: { prefer: [...DRESS_SHOES, "loafers", "flats"], avoid: ["slides", "running-shoes", "work-boots", "hiking-boots"] }, dress: { prefer: ["formal-dress", "midi-dress", "wrap-dress", "maxi-dress"] }, top: { prefer: TAILORED_TOPS }, bottom: { prefer: ["dress-pants", "skirt"] }, outerwear: { prefer: ["blazer", "suit-jacket"] } } },
  { key: "funeral", label: "a funeral or memorial", family: "formal", tier: 2, target: 4.25, min: 3.5, max: 5,
    phrases: ["funeral", "memorial"],
    needs: { shoe: { prefer: [...DRESS_SHOES, "loafers", "flats"], avoid: [...SNEAKERS, "sandals", "slides"] }, top: { prefer: TAILORED_TOPS }, bottom: { prefer: ["dress-pants", "skirt"] } } },
  { key: "interview", label: "an interview", family: "formal", tier: 2, target: 4.25, min: 3.5, max: 5,
    phrases: ["interview", "job fair", "career fair"],
    needs: { top: { prefer: [...TAILORED_TOPS, "sweater"] }, bottom: { prefer: ["dress-pants", "skirt", "chinos"] }, outerwear: { prefer: ["blazer", "suit-jacket"] }, shoe: { prefer: [...DRESS_SHOES, "loafers", "flats", "chelsea-boots", "ankle-boots"], avoid: ["slides", "sandals", "running-shoes"] } } },
  { key: "presentation", label: "a presentation or client meeting", family: "work", tier: 2, target: 4, min: 3.5, max: 5,
    phrases: ["presentation", "client", "clients", "pitch", "board meeting", "conference", "keynote", "panel", "networking", "investor"],
    needs: { top: { prefer: TAILORED_TOPS }, bottom: { prefer: ["dress-pants", "skirt"] }, outerwear: { prefer: ["blazer", "suit-jacket"] }, shoe: { prefer: [...DRESS_SHOES, "loafers", "flats", "ankle-boots", "chelsea-boots"], avoid: ["slides", "sandals", "running-shoes"] } } },
  { key: "meet-the-family", label: "meeting family", family: "evening", tier: 2, target: 3.5, min: 2.75, max: 4.25,
    phrases: ["partner's parents", "partners parents", "girlfriend's parents", "boyfriend's parents", "meet the parents", "meeting the parents", "in-laws", "in laws", "family dinner", "thanksgiving", "holiday dinner"],
    needs: { top: { prefer: SMART_TOPS }, bottom: { prefer: ["chinos", "skirt", "casual-pants", "dress-pants"] }, shoe: { prefer: SMART_SHOES, avoid: ["slides", "running-shoes"] } } },
  { key: "date", label: "a date", family: "evening", tier: 2, target: 3.25, min: 2.5, max: 4.25,
    phrases: ["first date", "date night", "second date", "anniversary", "date"],
    needs: { top: { prefer: SMART_TOPS }, shoe: { prefer: SMART_SHOES, avoid: ["slides", "running-shoes", "hiking-boots"] } } },
  { key: "night-out", label: "a night out", family: "evening", tier: 2, target: 3.25, min: 2.5, max: 4.5,
    phrases: ["night out", "evening out", "going out", "drinks", "cocktails", "rooftop bar", "cocktail bar", "wine bar", "bar", "club", "clubbing", "birthday dinner", "birthday party", "house party", "party"],
    needs: { shoe: { prefer: [...SMART_SHOES, "heels"], avoid: ["slides", "running-shoes", "hiking-boots"] }, dress: { prefer: ["midi-dress", "wrap-dress", "mini-dress", "maxi-dress", "jumpsuit"] } } },
  { key: "daytime-event", label: "a daytime social event", family: "evening", tier: 2, target: 3.25, min: 2.5, max: 4.25,
    phrases: ["garden party", "baby shower", "bridal shower", "tea party", "afternoon tea", "luncheon", "easter", "church", "the races", "derby day", "gallery opening"],
    needs: { dress: { prefer: ["maxi-dress", "midi-dress", "wrap-dress", "shirt-dress"] }, top: { prefer: ["blouse", "casual-shirt", "polo", "cardigan"] }, bottom: { prefer: ["skirt", "chinos", "casual-pants"] }, shoe: { prefer: ["flats", "sandals", "loafers", "mules", "heels"], avoid: ["slides", "running-shoes", "work-boots", "hiking-boots"] } } },
  { key: "pub", label: "a relaxed drink out", family: "casual", tier: 2, target: 2.5, min: 1.75, max: 3.25,
    phrases: ["pub", "dive bar", "sports bar", "brewery", "beer garden", "taproom", "trivia night", "karaoke"],
    needs: { shoe: { prefer: [...SNEAKERS, "boots", "chelsea-boots", "work-boots", "loafers"], avoid: ["heels", "slides", "dress-shoes", "oxfords", "running-shoes"] } } },
  { key: "concert", label: "a concert or festival", family: "casual", tier: 2, target: 2.25, min: 1.5, max: 3.25,
    phrases: ["concert", "gig", "festival", "show tonight", "game night", "the game", "stadium", "tailgate"],
    needs: { shoe: { prefer: [...SNEAKERS, "boots", "chelsea-boots", "work-boots"], avoid: ["heels", "slides", "dress-shoes", "oxfords"] } } },

  // ── Tier 2: activities ───────────────────────────────────────────────────────────────────────
  { key: "run", label: "a run", family: "active", tier: 2, functional: true, target: 1, min: 1, max: 1.5, sporty: true,
    phrases: ["run", "running", "jog", "jogging", "5k", "10k", "marathon", "sprints"],
    needs: { top: { prefer: ["t-shirt", "tank-top", "sweatshirt"] }, bottom: { prefer: ["shorts", "leggings", "sweatpants"], avoid: ["jeans", "chinos", "casual-pants", "dress-pants", "skirt"] }, shoe: { prefer: ["running-shoes"], avoid: ["hiking-boots", "work-boots", "boots", "sandals", "slides", ...DRESS_SHOES, "loafers"] }, outerwear: { prefer: ["rain-jacket"] } } },
  { key: "gym", label: "a workout", family: "active", tier: 2, functional: true, target: 1, min: 1, max: 1.5, sporty: true,
    phrases: ["gym", "workout", "work out", "training", "lifting", "weights", "crossfit", "hiit", "spin class", "exercise", "athletic", "bootcamp", "boxing"],
    needs: { top: { prefer: GYM_TOPS }, bottom: { prefer: GYM_BOTTOMS }, shoe: { prefer: TRAINERS, avoid: ["hiking-boots", "work-boots", "boots", "sandals", "slides", ...DRESS_SHOES, "loafers"] }, bag: { prefer: ["duffel", "backpack"] } } },
  { key: "yoga", label: "yoga or a studio class", family: "active", tier: 2, functional: true, target: 1, min: 1, max: 1.75, sporty: true,
    phrases: ["yoga", "pilates", "barre", "stretching", "dance class", "meditation"],
    needs: { top: { prefer: ["tank-top", "t-shirt", "sweatshirt"] }, bottom: { prefer: ["leggings", "shorts", "sweatpants"] }, shoe: { prefer: [...TRAINERS, "slides", "sandals"], avoid: ["hiking-boots", "work-boots", "boots", ...DRESS_SHOES, "loafers"] } } },
  { key: "hike", label: "a hike", family: "active", tier: 2, functional: true, target: 1.5, min: 1, max: 2.5, sporty: true,
    phrases: ["hike", "hiking", "trail", "trek", "trekking", "camping", "backpacking", "climbing", "bouldering", "fishing"],
    needs: { top: { prefer: ["t-shirt", "sweatshirt", "casual-shirt", "hoodie", "sweater"] }, bottom: { prefer: ["casual-pants", "shorts", "leggings"], avoid: ["skirt", "dress-pants"] }, shoe: { prefer: ["hiking-boots", "work-boots", "boots", "running-shoes"], avoid: ["sandals", "slides", ...DRESS_SHOES, "loafers", "flats", "mules"] }, outerwear: { prefer: ["rain-jacket", "vest", "puffer-jacket"] }, bag: { prefer: ["backpack"] } } },
  { key: "court-sport", label: "a game of sport", family: "active", tier: 2, functional: true, target: 1.25, min: 1, max: 2, sporty: true,
    phrases: ["tennis", "pickleball", "basketball", "soccer", "football practice", "volleyball", "squash", "badminton", "cycling", "bike ride", "skating", "rowing"],
    needs: { top: { prefer: ["t-shirt", "tank-top", "polo", "sweatshirt"] }, bottom: { prefer: ["shorts", "leggings", "sweatpants"] }, shoe: { prefer: TRAINERS, avoid: ["hiking-boots", "work-boots", "boots", "sandals", "slides", ...DRESS_SHOES, "loafers"] } } },
  { key: "golf", label: "a round of golf", family: "active", tier: 2, functional: true, target: 2.5, min: 2, max: 3.25,
    phrases: ["golf", "driving range", "country club"],
    needs: { top: { prefer: ["polo", "sweater"] }, bottom: { prefer: ["chinos", "shorts", "casual-pants", "skirt"], avoid: ["jeans", "sweatpants", "leggings"] }, shoe: { prefer: [...SNEAKERS, "running-shoes"], avoid: ["sandals", "slides", "boots", "work-boots", "heels"] } } },
  { key: "beach", label: "the beach or pool", family: "casual", tier: 2, functional: true, target: 1.5, min: 1, max: 2.5,
    phrases: ["beach", "pool", "poolside", "swim", "swimming", "lake day", "boat", "boating", "sailing", "cookout", "barbecue", "bbq", "picnic", "luau"],
    needs: { top: { prefer: ["t-shirt", "tank-top", "casual-shirt", "polo"] }, bottom: { prefer: ["shorts", "skirt", "casual-pants"], avoid: ["dress-pants", "sweatpants"] }, dress: { prefer: ["casual-dress", "maxi-dress", "shirt-dress", "romper"] }, shoe: { prefer: ["sandals", "slides", "slip-on-sneakers", "low-top-sneakers", "sneakers"], avoid: ["boots", "work-boots", "hiking-boots", "chelsea-boots", "ankle-boots", ...DRESS_SHOES, "loafers"] }, bag: { prefer: ["tote", "backpack"] } } },
  { key: "walk", label: "a day on your feet", family: "casual", tier: 2, functional: true, target: 2, min: 1.5, max: 3,
    phrases: ["long walk", "walk", "walking", "stroll", "sightseeing", "sight-seeing", "exploring", "explore the city", "city break", "tourist", "museum", "zoo", "theme park", "amusement park", "farmers market", "market", "errands", "shopping", "on my feet", "walk far", "walk the dog"],
    needs: { top: { prefer: EASY_TOPS }, dress: { prefer: ["casual-dress", "shirt-dress", "maxi-dress", "romper"], avoid: ["formal-dress"] }, shoe: { prefer: WALKING_SHOES, avoid: ["heels", "dress-shoes", "oxfords", "slides", "mules", "clogs"] }, bag: { prefer: ["backpack", "crossbody", "tote"] } } },
  { key: "skate", label: "skating or hanging out", family: "casual", tier: 2, functional: true, target: 1.75, min: 1.5, max: 2.5,
    phrases: ["skate park", "skatepark", "skateboarding", "skating with", "arcade", "bowling", "mini golf"],
    needs: { top: { prefer: ["t-shirt", "hoodie", "sweatshirt", "casual-shirt"] }, bottom: { prefer: ["jeans", "casual-pants", "shorts"] }, shoe: { prefer: ["skate-shoes", ...SNEAKERS], avoid: ["heels", "dress-shoes", "oxfords", "loafers", "slides", "sandals"] } } },
  { key: "lounge", label: "a day at home", family: "casual", tier: 2, functional: true, target: 1.25, min: 1, max: 2.25,
    phrases: ["lounging", "lounge", "at home", "night in", "movie night", "working from home", "work from home", "wfh", "lazy day", "couch", "cozy day", "sick day", "sleepover"],
    needs: { top: { prefer: ["hoodie", "sweatshirt", "t-shirt", "sweater", "cardigan"] }, bottom: { prefer: ["sweatpants", "leggings", "shorts"] }, shoe: { prefer: ["slides", ...SNEAKERS, "clogs"], avoid: DRESS_SHOES } } },
  { key: "school", label: "school or class", family: "casual", tier: 2, target: 2.25, min: 1.5, max: 3.25,
    phrases: ["school", "class", "campus", "lecture", "library", "study session", "studying"],
    needs: { shoe: { prefer: [...SNEAKERS, "boots", "chelsea-boots", "loafers"], avoid: ["heels", "slides"] }, bag: { prefer: ["backpack", "tote"] } } },
  { key: "flight", label: "a day of travel", family: "travel", tier: 2, functional: true, target: 2, min: 1, max: 3,
    phrases: ["flight", "airport", "plane", "road trip", "long drive", "train ride", "train", "travel day", "travel", "trip", "layover", "red eye"],
    needs: { top: { prefer: ["t-shirt", "sweatshirt", "hoodie", "sweater", "cardigan", "casual-shirt"] }, bottom: { prefer: ["jeans", "casual-pants", "sweatpants", "leggings", "chinos"] }, shoe: { prefer: [...SNEAKERS, "slip-on-sneakers", "running-shoes", "chelsea-boots", "loafers"], avoid: ["heels", "dress-shoes", "oxfords"] }, bag: { prefer: ["backpack", "tote", "duffel", "crossbody"] } } },
  { key: "commute", label: "the commute to work", family: "travel", tier: 2, target: 3, min: 2, max: 4.25,
    phrases: ["commute", "commuting", "train to work", "bike to work", "walk to work"],
    needs: { shoe: { prefer: [...SMART_SHOES, "oxfords"], avoid: ["heels", "slides", "sandals"] }, bag: { prefer: ["briefcase", "backpack", "tote", "crossbody"] } } },
  { key: "brunch", label: "brunch or coffee", family: "casual", tier: 2, target: 2.75, min: 2, max: 3.5,
    phrases: ["brunch", "coffee", "breakfast", "lunch with friends", "lunch date", "cafe", "bakery"],
    needs: { top: { prefer: [...SMART_TOPS, "t-shirt"] }, shoe: { prefer: SMART_SHOES, avoid: ["slides", "running-shoes"] } } },
  { key: "offsite", label: "a casual work event", family: "work", tier: 2, target: 2.75, min: 2, max: 3.5,
    phrases: ["offsite", "off-site", "team building", "team outing", "work retreat", "team lunch", "happy hour", "work drinks", "office party", "holiday party"],
    needs: { top: { prefer: ["polo", "casual-shirt", "sweater", "t-shirt", "cardigan", "blouse"] }, bottom: { prefer: ["chinos", "jeans", "casual-pants", "skirt"] }, shoe: { prefer: [...SNEAKERS, "loafers", "chelsea-boots", "boots", "flats"], avoid: ["slides", "heels"] } } },

  // ── Tier 3: general settings. Each keeps the band the ranker has always used for its family. ──
  { key: "formal", label: "a formal occasion", family: "formal", tier: 3, target: 4.5, min: 3.5, max: 5,
    phrases: ["formal", "dressy", "dressier", "dress up", "dressed up", "fancy", "fancier", "classy", "classier", "upscale", "elevated"] },
  { key: "work", label: "work", family: "work", tier: 3, target: 3.5, min: 2.5, max: 4.5,
    phrases: ["work", "office", "meeting", "business", "professional", "polished"] },
  { key: "dinner", label: "dinner or an evening out", family: "evening", tier: 3, target: 3.5, min: 2.5, max: 5,
    phrases: ["dinner", "evening", "restaurant", "theatre", "theater"] },
  { key: "casual", label: "a casual day", family: "casual", tier: 3, target: 2, min: 1.5, max: 3.5,
    phrases: ["casual", "weekend", "everyday", "relaxed", "hanging out", "hang out", "with friends", "chill", "low key", "low-key", "laid back", "day off"] },
];

const BRIEF_BY_KEY = new Map(OUTFIT_BRIEFS.map((brief) => [brief.key, brief]));
export const BRIEF_KEYS = OUTFIT_BRIEFS.map((brief) => brief.key);
export const briefByKey = (key: unknown): OutfitBrief | null => (typeof key === "string" ? BRIEF_BY_KEY.get(key) ?? null : null);

/** The general brief that stands for a coarse occasion when nothing finer is known. */
const FAMILY_DEFAULT: Record<BriefFamily, string> = { formal: "formal", work: "work", evening: "dinner", casual: "casual", active: "gym", travel: "flight" };
export const briefForFamily = (family: BriefFamily | null | undefined): OutfitBrief | null => (family ? BRIEF_BY_KEY.get(FAMILY_DEFAULT[family]) ?? null : null);

/**
 * Words that move a brief half a step without naming a new one: "a casual dinner spot" is still a
 * dinner, "a fancy brunch" is still brunch. Read only when the brief itself came from other words.
 */
const DRESS_DOWN = ["casual", "relaxed", "laid back", "laid-back", "low key", "low-key", "chill", "comfortable", "comfy", "not stiff", "informal", "creative", "startup", "start-up", "easygoing"];
const DRESS_UP = ["formal", "dressy", "fancy", "upscale", "elegant", "fine dining", "nice restaurant", "michelin", "elevated", "classy"];

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NEGATED = /\b(?:not|no|no longer|less|without|avoid|never|isn['’]?t|not too|nothing)\s+(?:for\s+)?(?:an?\s+|the\s+|too\s+|very\s+)?$/;

/**
 * Everyday uses of a phrase that name no occasion: "running errands" is not a run, "would this work
 * with jeans" is not the office, "meeting friends" is not a meeting. Tested against the words
 * around the match.
 */
const NOT_AN_OCCASION: Record<string, RegExp> = {
  run: /\brun\s+(?:errands?|late|out|into|through|over|a\s|the\s|some|low)|\bruns\s+(?:small|large|big|tight|long|short|true|a\s)/,
  running: /\brunning\s+(?:errands?|late|out|into|through|over|a\s|the\s|some|low|shoes|shorts|tights)/,
  work: /\b(?:would|will|could|might|does|doesn't|can|make\s+it|makes\s+it)\s+work\b|\bwork(?:s|ed)?\s+(?:with|well|together|better|best|for\s+(?:me|this|that|it|them))\b/,
  meeting: /\bmeeting\s+(?:up|friends?|a\s+friend|my\s+(?:friends?|mates?|family|parents|date|partner|girlfriend|boyfriend)|him|her|them|the\s+parents)\b/,
  date: /\b(?:up\s+to|out\s+of|today's|the)\s+date\b|\bdate\s+of\b/,
  class: /\b(?:first|world|business|high|middle|upper)[- ]class\b/,
  training: /\btraining\s+(?:tank|tee|top|shorts|leggings|shoes|jacket|pants)\b/,
  bar: /\b(?:protein|granola|candy|chocolate)\s+bar\b/,
  trip: /\btrip\s+(?:over|up)\b/,
  show: /\bshow\s+me\b/,
};

/**
 * Where a phrase first appears as an occasion — not negated, not an everyday turn of phrase — or -1.
 * With `inflected`, a plural or an -ing form counts too: "pitching to investors" is a pitch to an
 * investor. Only specific events and activities are read that loosely; "works" is not "work".
 */
function positiveIndex(request: string, phrase: string, inflected = false) {
  for (const match of request.matchAll(new RegExp(`\\b${escape(phrase)}${inflected ? "(?:s|es|ing)?" : ""}\\b`, "g"))) {
    const at = match.index ?? 0;
    if (NEGATED.test(request.slice(Math.max(0, at - 30), at))) continue;
    const everyday = NOT_AN_OCCASION[phrase];
    if (everyday && everyday.test(request.slice(Math.max(0, at - 16), at + phrase.length + 24))) continue;
    return at;
  }
  return -1;
}

export interface BriefReading {
  brief: OutfitBrief;
  /** Half-steps the request moved the target, from words like "casual" or "fancy". */
  shift: number;
  /** The words that named it, for the evidence line. */
  matched: string;
}

/**
 * The brief a request names, or null. The most specific phrase wins — a stated dress code over an
 * event, an event over a general setting — and among equals the one mentioned first, since "gym
 * first, then coffee" is dressed for the gym. Words that sit inside a longer match are part of it:
 * "black tie optional" is not read as "black tie", nor "family dinner" as "dinner".
 */
function briefMatches(request: string) {
  const matches: Array<{ brief: OutfitBrief; index: number; phrase: string }> = [];
  for (const brief of OUTFIT_BRIEFS) {
    for (const phrase of brief.phrases) {
      const index = positiveIndex(request, phrase, brief.tier === 2);
      if (index >= 0) matches.push({ brief, index, phrase });
    }
  }
  return matches.filter((match) => !matches.some((other) => other !== match && other.phrase.length > match.phrase.length
    && match.index >= other.index && match.index + match.phrase.length <= other.index + other.phrase.length));
}

const normalizeRequest = (message: string) => ` ${String(message ?? "").toLocaleLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ")} `;

/**
 * Every brief a request names, in the order mentioned. "A morning run, then a quick breakfast"
 * names two; the outfit leads with the first, and a second outfit may be built for the other.
 */
export function briefsNamed(message: string): string[] {
  return [...new Set(briefMatches(normalizeRequest(message)).sort((a, b) => a.index - b.index).map((match) => match.brief.key))];
}

export function readBrief(message: string): BriefReading | null {
  const request = normalizeRequest(message);
  const [best] = briefMatches(request).sort((a, b) => a.brief.tier - b.brief.tier || a.index - b.index || b.phrase.length - a.phrase.length);
  if (!best) return null;
  const named = (words: string[]) => words.some((word) => !best.phrase.includes(word) && positiveIndex(request, word) >= 0);
  // A dress code already says how dressed up to be; only events and settings are nudged.
  const shift = best.brief.tier === 1 ? 0 : (named(DRESS_UP) ? 0.5 : 0) - (named(DRESS_DOWN) ? 0.5 : 0);
  return { brief: best.brief, shift, matched: best.phrase };
}

/** A brief with its target moved by a request's "casual" or "fancy", kept inside the ladder. */
export function shiftedBrief(brief: OutfitBrief, shift: number): OutfitBrief {
  if (!shift) return brief;
  const move = (level: number) => Math.max(1, Math.min(5, level + shift));
  return { ...brief, target: move(brief.target), min: move(brief.min), max: move(brief.max) };
}

type Piece = Pick<WardrobeItem, "name" | "category" | "subtype" | "customType" | "style" | "pattern" | "material">;
const lower = (value: unknown) => String(value ?? "").toLocaleLowerCase();
const SPORTY_TAGS = ["athletic", "sporty", "sport", "performance", "activewear"];
const SPORTY_WORDS = /\b(?:running|training|performance|gym|workout|athletic|sports?|track|yoga|jogger|joggers|trail|hiking|quarter[- ]zip|windbreaker|compression|dri[- ]?fit)\b/;

/** A piece made for exercise: tagged so by recognition, or named so by its owner. */
export function isSportyPiece(item: Piece) {
  if ((item.style ?? []).some((tag) => SPORTY_TAGS.includes(lower(tag)))) return true;
  return SPORTY_WORDS.test(lower(`${item.name} ${item.customType ?? ""}`));
}

/**
 * Pieces that belong to one kind of day. A briefcase is for work and a gym duffel for the gym;
 * either one topping off dinner with someone's parents is a piece added because there was room for
 * it. An evening gown is as formal as a suit and still not what a client presentation calls for.
 */
const KIND_FAMILIES: Record<string, BriefFamily[]> = {
  briefcase: ["work", "formal"], duffel: ["active", "travel"], backpack: ["casual", "travel", "active"], clutch: ["formal", "evening"],
  "formal-dress": ["formal", "evening"],
};

function slotOf(item: Piece): BriefSlot | null {
  const category = lower(item.category);
  return (["top", "bottom", "dress", "outerwear", "shoe", "bag", "accessory"] as BriefSlot[]).find((slot) => slot === category) ?? null;
}

/** How far a level sits from a target, where the top and bottom of the ladder have no "too much". */
function distance(level: number, brief: OutfitBrief) {
  if (brief.target >= 4.5 && level >= brief.target) return 0;
  if (brief.target <= 1.25 && level <= brief.target) return 0;
  return Math.abs(level - brief.target);
}

export interface BriefFit { score: number; evidence: string; preferred: boolean; avoided: boolean }

/**
 * How well a piece suits a brief, 0–100. Formality decides first, and steeply: a piece loses 30
 * points for each step from the target, so a named occasion outweighs rotation instead of merely
 * tipping it. Then the garment type: one the occasion is known for is right whatever its ladder
 * value (running shoes for a long walk); one it rules out is wrong however formal it is (heels
 * for a hike). Jewelry dresses up or down, so it suits everything but exercise.
 */
export function briefFit(item: Piece, brief: OutfitBrief): BriefFit {
  if (lower(item.category) === "jewelry") {
    return brief.family === "active"
      ? { score: 30, evidence: "Jewelry is best left off for exercise.", preferred: false, avoided: true }
      : { score: 75, evidence: "Jewelry dresses up or down.", preferred: false, avoided: false };
  }
  const formality = garmentFormality(item);
  const sporty = isSportyPiece(item);
  const needs = brief.needs?.[slotOf(item) ?? "top"];
  const subtype = lower(item.subtype);
  const preferred = Boolean(needs?.prefer?.includes(subtype)) && slotOf(item) !== null;
  const wrongKind = !preferred && Boolean(KIND_FAMILIES[subtype]) && !KIND_FAMILIES[subtype].includes(brief.family);
  const avoided = (Boolean(needs?.avoid?.includes(subtype)) && slotOf(item) !== null) || wrongKind;
  if (avoided) return { score: 10, evidence: `${formality.basis} is the wrong kind of piece for ${brief.label}.`, preferred: false, avoided: true };
  // Exercise is dressed by what a piece is for, not by where it sits on a ladder of formality.
  if (brief.sporty && sporty) return { score: preferred || !needs?.prefer ? 100 : 90, evidence: `Made for exercise, which suits ${brief.label}.`, preferred, avoided: false };
  const level = formality.level;
  const inside = level >= brief.min && level <= brief.max;
  const outside = level < brief.min ? brief.min - level : level - brief.max;
  let score = inside ? Math.round(100 - 30 * distance(level, brief)) : Math.max(0, Math.round(40 - 25 * outside));
  // For something you do, the right kind of piece is never far wrong. For a dress code it only
  // breaks ties: another kind gives a little ground to it, and the level of dress still decides.
  if (preferred && brief.functional) score = Math.max(score, 88);
  else if (!preferred && needs?.prefer?.length && inside) score = Math.max(0, score - 8);
  const evidence = preferred
    ? `${formality.basis} is a natural choice for ${brief.label}.`
    : inside
      ? `${formality.label} (${formality.basis}) suits ${brief.label}.`
      : level < brief.min
        ? `${formality.label} (${formality.basis}) is too casual for ${brief.label}.`
        : `${formality.label} (${formality.basis}) is dressier than ${brief.label} needs.`;
  return { score, evidence, preferred, avoided: false };
}

/**
 * How many steps a piece sits outside a brief's band; 0 inside it. The builder gates on this before
 * rotation gets a say. A piece the occasion is known for counts as inside, and one it rules out as
 * well outside, whatever the ladder says.
 */
export function briefGap(item: Piece, brief: OutfitBrief) {
  if (lower(item.category) === "jewelry") return brief.family === "active" ? 1 : 0;
  const fit = briefFit(item, brief);
  if (fit.avoided) return 2;
  if ((fit.preferred && brief.functional) || (brief.sporty && isSportyPiece(item))) return 0;
  const { level } = garmentFormality(item);
  const outside = level < brief.min ? brief.min - level : level > brief.max ? level - brief.max : 0;
  // For exercise, a piece made for it comes before one that merely sits low on the ladder: a
  // training tee before a never-worn hoodie, while either is owned.
  return brief.sporty ? Math.max(outside, 0.5) : outside;
}

// ── Aesthetics ───────────────────────────────────────────────────────────────────────────────

export interface OutfitAesthetic {
  key: string;
  label: string;
  phrases: string[];
  /** Style tags recognition attaches to pieces (the ranker's style vocabulary). */
  tags: string[];
  /** Garment types the look is built from, and ones that break it. */
  subtypes: string[];
  avoid?: string[];
  /** Colour words that belong to the look. Empty means colour does not define it. */
  colors: string[];
  /** Words in a piece's name, material or pattern that belong to the look. */
  words: string[];
}

const NEUTRALS = ["black", "white", "grey", "gray", "navy", "beige", "cream", "ivory", "tan", "camel", "charcoal", "stone", "sand", "taupe"];
const EARTH = ["olive", "brown", "tan", "khaki", "rust", "camel", "forest", "green", "beige", "sand", "mustard", "burgundy"];

/**
 * Named looks people ask for, most of them from the way outfits are talked about online. Each is
 * described by what it is made of, in the same terms a wardrobe is already stored in, so a look can
 * be matched against any closet without a picture of anyone.
 */
export const OUTFIT_AESTHETICS: OutfitAesthetic[] = [
  { key: "streetwear", label: "streetwear", phrases: ["streetwear", "street style", "hypebeast", "skater", "urban"],
    tags: ["casual", "statement", "utility", "sporty", "relaxed"], subtypes: ["hoodie", "sweatshirt", "t-shirt", "jeans", "casual-pants", "sweatpants", "shorts", "high-top-sneakers", "sneakers", "low-top-sneakers", "skate-shoes", "basketball-shoes", "bomber-jacket", "puffer-jacket", "denim-jacket", "beanie", "backpack", "crossbody", "work-boots"],
    avoid: ["dress-pants", "dress-shirt", "oxfords", "dress-shoes", "loafers", "heels", "blazer", "suit-jacket"], colors: [], words: ["graphic", "cargo", "oversized", "boxy", "ripped", "logo", "baggy", "jordan", "dunk"] },
  { key: "minimalist", label: "minimalist", phrases: ["minimalist", "minimal", "clean lines", "capsule", "scandi", "scandinavian", "understated", "simple and clean"],
    tags: ["minimal", "sleek", "classic", "refined", "structured"], subtypes: ["t-shirt", "sweater", "dress-shirt", "casual-shirt", "dress-pants", "chinos", "jeans", "casual-pants", "sneakers", "low-top-sneakers", "loafers", "chelsea-boots", "overcoat", "blazer", "tote", "midi-dress", "shirt-dress"],
    avoid: [], colors: NEUTRALS, words: ["solid", "plain", "crewneck", "leather", "fine-knit"] },
  { key: "quiet-luxury", label: "quiet luxury", phrases: ["quiet luxury", "old money", "stealth wealth", "rich mom", "country club look", "polished and expensive"],
    tags: ["refined", "elegant", "classic", "tailored", "minimal"], subtypes: ["sweater", "cardigan", "dress-shirt", "blouse", "polo", "dress-pants", "chinos", "skirt", "loafers", "flats", "oxfords", "derbies", "blazer", "overcoat", "handbag", "midi-dress", "watch", "belt", "scarf"],
    avoid: ["hoodie", "sweatpants", "running-shoes", "slides", "puffer-jacket"], colors: ["cream", "ivory", "camel", "navy", "beige", "white", "tan", "charcoal", "brown", "stone", "taupe"], words: ["cashmere", "merino", "silk", "wool", "linen", "suede", "tweed", "cable"] },
  { key: "preppy", label: "preppy", phrases: ["preppy", "ivy league", "ivy style", "collegiate", "prep", "nantucket", "tenniscore"],
    tags: ["classic", "tailored", "refined"], subtypes: ["polo", "dress-shirt", "casual-shirt", "sweater", "cardigan", "chinos", "skirt", "shorts", "loafers", "low-top-sneakers", "sneakers", "blazer", "vest", "belt"],
    avoid: ["hoodie", "sweatpants", "work-boots"], colors: ["navy", "white", "green", "red", "khaki", "light blue", "pink", "cream"], words: ["oxford", "striped", "argyle", "cable", "plaid", "rugby", "pleated", "button"] },
  { key: "dark-academia", label: "dark academia", phrases: ["dark academia", "academia", "bookish", "librarian", "professor"],
    tags: ["classic", "vintage", "layered", "tailored", "structured"], subtypes: ["sweater", "cardigan", "dress-shirt", "blouse", "dress-pants", "skirt", "chinos", "loafers", "oxfords", "derbies", "boots", "chelsea-boots", "blazer", "overcoat", "vest", "scarf", "briefcase"],
    avoid: ["hoodie", "sweatpants", "running-shoes", "slides", "shorts"], colors: ["brown", "black", "charcoal", "burgundy", "forest", "green", "camel", "cream", "navy", "grey", "tan"], words: ["tweed", "wool", "plaid", "corduroy", "turtleneck", "knit", "houndstooth", "leather"] },
  { key: "grunge", label: "grunge", phrases: ["grunge", "90s grunge", "punk", "rocker", "rock chic", "edgy", "biker", "alt", "goth", "emo"],
    tags: ["statement", "vintage", "casual", "layered", "utility"], subtypes: ["t-shirt", "casual-shirt", "hoodie", "jeans", "work-boots", "boots", "chelsea-boots", "high-top-sneakers", "leather-jacket", "denim-jacket", "bomber-jacket", "beanie"],
    avoid: ["polo", "chinos", "loafers", "blazer", "dress-pants"], colors: ["black", "charcoal", "grey", "red", "burgundy", "olive"], words: ["ripped", "distressed", "flannel", "plaid", "band", "graphic", "leather", "studded", "faded"] },
  { key: "y2k", label: "Y2K", phrases: ["y2k", "2000s", "early 2000s", "mcbling", "baddie"],
    tags: ["statement", "sporty", "casual", "sleek"], subtypes: ["tank-top", "t-shirt", "jeans", "skirt", "mini-dress", "shorts", "sneakers", "heels", "sandals", "shoulder-bag", "denim-jacket", "sunglasses"],
    avoid: ["overcoat", "dress-pants", "oxfords"], colors: ["pink", "light blue", "white", "silver", "purple", "red"], words: ["low-rise", "baby tee", "cropped", "velour", "cargo", "metallic", "mini", "butterfly"] },
  { key: "cottagecore", label: "cottagecore", phrases: ["cottagecore", "prairie", "romantic", "soft girl", "fairycore", "countryside", "coquette", "balletcore"],
    tags: ["vintage", "elegant", "relaxed", "comfortable"], subtypes: ["blouse", "cardigan", "sweater", "skirt", "maxi-dress", "midi-dress", "casual-dress", "wrap-dress", "flats", "sandals", "boots", "ankle-boots", "tote", "hat"],
    avoid: ["hoodie", "sweatpants", "running-shoes", "puffer-jacket", "high-top-sneakers"], colors: ["cream", "white", "pink", "green", "yellow", "light blue", "multicolor", "ivory", "lavender"], words: ["floral", "linen", "lace", "ruffle", "gingham", "embroidered", "puff", "knit", "straw"] },
  { key: "coastal", label: "coastal", phrases: ["coastal", "coastal grandmother", "coastal grandma", "beachy", "nautical", "resort", "vacation", "holiday in", "mediterranean", "european summer", "tomato girl"],
    tags: ["relaxed", "classic", "minimal", "elegant"], subtypes: ["casual-shirt", "t-shirt", "tank-top", "blouse", "cardigan", "casual-pants", "shorts", "skirt", "shirt-dress", "maxi-dress", "sandals", "low-top-sneakers", "slip-on-sneakers", "flats", "tote", "hat", "sunglasses"],
    avoid: ["hoodie", "sweatpants", "work-boots", "puffer-jacket"], colors: ["white", "cream", "ivory", "navy", "light blue", "blue", "sand", "tan", "natural", "beige"], words: ["linen", "striped", "straw", "wide-leg", "cotton", "canvas", "woven"] },
  { key: "boho", label: "boho", phrases: ["boho", "bohemian", "hippie", "festival look", "70s", "seventies", "free spirit"],
    tags: ["relaxed", "vintage", "statement", "layered"], subtypes: ["blouse", "tank-top", "skirt", "maxi-dress", "casual-dress", "jeans", "sandals", "boots", "ankle-boots", "denim-jacket", "vest", "hat", "crossbody", "necklace", "earrings"],
    avoid: ["dress-pants", "oxfords", "blazer", "running-shoes"], colors: EARTH, words: ["floral", "fringe", "suede", "crochet", "embroidered", "paisley", "flowy", "flared", "straw"] },
  { key: "athleisure", label: "athleisure", phrases: ["athleisure", "sporty", "sporty chic", "gym to", "pilates princess", "active look", "off duty", "off-duty", "model off duty"],
    tags: ["sporty", "athletic", "comfortable", "sleek", "casual"], subtypes: ["leggings", "sweatpants", "shorts", "sweatshirt", "hoodie", "tank-top", "t-shirt", "running-shoes", "sneakers", "low-top-sneakers", "puffer-jacket", "rain-jacket", "vest", "backpack", "duffel", "hat"],
    avoid: ["dress-pants", "dress-shirt", "oxfords", "heels", "loafers", "blazer"], colors: [], words: ["training", "performance", "running", "jogger", "quarter-zip", "windbreaker", "track"] },
  { key: "gorpcore", label: "gorpcore", phrases: ["gorpcore", "outdoorsy", "granola", "hiker look", "trail look", "mountain", "utility look", "workwear"],
    tags: ["utility", "sporty", "layered", "comfortable"], subtypes: ["casual-pants", "shorts", "sweatshirt", "casual-shirt", "t-shirt", "sweater", "hiking-boots", "work-boots", "running-shoes", "rain-jacket", "puffer-jacket", "vest", "beanie", "backpack"],
    avoid: ["heels", "dress-shoes", "oxfords", "dress-pants", "blouse"], colors: EARTH, words: ["cargo", "fleece", "hiking", "flannel", "canvas", "ripstop", "shell", "chore", "carpenter"] },
  { key: "parisian", label: "Parisian", phrases: ["parisian", "french girl", "french style", "effortless chic", "chic", "elegant but simple", "classic chic"],
    tags: ["classic", "minimal", "elegant", "refined", "tailored"], subtypes: ["t-shirt", "sweater", "blouse", "casual-shirt", "jeans", "skirt", "dress-pants", "flats", "loafers", "ankle-boots", "low-top-sneakers", "blazer", "overcoat", "midi-dress", "wrap-dress", "shoulder-bag", "scarf"],
    avoid: ["hoodie", "sweatpants", "running-shoes", "slides"], colors: ["navy", "white", "black", "cream", "red", "camel", "beige"], words: ["striped", "breton", "trench", "silk", "wool", "straight"] },
  { key: "clean-girl", label: "the clean, pulled-together look", phrases: ["clean girl", "that girl", "clean look", "pulled together", "fresh and simple", "vanilla girl"],
    tags: ["minimal", "sleek", "refined", "comfortable"], subtypes: ["tank-top", "t-shirt", "sweater", "cardigan", "jeans", "casual-pants", "leggings", "sneakers", "low-top-sneakers", "flats", "sandals", "blazer", "tote", "earrings"],
    avoid: ["work-boots", "hiking-boots"], colors: ["white", "cream", "beige", "ivory", "black", "grey", "tan", "champagne"], words: ["ribbed", "linen", "gold", "hoop", "silk", "fine-knit"] },
  { key: "monochrome", label: "all one colour", phrases: ["monochrome", "all black", "all-black", "all white", "all-white", "tonal", "one colour", "one color", "head to toe"],
    tags: ["sleek", "minimal", "statement"], subtypes: [], avoid: [], colors: [], words: [] },
  { key: "vintage", label: "vintage", phrases: ["vintage", "retro", "thrifted", "thrift", "90s", "nineties", "80s", "eighties", "old school"],
    tags: ["vintage", "classic", "statement", "relaxed"], subtypes: ["denim-jacket", "jeans", "casual-shirt", "t-shirt", "sweater", "cardigan", "skirt", "loafers", "high-top-sneakers", "boots", "leather-jacket", "bomber-jacket"],
    avoid: [], colors: [], words: ["faded", "wash", "corduroy", "plaid", "high-waisted", "straight", "varsity", "denim", "suede"] },
  { key: "western", label: "western", phrases: ["western", "cowboy", "cowgirl", "rodeo", "country concert", "nashville", "coastal cowgirl"],
    tags: ["vintage", "utility", "statement"], subtypes: ["jeans", "casual-shirt", "skirt", "casual-dress", "boots", "ankle-boots", "work-boots", "denim-jacket", "hat", "belt"],
    avoid: ["running-shoes", "slides", "dress-pants", "hoodie"], colors: ["brown", "tan", "blue", "white", "cream", "rust", "black"], words: ["denim", "suede", "fringe", "plaid", "leather", "chambray", "pearl snap", "boot"] },
  { key: "cozy", label: "cozy", phrases: ["cozy", "cosy", "hygge", "snug", "comfy", "comfortable and warm", "sweater weather"],
    tags: ["comfortable", "relaxed", "layered", "casual"], subtypes: ["sweater", "cardigan", "hoodie", "sweatshirt", "sweatpants", "leggings", "jeans", "boots", "chelsea-boots", "work-boots", "sneakers", "puffer-jacket", "overcoat", "scarf", "beanie"],
    avoid: ["heels", "dress-shoes", "sandals", "tank-top", "shorts"], colors: [], words: ["chunky", "knit", "fleece", "wool", "cable", "flannel", "sherpa", "merino", "cashmere"] },
  { key: "power", label: "sharp, powerful tailoring", phrases: ["power suit", "power dressing", "boss", "ceo", "office siren", "corporate", "sharp", "authoritative"],
    tags: ["tailored", "structured", "sleek", "refined"], subtypes: ["dress-shirt", "blouse", "dress-pants", "skirt", "blazer", "suit-jacket", "overcoat", "oxfords", "derbies", "loafers", "heels", "briefcase", "handbag", "watch", "midi-dress"],
    avoid: ["hoodie", "sweatpants", "t-shirt", "sneakers", "running-shoes", "shorts"], colors: ["black", "navy", "charcoal", "white", "grey", "burgundy"], words: ["tailored", "pinstripe", "wool", "silk", "structured", "pleated", "trousers"] },
  { key: "normcore", label: "easy, unfussy basics", phrases: ["normcore", "basic", "basics", "nothing fancy", "plain", "dad style", "no fuss", "unfussy"],
    tags: ["casual", "classic", "comfortable", "minimal"], subtypes: ["t-shirt", "sweatshirt", "casual-shirt", "jeans", "chinos", "shorts", "sneakers", "low-top-sneakers", "running-shoes", "denim-jacket", "hat", "backpack"],
    avoid: ["heels", "formal-dress"], colors: NEUTRALS, words: ["crewneck", "straight", "plain", "solid", "cotton"] },
];

const AESTHETIC_BY_KEY = new Map(OUTFIT_AESTHETICS.map((entry) => [entry.key, entry]));
export const AESTHETIC_KEYS = OUTFIT_AESTHETICS.map((entry) => entry.key);
export const aestheticByKey = (key: unknown): OutfitAesthetic | null => (typeof key === "string" ? AESTHETIC_BY_KEY.get(key) ?? null : null);

/** The aesthetic a request names, or null: the first one mentioned, longest phrase first. */
export function readAesthetic(message: string): OutfitAesthetic | null {
  const request = ` ${String(message ?? "").toLocaleLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ")} `;
  let best: { entry: OutfitAesthetic; index: number; length: number } | null = null;
  for (const entry of OUTFIT_AESTHETICS) {
    for (const phrase of entry.phrases) {
      const index = positiveIndex(request, phrase);
      if (index < 0) continue;
      if (!best || index < best.index || (index === best.index && phrase.length > best.length)) best = { entry, index, length: phrase.length };
    }
  }
  return best?.entry ?? null;
}

/**
 * How much a piece belongs to a named look, 0–100: its garment type, its style tags, its colour,
 * and the words in its own name, material and pattern each add to it; a type the look excludes
 * takes it most of the way down. A piece with nothing in common scores low rather than zero, so a
 * small closet still gets an outfit and the reply can say how close it could come.
 */
export function aestheticFit(item: Pick<WardrobeItem, "name" | "category" | "subtype" | "customType" | "style" | "pattern" | "material" | "color">, aesthetic: OutfitAesthetic) {
  const subtype = lower(item.subtype);
  if (aesthetic.avoid?.includes(subtype)) return { score: 8, evidence: `Not part of the ${aesthetic.label} look.` };
  const tags = (item.style ?? []).map(lower);
  const words = lower(`${item.name} ${item.customType ?? ""} ${item.pattern ?? ""} ${item.material ?? ""}`);
  const color = lower(item.color);
  const reasons: string[] = [];
  let score = 25;
  if (aesthetic.subtypes.includes(subtype)) { score += 30; reasons.push("the right kind of piece"); }
  const shared = aesthetic.tags.filter((tag) => tags.includes(tag));
  if (shared.length) { score += Math.min(25, shared.length * 13); reasons.push(shared.join(" and ")); }
  if (aesthetic.colors.length && aesthetic.colors.some((entry) => color.includes(entry))) { score += 12; reasons.push(`${color} belongs in it`); }
  const named = aesthetic.words.filter((word) => words.includes(word));
  if (named.length) { score += Math.min(20, named.length * 12); reasons.push(named.slice(0, 2).join(" and ")); }
  score = Math.max(0, Math.min(100, score));
  return { score, evidence: reasons.length ? `Fits ${aesthetic.label}: ${reasons.join(", ")}.` : `Has little of the ${aesthetic.label} look.` };
}
