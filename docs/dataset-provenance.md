# Dataset provenance and product identity

## Checked-in test data

Racked uses a deterministic, fully synthetic judge dataset: one Consumer with 12 wardrobe items, one fictional Northstar Atelier catalog with 8 SKUs, 136 wear events, 3 outfits, four partner verticals, and a generated front/back/label fixture. No real customer data or copied catalog content is committed.

- Product table: [`../data/demo-products.csv`](../data/demo-products.csv)
- Three-view manifest: [`../data/three-view-test-dataset.json`](../data/three-view-test-dataset.json)
- Brand import contract: [`../data/brand-registry-import-template.csv`](../data/brand-registry-import-template.csv)

## External dataset research

No reviewed source guarantees all of: garment front, garment back, physical label, authoritative real brand, and SKU/GTIN. Racked therefore separates visual research data from authoritative Brand enrollment.

| Source | Useful fields | Limitation | Racked decision |
| --- | --- | --- | --- |
| [Amazon Berkeley Objects (ABO)](https://registry.opendata.aws/amazon-berkeley-objects/) | 147,702 listings, brand/model metadata, 398,212 catalog images, and thousands of multi-angle turntables | CC BY-NC 4.0; apparel and label coverage are not guaranteed | Best noncommercial scale and multi-view research source; import metadata by reference with attribution |
| [DeepFashion2](https://github.com/switchablenorms/DeepFashion2) | 491K fashion images, shop/consumer pairs, and front versus side/back viewpoint annotations | No authoritative brand, SKU, GTIN, or physical-label identity | Use only to evaluate garment retrieval and viewpoint handling |
| [Open Icecat](https://icecat.com/structured-data-content-users/) | Brand-approved product datasheets, brand information, images, and structured identifiers | Free-brand and apparel coverage varies; front/back/label views are not guaranteed | Strongest optional catalog-enrichment candidate after account and license review |

Icecat recommends matching by **Brand + Manufacturer Part Number** or **GTIN**. Racked implements the same identifier hierarchy and adds exact Brand-enrolled image hashes. Appearance alone never proves brand ownership.

## Brand-authoritative registry implemented in Racked

The Brand workspace enrolls a front image, back image, label image, product name, account-bound verified brand, SKU/MPN, optional GTIN, category, label aliases, and approved label text. The demo backend stores SHA-256 hashes and metadata. Consumer uploads resolve in this order:

1. exact enrolled label-image hash;
2. exact enrolled three-image set;
3. exact GTIN found in corrected/OCR label text;
4. Brand alias plus SKU/MPN found together in label text.

Unmatched records fail closed and require human correction. A registry hit is traceability evidence; it is not proof that a separately photographed physical garment is authentic.

## Judge and production decision

Use the synthetic catalog during the live demo. First enroll the fixture in the Brand workspace, then scan it as the Consumer and show the `label-image-hash` result. Discuss ABO and DeepFashion2 as research sources and Icecat as a potential production enrichment source. Real trademarks remain source identifiers, not endorsements.

Records missing license, attribution, brand, SKU/MPN or GTIN, and source provenance are rejected. Dataset imports may enrich search, but only a verified Brand account can create an authoritative Racked registry record.
