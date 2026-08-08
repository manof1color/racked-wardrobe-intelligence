import { writeFileSync } from "node:fs";

// Only variables deliberately consumed by Racked's server/runtime are copied.
// Never dump the complete build environment: it contains AWS and CI metadata.
const allowlist = [
  "SESSION_SECRET",
  "AI_PROVIDER",
  "AI_API_KEY",
  "AI_MODEL",
  "NEXT_PUBLIC_SITE_URL",
  "RACKED_TABLE_NAME",
  "RACKED_UPLOAD_BUCKET",
];

const sessionSecret = process.env.SESSION_SECRET ?? "";
if (sessionSecret.length < 32) {
  throw new Error("Amplify requires SESSION_SECRET with at least 32 characters.");
}

const entries = allowlist.flatMap((name) => {
  const value = process.env[name];
  return value ? [`${name}=${JSON.stringify(value)}`] : [];
});

writeFileSync(".env.production", `${entries.join("\n")}\n`, { encoding:"utf8", mode:0o600 });
console.log(`Prepared ${entries.length} allowlisted runtime variable(s) without logging their values.`);
