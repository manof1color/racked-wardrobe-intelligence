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
