# Hanger blind evaluation: diagnosis and fixes

The first blind evaluation ran on 2026-11-10: four synthetic closets, 40 requests, two independent raters ([method](hanger-evaluation.md)). Hanger did not beat a random valid outfit. Of the 36 answerable requests it was preferred on 13, the baseline on 16, and 7 were tied: 44.8% of decided cases (95% CI 28.4%–62.5%). Occasion requests went 4 wins, 8 losses, 4 ties.

This page records what was reproduced, why each failure happened, what changed, and what the next evaluation needs. It claims no improvement in preference: **that is still unmeasured, and stays unmeasured until two people rate a new blinded sheet.** What is measured here is mechanical: whether an outfit is complete, whether a swap changed only the slot asked for, and whether the reply, the card and the saved outfit agree.

The rater sheets, the answer key, the run file and the raters' written comments from the first evaluation are private and are not in this repository.

## How the failures were reproduced

Evaluated commit: `4bf90aaddd193178df0d1465d791072d44484bcb` (`main` on 2026-11-10).

The run file never recorded what the model asked its tools for, so the tool calls could not be read back. They were **reconstructed**: for each lost request, the tool arguments in [`data/hanger-eval/replay-cases.json`](../data/hanger-eval/replay-cases.json) are ones that, replayed against the evaluated commit, produce the outfit card the results page showed. For the four occasion requests and the long-walk request the replay matches the published reply outfit for outfit; for the others it matches the card. They are a repeatable stand-in for the model, not a transcript of it. From the next run on, every tool call and its arguments are saved in the private run file, so this guessing is not needed again.

Each case was replayed two ways with that scripted model:

- **Benchmark path**: `runHangerAgent` called directly with empty ranking settings, as the runner called it.
- **Normal route**: `POST /api/agents/consumer` on a local production build, signed in as a synthetic consumer whose closet is the synthetic fixture, with DynamoDB replaced by a local emulator and Bedrock by a scripted local stand-in ([`scripts/security-harness/hanger-replay.mjs`](../scripts/security-harness/hanger-replay.mjs)). This is the route, store and agent loop a person uses. Nothing in it can reach AWS and it costs nothing.

| Request | What went wrong | Benchmark path, before | Normal route, before | Both, after |
| --- | --- | --- | --- | --- |
| a-01 to a-04: client presentation, dinner with partner's parents, black-tie-optional wedding, casual Friday | The same lead outfit for all four | Reproduced | Reproduced | Four different lead outfits |
| b-06: a long walk in cold rain | Card had a shirt and a jacket, no bottoms or shoes | Reproduced (two different argument shapes) | Reproduced | Complete outfit |
| a-08: swap the shoes for something more casual | "You don't own any casual shoes"; the closet has white leather sneakers | Reproduced | Reproduced | Oxfords replaced by the sneakers, rest kept |
| a-09: change the top, keep everything else | No replacement offered | Reproduced | Reproduced | Top replaced, rest kept |
| c-09: swap the skirt for pants | Swapped, and added a blazer nobody asked for | Reproduced | Reproduced | Skirt replaced by pants, nothing added |
| c-08: make this dressier, swap the shoes | "You don't have any dressier shoes"; the closet has pumps and flats | Reproduced | Reproduced | Sandals replaced by the pumps |
| c-07: a cool evening out | A dress with a blouse added to it | Reproduced | Reproduced | Dress, shoes, earrings |
| c-05: sightseeing at 35 °C | Led with a satin formal dress and block heels | Reproduced | Reproduced | Tee, jeans, canvas sneakers, tote |
| d-01: a morning run, then breakfast | The reply described a run outfit; the only card was the breakfast outfit | Reproduced | Reproduced | A card for each, the run first, with running shoes |

**All 13 replayed cases failed a check on both paths at the evaluated commit, and none fails on either path after the fixes.** No reproduced failure was specific to the benchmark: each was a defect a person using the app could meet.

One observation narrows the swap failures. On the evaluated commit, with the model unreachable, the route answered all four swap requests correctly from its grounded fallback. The deterministic turn planner already knew how to keep the rest of an outfit and change one piece. The defect was that the agent path never consulted it.

## Root causes and what changed

### Occasion matching: the same outfit for four occasions

The ranker knew six occasions (work, formal, evening, casual, active, travel), each allowing a wide band of the five-step formality ladder. A client presentation, a smart-but-not-stiff dinner, a black-tie-optional wedding and casual Friday all read as "smart casual to formal". Every piece in that band was equally right, so rotation (how little and how long ago a piece was worn) decided, and it picked the same least-worn blouse, skirt and boots each time. Requests that named no occasion the list knew, such as sightseeing or a long walk, were dressed by rotation alone, which is how a never-worn formal dress led for a day of sightseeing.

Three more things lost information on the way in. The first matching keyword won ("casual Friday at the office" was just "office"). The model wrote its own description of the request and the ranker read that instead of the person's words. And weather was judged from the season tag alone: an all-season rain shell lost to a winter puffer in the rain, and a "summer" blazer was added at 35 °C.

What changed, in [`lib/occasion-knowledge.ts`](../lib/occasion-knowledge.ts), [`lib/garment-knowledge.ts`](../lib/garment-knowledge.ts) and [`lib/outfit-ranking.ts`](../lib/outfit-ranking.ts):

- **Briefs.** A request is read for the dress code or activity it names: 37 of them, from black tie to a day at home. Each has a target on the formality ladder and, for an activity, the kinds of piece it needs or rules out (running shoes for a run; no heels for a long walk; no briefcase at dinner). A stated dress code outranks an event, an event outranks a general setting, and among equals the first thing mentioned leads ("gym first, then coffee" is dressed for the gym). Words like "casual" or "fancy" move an event half a step rather than replacing it. Everyday phrases are not occasions: "running errands" is not a run.
- **Named looks.** 20 aesthetics people ask for by name (streetwear, quiet luxury, dark academia, coastal, gorpcore and others), each described by the garment types, style tags, colours and materials it is made of, so a look can be matched even on pieces with no style tags.
- **Scoring.** With a brief named, a full step on the formality ladder now outweighs anything rotation can say; rotation still chooses among pieces that suit equally. For an activity the right kind of piece is right whatever its formality. Known weather rules a piece out instead of merely counting against it, a rain jacket is what a wet day calls for, and a coat or scarf is added for weather that needs it, not because there was room. With no occasion named, occasionwear and gym kit wait for a request that calls for them.
- **The person's words first.** The occasion, the look and the weather are read from the person's message. The model's reading fills in only what they did not say, chosen from the curated lists and checked on the server.

This is a curated dataset, not a trained model. Every entry can be read, argued with and tested; the same request always gets the same reading; nothing was learned from anyone's photos or scraped from a site; and it cost nothing to build or run. It describes clothes and occasions, never a body, gender, age or budget.

### Complete outfits: a card with no bottoms or shoes

The model's `include` list was treated as if the person had asked for those pieces. Three jackets filled three of the four slots, the set builder then dropped the duplicates, and what was left was a jacket and a shirt. A second route to the same card: the ranker parsed the model's own description for a piece count, so "two pieces" in the model's words shrank the outfit.

Now pieces the model proposes are suggestions. They take the slot they belong to, and anything beyond that waits until the outfit has a top and bottom (or a dress) and shoes. What is left out is reported to the model and shown in the reply's evidence. Named pieces, piece counts and exclusions are read from the person's message only. A partial outfit the person asked for ("just two pieces") is still honoured, and when a closet cannot complete an outfit (no shoes owned) the builder says which slot is missing and why, to the model and to the person.

### Swaps: "you don't own any casual shoes"

`search_wardrobe` matched its text against piece names. "Casual" appears in no shoe's name, so the search returned nothing and the model reported that nothing existed. A plural category ("tops") also returned nothing. And nothing made a swap a swap: whether the other pieces were kept depended on the model listing them itself, and the builder topped the result back up to four pieces.

Now, in [`lib/hanger-agent.ts`](../lib/hanger-agent.ts) and [`lib/hanger-turn.ts`](../lib/hanger-turn.ts):

- The turn planner resolves the swap against the outfit on screen before the builder runs. Every other piece is kept, the outfit keeps its size, and the new piece comes from owned pieces of the kind asked for ("for pants" means trousers, not shorts) and in the direction asked for (more casual, dressier, warmer, lighter). With no direction given, the new piece is matched to what stays: a warmer top for leggings and running shoes is a quarter-zip, not a merino sweater.
- The model's arguments cannot override that. It may propose which piece takes the slot; it cannot move, drop or add anything else.
- Search treats casual, dressy, warm, light, waterproof and sporty as what a piece is like, accepts plural categories, and when nothing matches in a category it lists what is owned there with an instruction to read it before saying there is none.
- If the turn is about to end without the swap that was asked for, the agent is told what the person owns for that slot and asked once to make it. If it still declines, the turn falls back to the grounded reply, which makes the swap.
- When the closet cannot make the swap (one pair of shoes; no trousers at all), the reply says exactly that and the outfit is left unchanged.

### The reply, the card and the saved outfit

The card showed only the last set of outfits built in a turn. A reply that described the first set was describing outfits the person could not see or save. Now every outfit built in a turn is shown, grouped by what it was built for, and a reply that still describes an outfit on no card is corrected once and then replaced by the grounded reply. The card, the Save action and the stored "outfit on screen" are checked to be the same list of pieces in every replayed case.

## Where the benchmark differed from the app

These are differences in the measuring tool, kept apart from the product fixes above. None of them explains a reproduced failure, and none changes the published first result.

| Difference | Effect on the first evaluation | Now |
| --- | --- | --- |
| The runner called the agent directly and recorded "no outfit" on a fallback; the app answers a fallback from the wardrobe | None on the numbers: 0 of 40 turns fell back | The runner calls [`lib/hanger-consumer-turn.ts`](../lib/hanger-consumer-turn.ts), the same function the route calls, and rates the outfit a person would see |
| Swap requests gave the agent an outfit "on screen" with no conversation or remembered suggestions behind it, a state the app cannot be in | The same failures reproduce through the real route, so it did not cause them | Swaps start from a stored conversation, as in the app |
| The benchmark turned a forecast into "wet", "cold" or "warm" with its own thresholds | One request of 12 differed: tropical downpours at 29 °C were dressed as "wet" in the benchmark and would be "warm" in the app | The benchmark uses the route's own function |
| Tool arguments were not recorded | Diagnosis needed reconstruction | Saved in the private run file |

A separate product fix came out of the same comparison: a forecast of snow at −8 °C read as "wet" in both the benchmark and the app. Freezing is now decided before rain.

## What is verified, and what is not

Verified, with no model call and no spending:

- The 13 replayed cases: 13 failed on both paths before, 0 fail on either after. Run on a local production build with the scripted model.
- [`tests/hanger-blind-eval-regressions.test.ts`](../tests/hanger-blind-eval-regressions.test.ts): each reproduced defect, and beside it a case the fix could have broken (a partial outfit the person asked for; two tops the person named; a swap question that is not a swap; "remove the shoes"; a closet with one pair of shoes).
- The dry-run check, which runs every request through the turn with the model switched off. Original set: 36 of 36 answerable requests got a valid outfit and 8 of 8 swaps changed only the slot asked for. Holdout set: 31 of 31 outfits offered are valid, 8 of 8 swaps exact; 5 requests were not read as asking for an outfit by the no-model fallback, which the agent would normally handle.

Not verified:

- **Preference.** Whether people now prefer Hanger's outfits to random ones. Pending the next blind rating.
- **The real model.** No Bedrock call was made for this work. How Nova Pro uses the new `occasion` and `look` arguments, and how often it needs the swap correction, is unknown until an authorized run. The guarantees above hold for a model that ignores them, because the scripted model in the replay repeats its original mistake when corrected.
- **The reconstruction.** The replayed tool calls reproduce the published cards; they are still inferences.

## Limits that remain

- Rotation still breaks ties, so a small closet can lead two different occasions with some of the same pieces. In the replay the presentation and the dinner share a skirt and boots, which suits both.
- Without a location Hanger does not know the season. A request with no forecast and no weather words can still be answered with winter pieces in June.
- The briefs and looks are 57 entries. A request in words none of them contains falls back to the general reading, unless the model maps it to the closest entry.
- Outfits are scored piece by piece. Colour and silhouette across an outfit are not judged.
- One holdout swap was wrong on first contact with the dry-run check ("change the pullover" was not recognised as the top). The fix is general: a word from a piece on screen points at that piece's slot. It is disclosed here because it was found on the holdout set. No other code was changed in response to holdout requests, and the five holdout requests the no-model fallback does not read were left as they are.
