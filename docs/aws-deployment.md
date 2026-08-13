# AWS production deployment

Live app: [https://main.d2iv0khybuuaeh.amplifyapp.com](https://main.d2iv0khybuuaeh.amplifyapp.com)

## Current infrastructure

The `racked-production` CloudFormation stack is deployed in `us-east-2` and provides:

- DynamoDB on-demand table with encryption, point-in-time recovery, and deletion protection;
- private encrypted S3 bucket with public access blocked;
- Cognito resources reserved for a later managed-identity migration;
- Amplify compute role scoped to required DynamoDB, private S3-object, and Amazon Bedrock actions.

The DynamoDB policy covers both the table ARN and `${tableArn}/index/*`. The index resource is required because registration and sign-in query the `GSI1` email lookup index; table-only `Query` permission is insufficient.

Amplify is configured with the table and bucket names, the compute role, `AI_PROVIDER=bedrock`, and `AI_MODEL=amazon.nova-lite-v1:0`. Secret values are not printed or stored in GitHub.

## Deployment path

1. GitHub `main` triggers AWS Amplify.
2. `amplify.yml` installs from the lockfile and runs `scripts/write-amplify-env.mjs`.
3. The helper copies only explicit server runtime variables into `.env.production` and never logs their values.
4. `next build` creates the SSR/API artifact.
5. Amplify compute assumes the scoped runtime role.

## Required runtime names

```text
SESSION_SECRET
RACKED_TABLE_NAME
RACKED_UPLOAD_BUCKET
AI_PROVIDER=bedrock
AI_MODEL=amazon.nova-lite-v1:0
AI_BRAND_MODEL=amazon.nova-lite-v1:0
NEXT_PUBLIC_SITE_URL
```

`AWS_REGION` is supplied by the AWS runtime and must not be added as an Amplify environment variable because the prefix is reserved.

## Verification checklist

- [x] CloudFormation stack created successfully.
- [x] Amplify compute role attached.
- [x] DynamoDB and S3 runtime names configured.
- [x] Amazon Bedrock model is available in `us-east-2`.
- [x] Direct Bedrock response test passed.
- [x] Local lint passed.
- [x] All 100 automated tests passed (re-verified 2026-08-13 against `main` at PR #41; the current feature deployment follows merge to `main`).
- [x] Production Next.js build passed.
- [ ] Post-merge live account, photo, persistence, and brand enrollment smoke test.

## Production incident note: mobile registration permission

During the first mobile registration test, DynamoDB rejected the email-index query because the deployed Amplify role had table access but not the `GSI1` index ARN. The infrastructure template already described the index resource, and the production stack was reconciled to that template. Authentication routes now also translate unexpected provider failures into safe user-facing messages instead of returning AWS resource identifiers.

## Cost and safety

- DynamoDB uses on-demand billing.
- S3 is private and temporary objects under `temp/` expire after one day.
- Bedrock is usage-billed; uploads are limited to control request size.
- Create an AWS Budget alert and monitor Amplify, S3, DynamoDB, and Bedrock usage.
- Never place access keys, session secrets, account identifiers, or private image URLs in GitHub issues or logs.

## Rollback

Revert the application PR first so the current Amplify build remains usable. Keep the protected table and retained bucket while investigating. Delete data only through exact, reviewed account-owned keys; never run a broad recursive bucket or table deletion.
