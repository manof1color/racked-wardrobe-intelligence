# Work order — garment recognition quality

**Status:** ready to hand to an implementing agent
**Opened:** 2026-09-02
**Last checked against `main`:** 2026-09-03, commit `161d773`
**Owner:** unassigned

---

## Why this exists

A Consumer photographed a single pair of khaki shorts, alone, well lit, high contrast, on a
plain rug. Racked answered *"No distinct clothing pieces were detected."*

[#97](https://github.com/manof1color/racked-wardrobe-intelligence/pull/97) fixed the
proximate cause — the parser accepted exactly one bounding-box convention and silently
discarded the whole detection when it got any other, so six of the seven formats vision
models actually emit were being thrown away even when the garment was correctly identified.
A garment the model names can no longer be dropped, and a failed detection now becomes an
editable "needs your label" candidate instead of a dead end.

That removed a class of false negatives. **It did not raise recognition accuracy, and
nobody knows what that accuracy is.**

### The actual blocker

`docs/evaluation.md` documents a complete evaluation protocol against a 31,638-garment
CC BY 4.0 corpus. Since #99 both halves of the harness exist: `pnpm eval:run` produces
predictions and `pnpm eval:score` scores them.

**Neither has been run against the corpus. There is no measured recognition number anywhere
in this repository.**

One thing to know before starting: `scripts/run-garment-evaluation.mjs` calls
`analyzeGarmentImages`, which is the **three-view single-garment path**. It does not
exercise `detectGarmentsInLook`, the whole-look path where the reported failure actually
happened. RC1 therefore has to measure both, and the detection-rate metric needs a runner
that does not exist yet.

Every proposal below is guesswork until that changes. RC1 is therefore blocking: do not
start RC3–RC5 before it produces a number.

---

## Guardrails — non-negotiable

These hold for every task. A task that cannot be done without breaking one of these should
come back unimplemented with an explanation.

1. **Registry-only verification.** Verified product identity comes exclusively from a GTIN
   or brand-plus-SKU registry match. No improvement to recognition may let AI-read text,
   typed text, or model confidence create or upgrade a verified link. Guarded by
   `tests/brand-autofill.test.ts` — do not weaken it.
2. **No person inference.** No prompt or model may infer or describe people, bodies, age,
   gender, ethnicity, income, or ownership.
3. **Privacy boundaries unchanged.** Consent gating, `k ≥ 25` suppression, the
   product-enumeration budget, public-field allowlisting, and per-account scoping stay
   exactly as they are.
4. **No PII in logs or evaluation artifacts.** Log error names, counts and durations. Never
   image bytes, signed URLs, S3 keys, account identifiers, or email addresses.
5. **Never silently discard a garment.** The #97 principle. A recognized garment that
   cannot be classified must reach the person as an editable candidate. A wrong category is
   one tap to fix; a deleted item is unrecoverable.
6. **No unbounded spend.** Every task that adds model calls must state calls-per-photo
   before and after, and stay inside the existing rate limits. Anything that raises
   per-photo cost needs explicit sign-off in the PR description.
7. **Honest claims only.** No accuracy figure enters the README, the checklist, or any
   judge-facing document unless it came from a scored run with its sample size and method
   stated alongside it.
8. **The full gate passes.** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
   `pnpm audit:prod`. Report the real output. Every new guard must be shown non-vacuous by
   reintroducing the defect it covers and observing the failure.

---

## RC1 — Produce the first measured baseline · **BLOCKING**

**Goal.** One committed report containing Racked's real recognition accuracy.

**Why.** Nothing downstream can be evaluated without it. "Recognition feels bad" is not a
number, and neither is "recognition feels better".

**Do.**

1. Follow `docs/evaluation.md`. Download the corpus outside the repository; do not commit
   photographs.
2. Take a deterministic, stratified sample — at least 200 garments, spread across every
   category in `GARMENT_TAXONOMY`, seeded so the selection is reproducible.
3. Run the three-view path with `pnpm eval:run <manifest> <predictions> <n>`, unchanged,
   against the current default `amazon.nova-lite-v1:0`.
4. Score with `pnpm eval:score <manifest> <predictions> <report>`.
5. **Add a second runner for the whole-look path.** `eval:run` covers
   `analyzeGarmentImages` only; detection rate — the metric the reported bug lives in —
   needs `detectGarmentsInLook` driven over the same sample. Report it separately, since a
   whole-look scan and a three-view upload are different tasks with different failure modes.

**Report, broken out separately.**

- Category accuracy (top-1)
- Subtype accuracy (top-1, and top-1-within-correct-category)
- Detection rate — the share of images yielding at least one garment. **This is the metric
  the reported bug lives in.**
- Provider failure rate and mean latency
- Any AI-only identity violation (must be zero)

**Deliverables.** `docs/evaluation-baseline.md` with the numbers, sample size, seed, model
ID, and date, reported separately for the three-view and whole-look paths. The manifest, not
the images.

**Done when** a reader can state today's category accuracy and detection rate from the repo
alone.

---

## RC2 — A real-phone regression set

**Goal.** Measure the case people actually use.

**Why.** The 31,638-garment corpus is second-hand-retail photography: consistent framing,
controlled lighting. The reported failure was a phone photo of folded shorts on a rug.
Those are different problems, and only one of them is currently measurable.

**Do.**

1. Collect 40–60 real phone photographs spanning the conditions that break things: folded
   and creased garments, patterned backdrops, carpet and bedding, uneven single-window
   light, garments running off the frame, low contrast between garment and ground, and
   multi-piece flat lays. **Include the khaki shorts photo that prompted this work order.**
2. Hand-label ground truth: category, subtype, colour family, and expected garment count.
3. Commit the manifest and labels. **Do not commit the photographs** — store them outside
   the repo, referenced by hash, exactly as the existing corpus is handled.
4. Extend `pnpm eval:score` to run this set and report it as a separate cohort.

**Deliverables.** `docs/evaluation-real-photos.md`, a committed manifest, and a second set
of numbers next to RC1's.

**Done when** both cohorts are reported side by side and the gap between studio and phone
conditions is visible.

---

## RC3 — Choose the model on evidence

**Goal.** Decide whether `amazon.nova-lite-v1:0` is the right default, using data.

**Why.** Nova Lite is the cheapest Nova tier and is comparatively weak at spatial
grounding, which is exactly what whole-look detection asks of it. It may be the wrong tool.
It may be fine. Nobody has checked.

**Do.**

1. Run RC1 and RC2 unchanged against at least: `amazon.nova-lite-v1:0`,
   `amazon.nova-pro-v1:0`, and one Claude vision model available in the account's region.
2. Use `AI_LOOK_DETECTION_MODEL` — added in #97 — so detection can be changed without
   touching single-garment analysis or the Hanger agents.
3. Report accuracy **and** cost per image **and** p50/p95 latency for each.

**Note.** The Amplify compute role already permits `arn:aws:bedrock:*::foundation-model/amazon.nova-*`,
so any Nova tier needs no infrastructure change. A Claude model **does** need
`infra/template.yaml` updated and the change set reviewed before it will work.

**Deliverables.** A comparison table in `docs/evaluation-baseline.md` and a recommendation
with its cost consequence stated in dollars per 1,000 photos.

**Done when** the default model is a decision with evidence behind it.

---

## RC4 — Split detection from classification

**Goal.** Stop asking one call to do a hard job and an easy job simultaneously.

**Why.** `detectGarmentsInLook` currently asks the model to locate every garment, classify
each one, read brand text, and emit bounding boxes — in a single response, on a full scene.
Classifying a garment is much easier on a tight crop of that garment than on a cluttered
photograph, and Racked already produces those tight crops: `isolateGarment` in
`lib/garment-isolation.ts` reaches 85% mean IoU on the committed benchmark.

**Do.**

1. **Pass 1 — locate.** A minimal prompt: how many wearable units, and where. No
   classification, no brand reading, no material.
2. Crop each unit with the existing pipeline.
3. **Pass 2 — classify.** Send each crop to `classifyGarmentImage`, which already exists in
   `lib/garment-analysis.ts` and already returns controlled taxonomy plus alternatives.
4. Batch pass 2 the way the route already batches cutouts — four at a time — so a 16-piece
   look stays responsive.
5. Keep every existing fallback. A pass-2 failure must leave the piece as an editable
   candidate from pass 1, never remove it.

**Cost.** This changes 1 call per photo into 1 + N. **Measure it, state it in the PR, and
gate it behind a flag if per-photo cost rises materially.** For the common single-garment
case it is 2 calls, and RC1's detection-rate metric should show whether that buys anything.

**Done when** RC1 and RC2 both re-run, and the two-pass path either beats the one-pass path
on subtype accuracy or is abandoned with the numbers recorded.

---

## RC5 — Retry once when detection comes back empty

**Goal.** Convert the remaining false negatives into successes cheaply.

**Why.** After #97 an empty result is a genuine "the model saw nothing", not a parsing
artifact. The detection prompt is long and heavily constrained — footwear pair rules,
coverage passes, taxonomy, an eleven-field schema. A long prompt can suppress a simple
answer to a simple photo.

**Do.**

1. When pass 1 returns zero garments, retry **once** with a deliberately minimal prompt —
   roughly: *"List the clothing, footwear and accessory items visible in this photo. Return
   JSON `{"garments":[{"name":…,"category":…}]}`. Bounding boxes are optional."*
2. Bounds are already optional as of #97, so a nameless-box answer still produces a usable
   candidate.
3. Hard-limit to one retry. Count it against the existing `lookDetect` rate limit.
4. Record which pass produced the result so RC1 can report how often the retry rescues a
   photo.

**Done when** RC2's real-photo cohort shows a measured change in detection rate, and the
retry frequency is reported.

---

## RC6 — Let low confidence look like low confidence

**Goal.** Stop presenting a weak guess with the same visual weight as a strong one.

**Why.** A detection card currently shows a confidence percentage and otherwise looks
identical whether it is 92% or 31%. People accept prefilled values that look confident. The
"needs your label" state added in #97 exists only for total failure, not for a poor guess.

**Do.**

1. Pick a threshold from RC1's data — the confidence below which the model's category is
   wrong more often than right. **Derive it, do not invent it.**
2. Below that threshold, the card leads with the category selector rather than the AI's
   answer, and says plainly that the guess is uncertain.
3. Where `cleanHypothesis` returned alternatives, offer them as one-tap choices instead of
   making the person open a dropdown.
4. No change to what is saved — this is presentation only.

**Done when** the threshold is justified by a number from RC1 and a test covers the
low-confidence rendering.

---

## RC7 — Make recognition failures visible

**Goal.** Stop finding out about recognition failures from a frustrated message.

**Why.** This work order exists because one person reported one photo. There is currently
no way to know whether that was rare or routine.

**Do.**

1. Log per detection request, with **no PII**: garment count returned, whether the retry
   fired, min/median confidence, which crop method won (`ai-segmentation` / `silhouette` /
   `edge-fallback` / `none`), whether any box fell back to the whole frame, and duration.
2. No image bytes, no S3 keys, no account identifiers, no prompt or response text.
3. Document the fields in `docs/architecture.md`.

**Done when** the share of scans returning zero garments can be answered from logs.

---

## RC8 — Evaluate a self-hosted detector against Bedrock · **AFTER RC1**

**Goal.** Decide, on measured evidence, whether Racked should keep calling a foundation
model for whole-look detection or run its own detector.

**Why this is worth asking.** Racked currently pays Amazon Bedrock per scan for a task —
"find the garments in this photo" — that purpose-built open-source detectors do in a few
milliseconds on CPU. A self-hosted detector would make the marginal cost of a wardrobe scan
**zero**, remove a network round trip from the intake path, and turn the AI story from
"we call an API" into "we evaluated and deployed a model". None of that is a reason to do
it before there is a baseline to beat.

### Candidates, with the licence checked

| Project | Licence | What it is | Fit |
| --- | --- | --- | --- |
| [DEIM](https://github.com/Intellindust-AI-Lab/DEIM) | Apache 2.0 | DETR-based real-time detector. Nano is 4M params at ~2.1 ms; ONNX and TensorRT export included | **Best runtime fit.** Needs fine-tuning — see below |
| [Grounding DINO](https://github.com/IDEA-Research/GroundingDINO) | Apache 2.0 | Open-vocabulary detection from a text prompt — ask it for "shorts" with no training | **Best accuracy-per-effort.** Far larger; needs a container, not in-process |
| [segformer_b*_clothes](https://huggingface.co/mattmdjaga/segformer_b2_clothes) | see model card | Clothes segmentation, ONNX available, trained on ATR | Poor fit: it parses clothing **on a person**, and Racked's photos are flat lays |
| Ultralytics YOLO and anything built on it | **AGPL-3.0** | The base of most clothing-detection repos on GitHub | **Blocked.** AGPL covers models the training code produces; a network service must publish its whole source or buy an Enterprise licence |

### The catch that decides the work

**DEIM's released checkpoints are trained on COCO2017 — the 80 COCO classes.** COCO
contains `person`, `handbag`, `tie`, `suitcase`. It does **not** contain shirt, trousers,
shorts, dress, or shoes. Out of the box DEIM would detect almost nothing Racked cares
about. Using it means fine-tuning on a fashion dataset in COCO format.

**Two fashion datasets, and only one of them is usable here:**

- **[DeepFashion2](https://github.com/switchablenorms/DeepFashion2)** — 491K images, and the
  larger of the two. **Licensed for non-commercial research only.** Racked publishes a
  pricing page and a business model, so fine-tuning on it would be a licence violation.
  **Do not use it.**
- **[Fashionpedia](https://github.com/cvdfoundation/fashionpedia)** — 48K images, 27 apparel
  categories, already COCO-format, **CC BY 4.0**, commercial use permitted with
  attribution. This is the one to use, and Racked already has the pattern for handling a
  CC BY 4.0 corpus correctly in `docs/dataset-provenance.md`.

### A privacy tension to resolve before any of this ships

Every COCO-pretrained detector carries `person` as a class, and open-vocabulary models will
answer a person-shaped prompt. Racked's stated boundary is that no model may infer or
describe people. A self-hosted detector must therefore **drop the `person` class at the
label-mapping layer**, not merely decline to display it, and a test must assert that no
person-class detection can reach a wardrobe record. Fine-tuning on Fashionpedia's apparel
categories alone satisfies this by construction, which is a further argument for it.

### Where it would run

Racked's compute is AWS Amplify — a Node runtime. PyTorch cannot run there, so the model
must be exported to ONNX and executed by `onnxruntime-node`, or moved behind its own
service.

| Approach | Fits? | Ongoing cost |
| --- | --- | --- |
| ONNX in-process on the existing Amplify Node runtime | DEIM Nano (~4M params) plausibly yes; verify against the deployed bundle limit | **None** |
| Lambda container, invoked from the API route | Yes — a container image lifts the 250 MB package ceiling | Per-invocation only |
| SageMaker real-time endpoint | Yes | **Always-on hourly billing — do not choose this for a demo** |

**Do.**

1. **Do not fine-tune anything yet.** First run RC1's whole-look runner against the same
   sample using a stock detector as a control. The question to answer is narrow: *is the
   detector the weak link at all, or is Bedrock already good enough?*
2. If — and only if — RC1 shows detection rate is the bottleneck, fine-tune DEIM Nano on
   Fashionpedia mapped to `GARMENT_TAXONOMY`, export to ONNX, and score it on the **same**
   RC1 and RC2 cohorts so the numbers are comparable.
3. Report accuracy, p50/p95 latency, bundle size, and cost per 1,000 scans against the
   Bedrock baseline. Record the Fashionpedia CC BY 4.0 attribution in
   `docs/dataset-provenance.md`.
4. Keep Bedrock as the configured fallback. A self-hosted model that fails must degrade to
   the existing path, not to a dead end.

**Do not** train on the second-hand evaluation corpus or on DeepFashion2. The first would
contaminate the held-out benchmark; the second is a licence violation.

**Done when** a table compares self-hosted against Bedrock on accuracy, latency and cost
over identical cohorts — and the decision is made from that table rather than from the
appeal of running one's own model.

---

## Why most clothing-detection repositories do not fit Racked

Searched before writing RC8 and RC9. GitHub has many clothing-detection projects; almost
none survive contact with Racked's constraints, and it is worth recording why so the same
ground is not covered again.

**Three filters, applied in order.**

**1. The code licence.** Most clothing detectors are built on Ultralytics YOLO, which is
**AGPL-3.0** — and Ultralytics extends that to the models the training code produces. For a
network service the AGPL obligation is to publish the complete corresponding source of the
whole application, or to buy an Enterprise licence. [simaiden/Clothing-Detection](https://github.com/simaiden/Clothing-Detection)
is GPL-3.0. Racked currently has **no `LICENSE` file at all**, which means this is a live
decision rather than a settled one, and adding copyleft code would make it for us.

**2. The dataset licence.** The two largest fashion datasets are unusable commercially:
**DeepFashion2** is non-commercial research only, and **ModaNet** is a research release with
no permissive grant found. **Fashionpedia** is the exception at CC BY 4.0.

**3. The domain — this is the one that actually matters.** DeepFashion2 is shop and street
photography. ModaNet is street fashion. ATR, which the SegFormer clothes models use, is a
*human-parsing* dataset. Fashionpedia is everyday and celebrity event photographs. **Every
one of them is people wearing clothes.**

Racked's photographs are flat lays — a garment on a bed, a rug, a floor, photographed from
above. A detector trained on worn clothing has never seen a folded pair of shorts on a rug,
which is exactly the photograph that produced the report behind this work order. There is
no large public flat-lay garment-detection corpus. Two consequences follow:

- Fine-tuning on a person-centric dataset may make flat-lay recognition **worse**, not
  better, and any such attempt must be measured on RC2's real-phone cohort before it is
  believed.
- Racked's own confirmed detections — every piece a person corrected and saved — are
  training data nobody else has, in a domain nobody else covers. That is worth treating as
  an asset, under the consent terms people actually agreed to and not before.

A general foundation model is currently doing well here for an unglamorous reason: it was
trained on everything, so a flat lay is not out of distribution for it.

---

## RC9 — Replace the hand-written isolation pass with a promptable segmenter · **PARTLY DONE**

> **Progress, 2026-09-03.** The seam is built and the deterministic pass was improved while
> building it. `lib/garment-segmenter.ts` registers backends and `lib/look-scan-resilience.ts`
> now calls through it, so MobileSAM can be registered without touching the intake route.
> The backdrop is modelled as clustered colours rather than one median, taking the benchmark
> from **85% to 86% mean IoU** overall and **68% to 72%** on the hard scenes, with the
> garment-off-the-frame scene recovering from outright failure to 99%. MobileSAM itself is
> **not** wired in: its weights ship as a PyTorch checkpoint and converting them needs a
> toolchain this repository should not acquire mid-competition. The export recipe and the
> backend contract are in [`docs/segmentation-backends.md`](segmentation-backends.md).
> **Remaining:** export the weights, add a fourth benchmark column, register the backend
> only if it beats 86% / 12-14.

**Goal.** Decide whether [MobileSAM](https://github.com/ChaoningZhang/MobileSAM) crops
garments better than the deterministic silhouette pass, on the benchmark that already
exists.

**Why this one is different from RC8.** RC8 asks a hard question — can an open model
*identify* garments — that runs into all three filters above. RC9 asks a much easier one:
can an open model *cut a garment out of a photo*. Segmentation is class-agnostic, so it
sidesteps every filter at once:

- **Apache 2.0**, so no copyleft obligation.
- **No training**, so no dataset licence question.
- **It does not know or care what the object is**, so it cannot infer a person, and no
  `person` class exists to strip.
- Roughly **9.66M parameters** with official ONNX export, so it fits the same in-process
  Node path RC8 describes.
- It takes a **box prompt** — and Racked already has a box, from whole-look detection.

**And it is immediately measurable.** `scripts/crop-benchmark.ts` already scores crop
quality by intersection-over-union against known garment rectangles across 14 seeded scenes.
The silhouette pass now scores **86% mean IoU, 12/14 usable**, its two remaining failures
being a strongly patterned backdrop and a garment whose colour nearly matches the surface
beneath it. Both fail for one reason — colour similarity is the only signal available, and
shape is what a learned segmenter adds. RC9 had a baseline to beat on day one, which is
exactly what RC1 still has to go and create for recognition.

**Do.**

1. Add MobileSAM as a third method in `scripts/crop-benchmark.ts`, alongside `trim` and
   `isolate`, prompted with each scene's known box.
2. Score it on the same 14 scenes. Report mean IoU and usable count against the 85% / 12-14
   baseline, plus latency and ONNX size.
3. Only if it wins, wire it into `prepareResilientLookDisplay` **ahead of** `isolateGarment`
   and keep both existing passes as fallbacks. The chain must still degrade to the ordinary
   bounded crop.
4. Confirm the ONNX bundle fits the deployed Amplify package before claiming it ships.

**Guardrail.** Whole-look intake is currently one remote call by deliberate design — #100
removed a per-piece fan-out that could turn one crowded-rack scan into sixteen extra
provider waits. If MobileSAM runs in-process this is not a fan-out and the design holds; if
it needs a network call per piece, **it does not ship on the synchronous path**, whatever
its IoU.

**Done when** the benchmark table has a third column and the decision follows from it.

---

## Sequencing

```
RC1 ──┬── RC3 ── RC4 ──┐
      │                ├── re-run RC1 + RC2 to confirm the change
RC2 ──┴── RC5 ─────────┘

RC6 depends on RC1's confidence data.
RC7 is independent and can start immediately.
RC8 depends on RC1's whole-look numbers: it asks whether to replace the detector,
which cannot be answered before the current detector has been measured.
RC9 is independent: crop quality already has a committed baseline to beat.
```

**Start with RC1 and RC7.** RC1 unblocks the rest; RC7 is independent and stops the next
failure being anecdotal.

---

## Out of scope

- Fine-tuning or training a model on the evaluation corpus. `docs/evaluation.md` is explicit
  that this corpus is a held-out benchmark; training on it would contaminate the measurement
  and make the competition claim false.
- **Fine-tuning on DeepFashion2.** It is licensed for non-commercial research only, and
  Racked publishes a pricing page. Fashionpedia (CC BY 4.0) is the commercially usable
  alternative. See RC8.
- Any change to the registry verification boundary.
- Body-aware virtual try-on, or any claim resembling it.
- Replacing the deterministic outfit ranking with a model-chosen selection.
- Background removal quality — separate concern, already measured in
  `scripts/crop-benchmark.ts`.
