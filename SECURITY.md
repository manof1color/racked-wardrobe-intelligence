# Security policy

## Supported scope

The competition demo is an educational prototype. Security reports should cover authentication/session integrity, role authorization, consent bypass, exposure of raw wardrobe data, unsafe uploads, secret leakage, and cohort-threshold bypass.

## Never include in an issue

Do not publish passwords other than the documented fictional demo password, session cookies, AWS credentials, model/API keys, private user data, or exploit output containing sensitive data. Share a minimal redacted reproduction with the repository owner privately.

## Baseline controls

- Secrets come from ignored runtime environment files or the deployment platform.
- Sessions are signed, HTTP-only, SameSite, expiring cookies.
- Consumer/Brand pages enforce roles on the server.
- Consumer analysis requires explicit consent.
- Brand-safe aggregate helpers suppress cohorts below 25 and strip identity/raw-wardrobe fields.
- Production uploads must be private, allowlisted, size-limited, scanned, and lifecycle-deleted.
- Logs must exclude tokens, raw images, credentials, and personal data.

## Before public deployment

Replace fictional demo authentication with Cognito, add rate limiting and CSRF review, persist consent versions, implement upload malware scanning, add dependency/security scanning, validate CloudFormation changes, and complete a focused authorization test against every write endpoint.
