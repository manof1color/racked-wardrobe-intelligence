# AWS production deployment

Live app: [https://main.d2iv0khybuuaeh.amplifyapp.com](https://main.d2iv0khybuuaeh.amplifyapp.com)

## Current infrastructure

The `racked-production` CloudFormation stack is deployed in `us-east-2` and provides:

- DynamoDB on-demand table with encryption, point-in-time recovery, and deletion protection;
- private encrypted S3 bucket with public access blocked;
- Cognito resources reserved for a later managed-identity migration;
- Amplify compute role scoped to required DynamoDB, private S3-object, and Amazon Bedrock actions.

The DynamoDB policy covers both the table ARN and `${tableArn}/index/*`. The index resource is required because registration and sign-in query the `GSI1` email lookup index; table-only `Query` permission is insufficient.

Amplify is configured with the table and bucket names, the compute role, `AI_PROVIDER=bedrock`, and `AI_MODEL=amazon.nova-lite-v1:0`. Whole-look cutouts default to the US geographic profile `us.stability.stable-image-remove-background-v1:0`; `AI_BACKGROUND_REMOVAL_MODEL` may pin that documented ID explicitly. Secret values are not printed or stored in GitHub.

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
RACKED_PASSWORD_RESET_FROM
RACKED_PUBLIC_ORIGIN
AI_PROVIDER=bedrock
AI_MODEL=amazon.nova-lite-v1:0
AI_BRAND_MODEL=amazon.nova-lite-v1:0
AI_BACKGROUND_REMOVAL_MODEL=us.stability.stable-image-remove-background-v1:0
NEXT_PUBLIC_SITE_URL
```

`RACKED_PASSWORD_RESET_FROM` must be a verified Amazon SES identity. If SES remains in sandbox mode, reset email works only for recipient addresses that are also verified. Before public recovery can be claimed, request SES production access and verify SPF/DKIM for the sender domain. The committed template describes only `ses:SendEmail`, but the 2026-08-28 Stable Image-only stack update deliberately did not deploy that unrelated permission. No SMTP/API credential is committed.

The committed synthetic cohort uses reserved `.local` addresses, so those accounts cannot receive real email. To demonstrate recovery before SES leaves its sandbox, use a separately created synthetic test account whose recipient address is verified in SES; never replace the documented cohort addresses with a judge's or customer's private email in source control. Deploying the application code also does not update an already-created IAM role automatically: apply the `infra/template.yaml` permission change (or add the equivalent narrowly scoped `ses:SendEmail` policy) before expecting delivery.

`AWS_REGION` is supplied by the AWS runtime and must not be added as an Amplify environment variable because the prefix is reserved.

## Verification checklist

- [x] CloudFormation stack created successfully.
- [x] Amplify compute role attached.
- [x] On 2026-08-28, change set `racked-stable-image-only` added exactly the three US Stable Image foundation-model ARNs to the existing Bedrock `InvokeModel` statement. The role was modified in place (`Replacement: False`); `AmplifyComputeRole` and `racked-production` both reached `UPDATE_COMPLETE`.
- [x] DynamoDB and S3 runtime names configured.
- [x] Amazon Nova Lite is available in `us-east-2`; Stable Image background removal supports that source Region through the US geographic inference profile.
- [x] Direct Bedrock response test passed.
- [x] Local lint passed.
- [x] All 269 automated tests and the production dependency audit pass locally (re-verified 2026-08-29); CI and CodeQL remain mandatory before merge.
- [x] PR #91 merged as `3a5c0d9` after Validate Racked and CodeQL passed. Amplify deployment 78 completed successfully from that commit in 3 minutes 30 seconds, and the production root served the expected Racked application immediately after the CloudFormation update. A physical-phone garment segmentation retest remains outstanding.
- [x] PR #86 merged as `ae315b4` after Validate Racked and CodeQL passed. By 2026-08-23 19:40 UTC the production root returned HTTP 200 and served the corrected Add Racked flow from `/_next/static/chunks/app/layout-2d79734cfefd5cc0.js`; compatible browsers receive the native prompt and browsers without one receive the device-specific guide.
- [x] PR #84 merged as `17e73ed` after Validate Racked and CodeQL passed. By 2026-08-23 02:28 UTC, the production Community page returned HTTP 200 and served the new Hanger-inspiration JavaScript bundle; `/login` returned HTTP 200 and the signed-out Consumer route retained its expected HTTP 307 redirect to `/login`. The exact Amplify job ID was not recorded because the AWS console session had expired, so deployment is evidenced by the public production artifact rather than an invented console identifier.
- [x] PR #82 merged as `6bc2557` after Validate Racked and CodeQL passed; Amplify's replacement build `BJCT2zWZITIpnwl872W83` was visible at the production URL by 2026-08-22 18:45 UTC. The public login returns HTTP 200 and the signed-out Consumer route returns its expected HTTP 307 redirect to login, preserving the access-control boundary.
- [x] Production Next.js build passed.
- [x] Amplify deployment 39 deployed PR #52 merge commit `893c4fb`; the synthetic seed was rerun and the documented 62% exact + strong substitute + missing Recreate result was verified live.
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
