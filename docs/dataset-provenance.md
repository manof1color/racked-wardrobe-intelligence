# Dataset provenance and test-data decision

## What is checked into this repository

Racked uses a small, deterministic, fully synthetic dataset:

- one fictional Consumer with 12 wardrobe items, 136 wear events, and 3 outfits;
- one fictional brand, **Northstar Atelier**, with 8 products;
- fictional SKUs, prices, product names, identities, segment sizes, and behavior;
- one synthetic three-image set (front, back, label) generated specifically for this project;
- four fictional partner dashboard datasets for vintage, clothing, shoes, and jewelry;
- no real customer data or copied catalog text.

The normalized product table is available in [`../data/demo-products.csv`](../data/demo-products.csv). Synthetic data is the safest default for a public competition demo because judges can reproduce the workflow and no person or real brand is misrepresented.

The three-view manifest is [`../data/three-view-test-dataset.json`](../data/three-view-test-dataset.json). Its label intentionally contains the fictional brand **Northstar Atelier** and SKU `NA-OW-1042`. The three PNG files are in `public/test-uploads/` and were created with OpenAI image generation for this demo; they do not depict a real catalog product or endorsement.

## Recommended external candidate: Amazon Berkeley Objects (ABO)

The [Registry of Open Data on AWS](https://registry.opendata.aws/amazon-berkeley-objects/) describes ABO as 147,702 product listings with multilingual metadata and 398,212 catalog images, stored in public S3. Metadata resources are available as compressed CSV/JSON and the bucket can be read without an AWS account. It is licensed **CC BY-NC 4.0**, so it is suitable for a noncommercial educational prototype with attribution, but not automatically suitable for a commercial Racked launch.

ABO provides product identifiers plus fields such as item name, product type, brand, model number, color, and linked images. For an optional test import, filter to apparel product types, retain only the minimum metadata fields, preserve the original item identifier as `source_id`, generate a local demo SKU, and display attribution. Do not copy the full dataset into GitHub.

## Apparel-specific alternative

The 2026 [harmonized fast-fashion garment-variant dataset on Zenodo](https://zenodo.org/records/20006389) contains 47,522 H&M/Uniqlo garment variants with product metadata, source/timestamp, color, material composition, and harmonized categories. It intentionally does not redistribute product images. Its real brand names are source identifiers and trademarks, not endorsements. Review the dataset’s included license files before use.

## Decision for judging

Use the checked-in fictional catalog during the live demo. Discuss ABO as the AWS-native scale test and the Zenodo dataset as an apparel/material research option. This separates a reproducible judge flow from licensing uncertainty and prevents real-brand performance claims.

## Import contract

Any future dataset importer must output: `sku`, `source_id`, `brand`, `name`, `category`, `color`, `style_tags`, `season`, `price`, `image_reference`, `license`, and `attribution`. Records missing license/provenance are rejected.
