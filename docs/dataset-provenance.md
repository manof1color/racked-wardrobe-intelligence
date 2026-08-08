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

## External research candidates

Public research datasets such as DeepFashion2 may be evaluated for category and landmark benchmarking only after confirming license and redistribution terms. Open product sources such as Icecat may enrich authorized catalog metadata when the supplier and license allow it. Neither source should be used to assert brand ownership or product identity without a Brand registry record.
