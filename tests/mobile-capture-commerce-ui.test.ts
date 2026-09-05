import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("photo intake exposes separate camera and library controls",()=>{
  const picker=read("components/photo-source-picker.tsx");
  assert.match(picker,/capture="environment"/);
  assert.match(picker,/>Take photo</);
  assert.match(picker,/>Choose image</);
  assert.match(picker,/className="photo-source-action library"[\s\S]*?<input type="file" accept=\{accept\} onChange=\{choose\}/);
});

// Rewritten when the two intake modes were merged. The guarantee it protects is unchanged
// — intake stays simple, and exact brand tracking stays explicit — but that is now one flow
// with an opt-in per piece rather than a choice made before photographing anything.
test("the default intake is simple while exact brand tracking remains explicit",()=>{
  const dashboard=read("components/consumer-dashboard.tsx");
  const intake=read("components/garment-intake.tsx");
  assert.match(dashboard,/One photo\. Racked separates the pieces/);
  assert.doesNotMatch(dashboard,/Add from one photo|Link a brand product/,"the upfront mode choice is gone");
  // Brand linking is offered, never assumed, and never the default path.
  assert.match(intake,/Is this a brand product\?/);
  assert.match(intake,/Optional/);
  assert.match(intake,/Barcode number, or brand \+ style code/);
  assert.doesNotMatch(dashboard,/Verify one item/);
});

test("mobile account menu retains sign out without duplicating primary navigation",()=>{
  const shell=read("components/app-shell.tsx");
  assert.match(shell,/Open account menu/);
  assert.match(shell,/Use the bottom tabs to move around Racked/);
  assert.match(shell,/Sign out/);
  assert.doesNotMatch(shell,/workspaceMenuItems/);
});

test("fictional checkout completes at zero charge and returns to Racked",()=>{
  const purchase=read("components/demo-purchase-panel.tsx");
  assert.match(purchase,/Add to demo bag/);
  assert.match(purchase,/Complete demo purchase — \$0\.00/);
  assert.match(purchase,/no payment was processed/i);
  assert.match(purchase,/href="\/community">Return to Racked/);
});
