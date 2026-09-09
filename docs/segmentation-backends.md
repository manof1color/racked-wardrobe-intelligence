# Garment segmentation backends

How Racked cuts a garment out of a photograph, what it currently scores, and how to put a
learned segmenter behind the same seam.

---

## What ships today

A deterministic pass, no weights and no network:

1. **Model the backdrop.** `lib/backdrop-model.ts` clusters the frame's border pixels into
   up to four colours. A bed sheet is one, a striped rug is two, floorboards two or three.
2. **Flood inward** from the border, treating a pixel as backdrop when it matches any
   modelled colour.
3. **Keep the largest connected region** as the garment, so a pillow beside it or the
   neighbours on a crowded rail cannot widen the crop.
4. **Decline** when the result is not believable — two subjects of comparable size, or a
   border too cluttered to describe as a surface. Callers fall back to a conservative edge
   pass and finally to the ordinary bounded photo.

### Measured

`scripts/crop-benchmark.ts` scores crop quality by intersection-over-union against known
garment rectangles across 14 seeded scenes. Run it with:

```bash
node --experimental-strip-types scripts/crop-benchmark.ts
```

| Approach | Mean IoU | Usable (IoU ≥ 0.7) |
| --- | ---: | ---: |
| `trim` — sharp's border trim | 61% | 7/14 |
| `flood` — the earlier single-colour cutout | 78% | 10/14 |
| **`isolate` — the shipped pass** | **86%** | **12/14** |

These are synthetic backdrops chosen to mimic real conditions. They are a reproducible
regression signal, **not** a measured accuracy claim about real photographs.

### Why the backdrop is clustered rather than averaged

The pass previously described the backdrop with one median colour. That works for a wall
and fails for any pattern: on a striped rug the median lands between the stripes and
matches neither, so the pass either refused outright or flooded across the garment.

Clustering fixes that, and introduces one risk worth stating plainly: **a garment running
off the edge of the frame also contributes border pixels**, and admitting its colour as
backdrop would erase the garment. Two discriminators were tried before one worked.

| Attempt | Why it failed |
| --- | --- |
| Keep colours appearing on ≥ 2 frame sides | A garment in a corner touches two sides. It was admitted as backdrop and flooded away — the benchmark's best hard scene dropped from 99% to nothing. |
| Keep the largest colour unconditionally | A garment on two edges can be the single biggest colour on the border. Same failure. |
| **Count runs around a true perimeter walk** | **Works.** A patterned surface alternates with its other colours repeatedly; a garment forms one contiguous arc. |

The perimeter walk matters more than it sounds. Counting runs over an arbitrary list of
border indexes — which interleaves the left and right columns — made a garment on one edge
appear to alternate with the backdrop on the other **263 times**, reporting a single
contiguous shape as heavily patterned. Runs are only meaningful along genuinely adjacent
pixels.

A lighting gradient then needed a second rule: its bands sit in contiguous arcs and fail
the interleaving test despite plainly being backdrop. Colours within `COLOUR_CONTINUITY`
of an accepted surface are absorbed, which admits a ramp (bands differ by tens) while still
excluding a garment (hundreds).

### Two guards on the outcome, not the model

A pass that reports success is not trusted; its output is measured before it reaches
anyone. Both thresholds come from measurement, and the first attempt at one of them was
wrong in an instructive way.

**The garment must fill a detection crop.** A crop is drawn around one garment, so a pass
that leaves a small fragment has eaten the subject. `DETECTION_CROP_SUBJECT_FLOOR` is 28%
of the frame, applied only when the caller signals that these bytes are already a crop.

**One connected region must account for what survives**, because a garment is one object.
`MIN_SUBJECT_DOMINANCE` is 95% of opaque pixels.

Dominance replaced a first attempt that used the *share* of the crop left solid. That
looked well-founded — every working case measured 70–82% solid against 37% for the failing
photograph — but it rejected a legitimately thin garment with a wide transparent margin at
34%, because share cannot tell an unusual silhouette from debris. Dominance separates them:

| Case | solid share | dominance |
| --- | ---: | ---: |
| Working passes on a detection crop | 70–82% | **99.4–100%** |
| Thin garment, wide margin | 34% | **100%** |
| The reported photograph | 37% | **73.8%** across 206 fragments |

When both guards reject every pass, the person gets the ordinary bounded photograph. A
recognisable garment with its background still attached beats a shredded cutout.

### When a cut-out is not possible, the tile says so

Background removal is not the product; a legible wardrobe is. Two cheap decisions carry
most of the value the algorithm was reaching for:

- **A tile only claims transparency when the background was actually removed.** A
  checkerboard behind an opaque photograph asserts a cut-out that is not there, and
  letterboxes the photograph as well. A cut-out is shown whole on a checkerboard; a
  photograph fills its tile on a plain ground and reads as a photograph.
- **Intake names the one condition that decides the outcome.** The hint listed what may be
  photographed — a garment, a flat lay, a rail — but never that a plain surface is what
  makes the background separable at all. A bed, a floor or a wall moves a photograph out of
  the cluttered-scene case, where every colour-based pass fails, into the case measured at
  86% mean IoU.

Guiding the photograph is cheaper and more reliable than solving the general case, and the
general case is what needs a shape-aware segmenter. Transparency genuinely matters in one
place — the saved flat-lay board composites garments onto a white canvas — and there a
consistent tile still reads as deliberate.

### Where it still fails

Two of fourteen scenes, both for the same underlying reason — colour similarity is the only
signal available:

- **A strongly patterned backdrop.** Modelled correctly now, but the crop stays loose.
- **A garment whose colour nearly matches the surface under it.** Declines rather than
  guessing.

Shape is the missing signal, and that is what a learned segmenter supplies.

---

## Adding a learned backend

`lib/garment-segmenter.ts` is the seam. Registering a backend does not require touching the
intake route, the display pipeline, or the benchmark.

```ts
import { registerSegmenter } from "@/lib/garment-segmenter";

registerSegmenter({
  name: "mobile-sam",
  isAvailable: () => weightsLoaded,          // never throw at request time
  segment: async (input, box) => { /* … */ }, // return null to decline
});
```

Selection order: `RACKED_SEGMENTER` names one explicitly; otherwise the first *available*
registered backend wins; the deterministic pass is always last and always available. A
backend that is configured but unavailable logs and falls back rather than failing a scan.

### Four requirements

1. **Decline rather than return a poor result.** A confident wrong crop is worse than an
   honest fallback, and every caller already has one.
2. **Never generate garment pixels.** Deciding which pixels are backdrop is in scope;
   inventing, restyling, or repainting the garment is not.
3. **Infer nothing about people.** Class-agnostic segmentation satisfies this by
   construction — it has no classes at all.
4. **Run in-process.** Whole-look intake is deliberately one remote call. A per-piece
   network round trip is the fan-out removed in
   [#100](https://github.com/manof1color/racked-wardrobe-intelligence/pull/100); a backend
   that reintroduces it must not run on the synchronous path, whatever its IoU.

---

## Tools assessed and rejected

Evaluated on request; recording the reasons so the same ground is not covered again.

| Tool | Verdict |
| --- | --- |
| [custom-image-cropper](https://github.com/Sobhan-SRZA/custom-image-cropper) | MIT, vanilla JS, no dependencies — but a **manual drag-resize crop UI**, not automatic segmentation. The idea is sound and is now RC10; the repository itself is one star and twelve commits, and a drag-resize box is not worth a dependency. |
| [Image-Editor](https://github.com/darshitjain87/Image-Editor) | **Unusable on three counts.** No `LICENSE` at all, so all rights reserved. Django and OpenCV, so server-side Python that Amplify cannot run. And its background removal is MediaPipe **Selfie Segmentation**, trained on people — a flat-lay shoe contains no person, and inferring one would breach Racked's own boundary. |
| MediaPipe **Image** Segmenter | Its one general-purpose model, DeepLab-v3, segments background, person, cat, dog and potted plant. A sneaker classifies as background. |

### Training a model was also considered and rejected for now

Established earlier in `docs/work-order-recognition.md`: DeepFashion2 is non-commercial, Fashionpedia is CC BY 4.0 but photographs people rather than flat lays, no public flat-lay garment corpus exists, and fine-tuning needs a GPU and a PyTorch toolchain that cannot run on Amplify. Weeks of work, a licence trap either side, and a real chance that training on person-worn clothing makes flat-lay recognition worse. Not a competition-week undertaking.

---

## RC10 — Let the person adjust the crop · **RECOMMENDED NEXT**

The simplest thing that cannot fail. A drag-and-resize box over the photograph, cropped in
the browser, replacing the stored display image. No model, no weights, no dataset licence,
no training, and no failure mode beyond the person changing their mind. It is what every
resale app offers, and it turns the remaining hard cases from "the app got it wrong" into
"I framed it myself in two seconds".

One thing to get right: the garment save is HMAC-bound to the account, the stored image key
and the analysis. A client-supplied crop must be re-stored and re-signed server-side rather
than swapped in underneath the existing token.

---

## RC11 — MediaPipe Interactive Segmenter (MagicTouch)

The strongest automatic option found, and better suited to Racked than MobileSAM for one
reason: **it runs in the browser**.

- **Class-agnostic** — segments whatever the person points at, explicitly including shoes
  and garments, rather than a fixed category list.
- Takes a **point or brush prompt**, so a single tap on the garment is the whole interface.
- Ships for the web through `@mediapipe/tasks-vision` as WASM, so it never enters the
  Amplify bundle, adds no server cost, and costs nothing per scan.
- Code is Apache 2.0.

That last point is what makes it more practical than MobileSAM here: RC9 stalled on
exporting PyTorch weights to ONNX and on putting a 40 MB model into the deployed bundle.
Running client-side sidesteps both.

**Check before committing:** the model card licence for MagicTouch is separate from the
Apache 2.0 code licence and was not stated on the task page. Confirm it permits commercial
use before shipping, exactly as Fashionpedia and DeepFashion2 were checked.

**Sequencing.** RC10 first — it is smaller, cannot fail, and covers every photograph. RC11
after, because a tap that produces a clean cut-out is a nicer experience than dragging a
box, but only once the reliable path exists underneath it.

---

## MobileSAM specifically

[MobileSAM](https://github.com/ChaoningZhang/MobileSAM) is the strongest candidate, and the
reason is licence-shaped as much as technical. Segmentation is class-agnostic, which clears
the constraints that block clothing *detectors*:

| Constraint | How MobileSAM clears it |
| --- | --- |
| Code licence | **Apache 2.0** — no copyleft obligation |
| Dataset licence | **No training required**, so no dataset terms apply |
| Privacy | **No classes**, so it cannot infer a person |
| Runtime | ~9.66M parameters, **official ONNX export**, takes a **box prompt** — and whole-look detection already produces a box |

### Why it is not wired in yet

The published weights are a PyTorch checkpoint (`mobile_sam.pt`, ~38.8 MB). Converting to
ONNX needs a Python and PyTorch toolchain this repository does not have and should not
acquire mid-competition. Shipping `onnxruntime-node` plus the model into the deployed
bundle **before measuring a win** would also be the wrong order of operations — the same
discipline RC1 applies to recognition.

### Export recipe

Run outside this repository; commit no weights.

```bash
git clone https://github.com/ChaoningZhang/MobileSAM
cd MobileSAM && pip install -e .
python scripts/export_onnx_model.py \
  --checkpoint ./weights/mobile_sam.pt \
  --model-type vit_t \
  --output mobile_sam_decoder.onnx
```

The image encoder exports separately; SAM-family models are two-stage — the encoder runs
once per image, the decoder once per prompt.

### Then, in order

1. Add MobileSAM as a fourth column in `scripts/crop-benchmark.ts`, prompted with each
   scene's known box.
2. Score it against the **86% / 12-14** baseline above, on the same 14 scenes.
3. Only if it wins, register it and confirm the ONNX bundle fits the deployed Amplify
   package before claiming it ships.

Tracked as RC9 in [the recognition work order](work-order-recognition.md).
