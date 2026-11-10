# Hanger blind evaluation

Work order W7. A way to find out, with two people who do not know which is which, whether Hanger's outfits are preferred over random ones. This page is how the owner runs it, how the raters fill the sheet, and what the result can and cannot show.

**Where it stands.** The first evaluation ran on 2026-11-10 and Hanger did not beat the random baseline: 13 of 29 decided answerable requests (44.8%, 95% CI 28.4%–62.5%), 7 tied. What was reproduced from it and what was fixed is in [hanger-evaluation-diagnosis.md](hanger-evaluation-diagnosis.md). The fixes are **not yet rated**: the next evaluation uses a fresh set of closets and requests (`holdout-1`, below), and nothing in this repository claims a preference result for them until two raters have scored it.

## What it compares

For each of **40 synthetic requests** in **4 synthetic closets** (15 to 25 pieces each, invented, no photos, nobody's real wardrobe):

- **Hanger's outfit**, from `runConsumerHangerTurn` in `lib/hanger-consumer-turn.ts`, the function the chat route itself calls: the agent with its tools (wardrobe search, outfit builder, weather) and, if the agent falls back, the grounded reply from the wardrobe. What is rated is the outfit card a person would see. (The first evaluation called the agent directly and would have recorded "no outfit" on a fallback; none occurred in that run.)
- **A baseline**: a random valid outfit from the same closet. Valid means what the outfit builder requires: a dress, or a top and a bottom, plus shoes, plus at most a piece or two of other kinds, never more than four pieces. It knows nothing about the occasion, the weather or the season. For a "swap one piece" request it is the outfit already on screen with that one piece replaced at random. It is chosen from a seed, so the same seed gives the same baseline.

Per closet, ten requests: four about an occasion, three about the weather (the forecast is supplied as data; the request never names the weather, so Hanger has to look it up), two "swap one piece", and one **impossible ask** for something the closet does not contain.

The fixtures are in [`data/hanger-eval/`](../data/hanger-eval). There are two sets, each four closets and forty requests in the same mix:

| Set | Where | Use |
| --- | --- | --- |
| `original` | `closet-a.json` to `closet-d.json` and `requests.json` | The first evaluation. The fixes were written against its failures, so a rerun on it cannot show they generalise. |
| `holdout-1` | [`holdout-1/`](../data/hanger-eval/holdout-1): `closet-e.json` to `closet-h.json` and `requests.json` | The next evaluation. New closets, new pieces, new wording, written after the fixes. **24 requests**, six a closet (two occasion, two weather, one swap, one impossible ask), so a rater can finish in one sitting. |

`replay-cases.json` in the same folder is not part of either set: it is the scripted replay of the first evaluation's losses used by the diagnosis.

## Files and who may see them

| File | Written by | Contains | Who may see it |
| --- | --- | --- | --- |
| `rater-sheet.csv` | runner | the 40 requests and two unlabeled outfits each, in shuffled A/B order | each rater (their own copy) |
| `closets.txt` | runner | the pieces in each synthetic closet | each rater |
| `key.json` | runner | which side was Hanger, per request | the owner only |
| `run.json` | runner | Hanger's replies, every tool call with its arguments, fallbacks, the fixture set, the commit tested, and the counted spend | the owner only |
| `data/hanger-evaluation-<date>.json` (`-<set>-<date>` for a named set) | scorer | aggregates only | public, in the repository |
| `hanger-evaluation-results.md` (`-<set>.md` for a named set) | scorer | aggregates and the cases Hanger lost, with each rater's pick | public, in the repository |

The first four go **outside the repository**: `../racked-hanger-eval` for the original set, `../racked-hanger-eval-<set>` for a named set, or `RACKED_HANGER_EVAL_DIR`. The runner refuses a folder inside the repository so they cannot be committed by accident. The answer key, the filled rater sheets and the raters' written comments stay private. The results page shows which outfit each rater picked and leaves their written reason out unless the scorer is run with `--publish-reasons`.

## Running it (the owner)

Run it somewhere you are signed in to AWS with Bedrock access, such as CloudShell. It needs Node 22.13 or newer and a checkout of this repository with `pnpm install` done.

The steps below produce the **next blinded rater sheets**, on the holdout set. Leave `RACKED_HANGER_EVAL_SET` out to use the original set instead.

**0. Check out the commit to test, with nothing uncommitted.** The runner records the commit in `run.json` and the results page prints it. It refuses a real run with uncommitted changes, because no commit would describe what was tested (`RACKED_EVAL_ALLOW_DIRTY=yes` overrides and records the commit as `-dirty`).

```bash
git status --short
```

```bash
git rev-parse HEAD
```

**1. Dry run.** This calls nothing, spends nothing and writes nothing. It checks the fixtures, prints the request count, the commit and a cost estimate, and runs the **dry-run check**: every request through the same turn with the model switched off, counting how many outfits are valid and how many swaps changed only the slot asked for.

```bash
RACKED_HANGER_EVAL_SET=holdout-1 node --experimental-strip-types scripts/run-hanger-evaluation.mjs
```

On the commit that added the holdout set it ends with `16 of 16 outfits offered are valid (16 of 20 answerable requests got one). 4 of 4 swaps changed only the slot asked for.` The four requests without an outfit are ones the no-model fallback does not read as asking for one; the agent normally handles those. An invalid outfit or an inexact swap here is a bug to fix before spending anything.

**2. Real run.** Only `RACKED_EVAL_CONFIRM=yes` starts it; any other value is a dry run.

```bash
RACKED_HANGER_EVAL_SET=holdout-1 RACKED_EVAL_CONFIRM=yes node --experimental-strip-types scripts/run-hanger-evaluation.mjs
```

Optional: `RACKED_EVAL_BUDGET_USD=1.00` lowers the cap, `RACKED_HANGER_EVAL_SEED=...` changes the seed, `RACKED_HANGER_EVAL_DIR=...` moves the output folder. A run file is tied to its seed, its fixture set and its commit: resuming with a different one is refused, so one sheet never mixes two versions of Hanger.

**What it spends.** Bedrock is billed per token. The runner counts every call from the tokens Bedrock reports, multiplied by 1.5 to cover price differences, and a call is sent only if its *worst case* (a full-size request and a full-length answer) would still fit under the cap. The cap is **$1.50 and cannot be raised**: a larger `RACKED_EVAL_BUDGET_USD` is ignored. A typical run is estimated at about $0.63 counted this way; the dry run prints the figure. Each call is saved to `run.json` at its worst case *before* it is sent, so if the run is interrupted, a rerun resumes from the saved total and cannot spend the same money twice. If the cap is reached, the run stops, writes no sheet, and says so; rerunning continues only while the cap allows.

It also stops if the model fails three requests in a row (an outage or a permissions problem rather than something about the requests), and forgets those three so a rerun tries them again.

It records, per run: model calls and tool calls per turn, each tool call with its arguments, how often the agent fell back and the grounded reply answered, and how often the agent wrote an outfit list itself and had to be corrected. When it finishes it prints the same two counts as the dry-run check, this time for the outfits the real run produced.

The runner writes to no Racked table, bucket or account. When all 40 requests are recorded it writes `rater-sheet.csv`, `closets.txt` and `key.json`. The baseline, the blinded A/B order and the scoring are unchanged from the first evaluation.

**3. Give the raters their copies.** Give each of the two raters `rater-sheet.csv` and `closets.txt`. Raters must not be the owner: the owner knows the system, sees the key, and may recognise Hanger's phrasing. They should also not be anyone who built Hanger, and they must not confer or see each other's sheets. Do not send `key.json` or `run.json` to anyone.

**4. Score.** When both sheets are back:

```bash
node --experimental-strip-types scripts/score-hanger-evaluation.mjs --set holdout-1 --rater-1 path/to/first.csv --rater-2 path/to/second.csv
```

It refuses to score if any choice is blank or unreadable, if a sheet does not match the key (a sheet from another run would unblind wrongly), if the run was made on a different fixture set, or if both paths are the same file. Otherwise it writes `data/hanger-evaluation-holdout-1-<date>.json` and `docs/hanger-evaluation-results-holdout-1.md`. It never writes over an existing results file unless `--overwrite` is passed, so an earlier evaluation's result is not lost. Read the results page before committing it.

## What to tell the raters

> You will see a list of requests (24 in the short set, 40 in the first). Each has two outfits, A and B, from the same closet, which you can look up in `closets.txt`. For each request, choose which outfit you would rather wear for that request, or **tie** if you cannot separate them, and write a few words saying why. Some requests include a forecast; some show what the person is wearing now and ask for one change. A few ask for something the closet does not have; judge the two outfits as shown, and write what you notice. Nothing tells you which outfit came from where and you should not try to work it out. Do not discuss your answers with anyone until you are both done.
>
> Put **A**, **B** or **tie** in the "choice" column and a short reason in the "reason" column. Save the file as CSV (UTF-8), keeping the other columns as they are. An outfit marked "(no outfit offered)" is a real answer: treat it as the outfit being missing.

## How it is scored

- Each request gets one verdict from the two raters' picks. A pick for Hanger is worth 1, a tie ½, a pick for the baseline 0; the request goes to Hanger if the average is above ½, to the baseline if it is below, and is a tie at exactly ½ (both said tie, or they split). Counting each rater's pick as its own trial would treat two opinions on one outfit pair as independent evidence and make the interval too narrow.
- **Hanger win rate** is Hanger's wins out of wins plus losses, with a 95% Wilson score interval. Ties are left out of the rate and shown beside it.
- The **headline** covers the 36 occasion, weather and swap requests. The four **impossible asks** are reported separately: the right answer to "I need a tuxedo" from a closet with none is to say so, and an honest "I don't have that" cannot beat an outfit on outfit quality. The results page shows whether Hanger offered an outfit anyway; read its replies in `run.json` to judge whether it was honest about it. The win rate over all 40 is shown too.
- **Agreement** is Cohen's kappa between the two raters over Hanger, baseline and tie, with raw agreement beside it. With 40 requests and two raters, kappa is itself uncertain.
- **Where Hanger lost**: every request that went to the baseline, with both outfits, Hanger's reply and each rater's reason.
- **Tool use**: tool calls and model calls per turn, fallback rate by cause, outfit-list corrections, and the counted spend.
- **Checks that need no rater**, reported in their own section and never mixed into the preference result: **outfit validity** (of the outfits Hanger offered, how many are a dress or a top and a bottom, with shoes, in at most four pieces) and **swap accuracy** (of the swap requests, how many changed the one slot asked for and kept every other piece). A valid outfit can still be one nobody prefers; these say the outfit is wearable and the instruction was followed, nothing more.

## What it can and cannot prove

It can show that, on these 40 invented requests, two blind raters preferred Hanger's outfit to a random valid one at the rate the interval gives; how often the agent used its tools, fell back, or needed correcting; and exactly which cases it lost.

It cannot prove:

- **That Hanger is as good as a human stylist, or better than a simple rule.** A random valid outfit is a low bar. Beating it says outfits are not arbitrary; it does not say they are good.
- **That the language model is what helped.** Hanger's outfits come from the same deterministic ranker the grounded fallback uses; the agent chooses when to call it and with what. This measures the whole system, not the model alone. Showing the model's contribution would need a ranker-only baseline too.
- **Much, from a short set.** The holdout set has 20 answerable requests. If all 20 are decided, Hanger needs 15 or more for the interval to clear 50%; every tie makes that harder. A result near half says nothing either way, and is a reason to rate more requests, not a verdict.
- **That a second evaluation is comparable to the first.** The holdout set has different closets and requests, and the first set's failures were what the fixes were written against. A higher win rate on the holdout is evidence the fixes generalise; it is not a before-and-after measurement on the same items.
- **How it behaves for real people.** Four invented closets and forty requests are small, the interval will be wide (about ±16 percentage points if 36 requests are decided, and wider for every tie), and no real customer, photo, body, budget or taste is involved.
- **Anything about the quality of Hanger's wording**, which raters never see, or its honesty on impossible asks, which needs a human to read the replies.
- **Repeatability.** The model is sampled, so a rerun can differ even with the same seed. The seed fixes the baselines and the A/B order, not Hanger.
- **Anything about sales, retention, purchase intent, or fit.** None of that is measured.

Two raters' taste is also only two people's taste: a different pair could rate differently, and the kappa shows how far these two agreed.
