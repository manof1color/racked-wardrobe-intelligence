// The judge seed's product photos: AI-generated images of fictional items, made for the demo
// (docs/judge-accounts.md). They replace the illustrated art for the judge accounts only; the
// main demo cohort keeps the illustrations from synthetic-garment-art.mjs.
//
// Each photo is a 900x1100 WebP in scripts/assets/judge-photos/, named for the wardrobe piece
// (`oxford`) or the product view (`jda-001-front`). The seed fails when one is missing, rather
// than silently writing a blank.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const JUDGE_PHOTO_DIR = fileURLToPath(new URL("../assets/judge-photos/", import.meta.url));
export const JUDGE_PHOTO_TYPE = "image/webp";
export const JUDGE_PHOTO_SIZE = { width: 900, height: 1100 };

/** The photo for one view of a brand product, from its SKU: `JDA-001` + `front` → `jda-001-front`. */
export const productPhotoName = (sku, view) => `${String(sku).toLowerCase()}-${view}`;

/** The file a photo is read from. */
export const judgePhotoPath = (name) => join(JUDGE_PHOTO_DIR, `${name}.webp`);

/** The photo's bytes. Throws, naming the file, when it is missing. */
export function judgePhoto(name) {
  const path = judgePhotoPath(name);
  if (!existsSync(path)) throw new Error(`Missing judge photo ${name}.webp in scripts/assets/judge-photos/.`);
  return readFileSync(path);
}
