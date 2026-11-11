# Hanger holdout evaluation results

Scored on 2026-11-10, using fixture set `holdout-1` and tested commit [`5a9eeae8dafcef51966d000833e682d91728dc9a`](https://github.com/manof1color/racked-wardrobe-intelligence/commit/5a9eeae8dafcef51966d000833e682d91728dc9a). This report contains aggregates from [the scorer output](../data/hanger-evaluation-holdout-1-2026-11-10.json). Raw run files, answer keys, filled rater sheets and written comments remain private.

## Blind preference result

Two raters independently compared Hanger with a random valid outfit from the same closet on 24 synthetic requests across four fresh synthetic closets.

| Measure | Result |
| --- | --- |
| Answerable requests | 20 |
| Hanger wins / baseline wins / ties | 11 / 1 / 8 |
| Hanger win rate among decided requests | **11 of 12 (91.7%)** |
| 95% Wilson score interval | **64.6%–98.5%** |
| All requests, including impossible asks | 13 wins, 2 losses, 9 ties |
| Rater agreement across all 24 requests | 62.5%, Cohen's kappa 0.27 |

| Request type | Requests | Hanger wins | Baseline wins | Ties |
| --- | --- | --- | --- | --- |
| impossible | 4 | 2 | 1 | 1 |
| occasion | 8 | 6 | 0 | 2 |
| swap | 4 | 2 | 1 | 1 |
| weather | 8 | 3 | 0 | 5 |

## Checks that need no rater

| Check | Result |
| --- | --- |
| Answerable requests receiving an outfit | 20 of 20 |
| Valid outfits offered | 20 of 20 |
| Swaps changing only the requested slot | 4 of 4 |
| Agent fallbacks answered by the grounded reply | 1 of 24 turns |
| Counted Bedrock spend, including 1.5x margin | $0.22 |

## Calculation and limits

For each request, a rater's Hanger pick is 1, a tie is 0.5, and a baseline pick is 0. The request is a Hanger win when the two picks average above 0.5, a baseline win below 0.5, and a tie at 0.5. A split vote therefore counts as a tie.

The headline uses the 20 occasion, weather and swap requests. Excluding 8 tied requests leaves 12 decided requests and 11 Hanger wins. The rate is 11/12 = 91.7%. [`wilson`](../lib/hanger-evaluation.ts) computes a two-sided 95% Wilson score interval with z = 1.959964, successes = 11 and trials = 12. Its stored bounds, 0.646120 and 0.985135, round to 64.6%–98.5%. The unit is one combined request verdict.

The four impossible asks are separate from the headline. Hanger offered an outfit on two and none on two; these counts alone do not establish whether its explanation acknowledged the missing item.

The model-disabled dry run on the tested commit offered 16 valid outfits for 20 answerable requests, with 4 exact swaps. The completed Bedrock run offered 20 valid outfits for those 20 requests, also with 4 exact swaps. These are different execution modes on the same tested commit.

The original evaluation used different closets and requests and informed the fixes. Its 44.8% decided-case result and this holdout's 91.7% result are separate evaluations. Four synthetic closets and two raters provide limited evidence about real wardrobe preferences. [Method and limitations](hanger-evaluation.md).
