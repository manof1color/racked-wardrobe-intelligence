# Data provenance

## Production data

Racked no longer ships a public product-photo fixture or seeded wardrobe. Production records are created only through:

- a Consumer’s own uploaded garment photos and confirmed attributes;
- a Brand account’s authorized front, back, label, SKU/MPN, GTIN, alias, and label-text enrollment;
- confirmed outfit and wear actions;
- explicit Community publishing.

The Brand account remains responsible for having rights to uploaded product photography and label information. Consumers remain responsible for photos they upload to their private wardrobe.

## Automated tests

Unit tests use small in-memory descriptors and typed fixture records to verify validation, registry matching, privacy thresholds, sessions, agents, and failure behavior. These fixtures are not served from `public/`, cannot be loaded from the production UI, and are not represented as real user or brand observations.

## External evaluation source

Racked selected the corrected [Clothing Dataset for Second-Hand Fashion, version 3](https://zenodo.org/records/13788681) as its independent recognition benchmark. The CC BY 4.0 release contains 31,638 main garments plus a separately identified 100-garment annotator-agreement set, with front, back, and brand-label photographs where available and human annotations. RISE Research Institutes of Sweden AB curated and released it with data collected by Wargön Innovation AB and Myrorna AB.

The source images are downloaded into an evaluation workspace outside this repository. They are not production records, are not copied into `public/`, are not uploaded to Racked consumer accounts, and are not deployed to AWS. GitHub holds only attribution, typed evaluation/scoring code, and aggregate reports that contain no photographs or personal information.

This is evaluation data, not training data. Racked currently calls Amazon Nova Lite through Bedrock and has not fine-tuned that model on these garments. The dataset's brand annotation and label image can measure visible-text recognition, but neither can create verified brand or product identity. Exact verification still requires an authorized Racked registry match using GTIN or brand-plus-SKU evidence. See [evaluation.md](evaluation.md) for the protocol and reporting rules.
