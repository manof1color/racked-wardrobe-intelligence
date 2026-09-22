import { writeFileSync } from "node:fs";

// Only variables deliberately consumed by Racked's server/runtime are copied.
// Never dump the complete build environment: it contains AWS and CI metadata.
const allowlist = [
  "SESSION_SECRET",
  "AI_PROVIDER",
  "AI_API_KEY",
  "AI_MODEL",
  "AI_BACKGROUND_REMOVAL_MODEL",
  "AI_BRAND_MODEL",
  "AI_HANGER_MODEL",
  "AI_LOOK_DETECTION_MODEL",
  "NEXT_PUBLIC_SITE_URL",
  "RACKED_TABLE_NAME",
  "RACKED_UPLOAD_BUCKET",
  "RACKED_PASSWORD_RESET_FROM",
  "RACKED_PUBLIC_ORIGIN",
];

// The commit this artifact was built from. Amplify sets AWS_COMMIT_ID in the build container; it
// is copied under Racked's own name so the runtime never reads AWS metadata directly. A commit SHA
// of a public repository is public information, and it is the only way to tell from outside
// whether a deployment actually carries a given change — a content hash cannot answer that.
const buildCommit = (process.env.AWS_COMMIT_ID ?? "").trim().slice(0, 40);

const sessionSecret = process.env.SESSION_SECRET ?? "";
if (sessionSecret.length < 32) {
  throw new Error("Amplify requires SESSION_SECRET with at least 32 characters.");
}

const entries = allowlist.flatMap((name) => {
  const value = process.env[name];
  return value ? [`${name}=${JSON.stringify(value)}`] : [];
});

if (/^[0-9a-f]{7,40}$/i.test(buildCommit)) entries.push(`RACKED_BUILD_COMMIT=${JSON.stringify(buildCommit)}`);
entries.push(`RACKED_BUILD_TIME=${JSON.stringify(new Date().toISOString())}`);

writeFileSync(".env.production", `${entries.join("\n")}\n`, { encoding:"utf8", mode:0o600 });
console.log(`Prepared ${entries.length} allowlisted runtime variable(s) without logging their values.`);
