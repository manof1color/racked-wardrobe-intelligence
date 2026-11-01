// Is the live demo ready? Read-only: it sends a handful of GET requests to public pages and spends
// no model call, signs in nowhere, and writes nothing. Run it 30 minutes before presenting:
//   pnpm verify:live
// RACKED_LIVE_URL overrides the address (for a staging branch); the default is production.
import { execFileSync } from "node:child_process";

const BASE = (process.env.RACKED_LIVE_URL ?? "https://main.d2iv0khybuuaeh.amplifyapp.com").replace(/\/+$/, "");
if (!/^https:\/\/[a-z0-9.-]+$/i.test(BASE)) throw new Error("RACKED_LIVE_URL must be an https origin.");
const PUBLIC_PAGES = ["/", "/pricing", "/privacy", "/terms", "/login", "/community"];
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };
const get = async (path) => {
  try {
    const response = await fetch(`${BASE}${path}`, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    const text = await response.text();
    let json = null; try { json = JSON.parse(text); } catch { /* a page, not JSON */ }
    return { status: response.status, json };
  } catch (error) {
    return { status: 0, json: null, error: error instanceof Error ? error.name : "Error" };
  }
};

// What main is on GitHub, read without changing the local checkout.
let mainCommit = null;
try {
  mainCommit = execFileSync("git", ["ls-remote", "origin", "refs/heads/main"], { encoding: "utf8" }).split(/\s+/)[0] || null;
} catch { /* not in a checkout, or offline */ }

const version = await get("/api/version");
check("the live site runs the latest main", Boolean(mainCommit) && version.json?.commit === mainCommit, `live ${String(version.json?.commit ?? version.status).slice(0, 7)}, main ${String(mainCommit ?? "unknown").slice(0, 7)}`);

for (const page of PUBLIC_PAGES) {
  const response = await get(page);
  check(`${page} loads`, response.status === 200, String(response.status));
}

const health = await get("/api/health");
check("the AI is configured", health.json?.ai?.configured === true, JSON.stringify(health.json?.ai ?? health.status));
check("today's AI budget is not used up", ["plenty", "low"].includes(health.json?.ai?.budget), health.json?.ai?.budget === "low" ? "low: avoid extra test scans before the demo" : String(health.json?.ai?.budget ?? health.status));

// main is protected: GitHub's public API, read without signing in.
const REPO = "manof1color/racked-wardrobe-intelligence";
const github = async (path) => {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, { headers: { accept: "application/vnd.github+json", "user-agent": "racked-verify-live" }, signal: AbortSignal.timeout(15_000) });
    return { status: response.status, json: await response.json().catch(() => null) };
  } catch {
    return { status: 0, json: null };
  }
};
const branch = await github("/branches/main");
const rules = await github("/rules/branches/main");
const ruleTypes = Array.isArray(rules.json) ? rules.json.map((rule) => rule.type) : [];
check("main is protected on GitHub", branch.json?.protected === true || (ruleTypes.includes("pull_request") && ruleTypes.includes("required_status_checks")), `protected ${String(branch.json?.protected ?? branch.status)}, rules: ${ruleTypes.join(", ") || "none"}`);

const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\n${failed} check${failed === 1 ? "" : "s"} failed. Do not start the demo until they pass, or use the backup video.` : "\nReady. Now do one real scan on a judge account (docs/demo-checklist.md).");
process.exit(failed ? 1 : 0);
