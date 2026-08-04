# Racked

**Privacy-first AI wardrobe intelligence for consumers and emerging apparel brands.**

Racked addresses a costly information gap: a purchase record shows what someone bought, but not what they actually use, what pairs with their closet, or what category is already overrepresented. With explicit consent, Racked converts confirmed wardrobe, wear, outfit, and product attributes into inspectable product-match scores. Consumers get more useful recommendations; brands get anonymous segment opportunities instead of raw personal data.

> **Judge note:** This repository is intentionally organized around the CUA AI Vibe Coding Competition rubric. Start with the [competition checklist](docs/competition-checklist.md), then follow the [5–10 minute demo script](docs/demo-script.md).

## Working demo

The app includes two fictional accounts and works without an external AI provider:

| Mode | Fictional account | What to demonstrate |
| --- | --- | --- |
| Consumer | `consumer@demo.racked.local` | Consent, 12-piece wardrobe, wear tracking, garment extraction confirmation, usage insights, recommendations |
| Brand | `brand@demo.racked.local` | 8-SKU catalog, product selection, anonymous segment match, seven score components, grounded reasons, campaign brief |

Both use password `demo2026`. These credentials protect fictional demo data only and are intentionally public for judging. Production authentication is designed for Amazon Cognito.

### New end-to-end judge flows

- **Consumer Stylist Agent:** builds an outfit only from owned pieces and current wardrobe/wear context; the result can be shared to the public community feed.
- **Functional agent actions:** record every unique piece in the suggested outfit, publish the look, and visibly confirm the backend result.
- **Brand Wear Intelligence Agent:** reports aggregate actual-wear signals, privacy suppression, and a grounded merchandising action without exposing identities.
- **Three-view garment analysis:** submit front, back, and label images; the checked-in Northstar fixture resolves SKU `NA-OW-1042` to its public brand page. The analysis is review-first and never silently saves a model guess.
- **Brand product enrollment:** a Brand registers front/back/label hashes, SKU/MPN, optional GTIN, aliases, and approved label text before Consumer scans can trace the product.
- **Consumer mobile foundation:** Today, Avatar, Closet, and Scan views, owned-piece avatar outfit recording, phone navigation, and an installable PWA manifest.
- **Social discovery:** `/community` displays fictional outfit posts with product-to-brand links and backend-persisted demo likes.
- **Four partner workspaces:** `/partners/vintage`, `/partners/clothing`, `/partners/shoes`, and `/partners/jewelry` show vertical-specific metrics, inventory, and agent briefs.

## Why the AI is substantive

Racked combines seven stored signals: outfit pairing, color compatibility, style compatibility, wear relevance, season fit, wardrobe-gap bonus, and duplicate-category risk. Each score is weighted, inspectable, and tested. Explanations are generated only from these components and confirmed attributes—never from invented identity traits, preferences, outcomes, or sales claims.

When a multimodal provider is unavailable, the same workflow uses a visibly labeled deterministic fallback. This keeps the live demo reliable and makes the decision logic auditable. See [AI use and model boundaries](docs/ai-use-log.md).

## Rubric map

| Criterion | Evidence |
| --- | --- |
| Problem & relevance — 20% | This README, [one-page summary](docs/one-page-summary.md), measurable brand metrics |
| Functionality — 25% | Signed login, Consumer and Brand workflows, error/empty/success states, tests, [AWS plan](docs/aws-deployment.md) |
| AI & innovation — 20% | [`lib/matching.ts`](lib/matching.ts), [`lib/agents.ts`](lib/agents.ts), three-view analysis, score explanations, deterministic fallback |
| Code, docs & GitHub — 15% | Typed modules, tests, CI, architecture/privacy documentation, checkpoint-ready history |
| UX & polish — 10% | Responsive dual-mode interface, keyboard focus, semantic labels, reduced-motion support |
| Business impact — 10% | Match opportunity, gap prevalence, duplicate risk, eligible segment size, campaign brief |
| Bonus | Consent, k-anonymity threshold, bias boundaries, deletion workflow, WCAG-oriented controls |

## Architecture

```text
Browser → AWS Amplify Hosting (Next.js SSR/API routes)
        → Amazon Cognito (production identity and roles)
        → Amazon DynamoDB (users, wardrobes, events, products, matches)
        → private Amazon S3 (temporary garment uploads)
        → optional multimodal provider through a server-only adapter
```

The checked-in demo uses signed HTTP-only sessions and deterministic in-memory seed data so it can be evaluated without credentials. The service boundaries are documented in [architecture.md](docs/architecture.md); AWS resource scaffolding lives in [`infra/template.yaml`](infra/template.yaml).

## Local setup

Requirements: Node.js 22+ and pnpm 10+.

```bash
pnpm install --frozen-lockfile
copy .env.example .env.local
# Add a unique SESSION_SECRET with at least 32 characters.
pnpm dev
```

Open `http://localhost:3000`. Never commit `.env.local`.

## Verification

```bash
pnpm lint
pnpm test
pnpm build
```

Tests cover signed/expired/tampered sessions, role claims, the seven-factor score, deterministic ordering, explanation grounding, both agents, three-view validation and SKU linking, social privacy, four vertical dashboards, minimum cohort enforcement, and removal of identity fields from brand-safe segments.

## Documentation index

- [Competition checklist](docs/competition-checklist.md) — exact judge evidence by criterion
- [One-page summary](docs/one-page-summary.md) — submission-ready problem/solution/AI/learnings
- [Demo script](docs/demo-script.md) — timed 5–10 minute presentation
- [Architecture](docs/architecture.md) — components, data model, and trust boundaries
- [AI use log](docs/ai-use-log.md) — AI workflow, prompts, fallback, limitations
- [Privacy and ethics](docs/privacy-and-ethics.md) — consent, retention, deletion, bias safeguards
- [Dataset provenance](docs/dataset-provenance.md) — synthetic seeds and public data candidates
- [Backend API](docs/backend-api.md) — routes, authorization, request shapes, and demo persistence
- [AWS deployment](docs/aws-deployment.md) — exact staged deployment checklist
- [Security policy](SECURITY.md) — secret handling and reporting

## Current status

The local competition MVP is implemented and verified. AWS deployment remains deliberately unexecuted because it requires the owner’s AWS/GitHub credentials and a supported production secret. The repository makes no claims of validated sales lift, model accuracy, or production readiness.

## License and ownership

Student-owned competition project. The synthetic `Northstar Atelier` brand, users, wardrobes, events, and metrics are fictional. External datasets are not redistributed in this repository.
