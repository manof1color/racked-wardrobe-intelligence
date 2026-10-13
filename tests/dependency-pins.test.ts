/**
 * A security override in pnpm-workspace.yaml forces the installed version, but GitHub's dependency
 * alerts read the version package.json declares. When the two disagreed — sharp pinned to the
 * patched 0.35.5 while package.json still said 0.35.4 — the app ran the fixed version and the
 * repository still showed an open high-severity alert. A declared version must match its pin.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
const workspace = read("pnpm-workspace.yaml");
const overrides = Object.fromEntries(
  [...workspace.slice(workspace.indexOf("overrides:")).matchAll(/^\s{2}([@\w./-]+):\s*([\d.]+)\s*$/gm)].map(([, name, version]) => [name, version]),
);

test("REGRESSION: every directly declared dependency matches its security pin", () => {
  const declared = { ...manifest.dependencies, ...manifest.devDependencies };
  const pinnedAndDeclared = Object.keys(overrides).filter((name) => name in declared);
  assert.ok(pinnedAndDeclared.includes("sharp"), "sharp is both declared and pinned");
  for (const name of pinnedAndDeclared) {
    assert.equal(declared[name], overrides[name], `${name}: package.json declares ${declared[name]}, the security pin is ${overrides[name]}`);
  }
});
