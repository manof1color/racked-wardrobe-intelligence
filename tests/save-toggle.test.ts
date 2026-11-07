import test from "node:test";
import assert from "node:assert/strict";
import { createSaveToggle, optimisticSave, type SaveState } from "../lib/save-toggle.ts";

test("the heart shows the new state at once, then the server's answer", async () => {
  const shown: SaveState[] = [];
  const toggle = createSaveToggle(async (_postId, saved) => ({ saved, likes: saved ? 8 : 7 }));
  assert.deepEqual(await toggle.toggle("p1", { saved: false, likes: 7 }, (state) => shown.push(state)), { saved: true, likes: 8 });
  assert.deepEqual(shown, [{ saved: true, likes: 8 }, { saved: true, likes: 8 }]);
});

test("the request says the state wanted, never 'toggle'", async () => {
  const sent: boolean[] = [];
  const toggle = createSaveToggle(async (_postId, saved) => { sent.push(saved); return { saved, likes: 1 }; });
  await toggle.toggle("p1", { saved: true, likes: 2 }, () => undefined);
  assert.deepEqual(sent, [false]);
});

test("a failed request restores exactly what was there", async () => {
  const shown: SaveState[] = [];
  const toggle = createSaveToggle(async () => { throw new Error("offline"); });
  await assert.rejects(toggle.toggle("p1", { saved: true, likes: 5 }, (state) => shown.push(state)), /offline/);
  assert.deepEqual(shown, [{ saved: false, likes: 4 }, { saved: true, likes: 5 }]);
  assert.equal(toggle.isPending("p1"), false);
});

test("a second tap while the first is on its way sends nothing", async () => {
  let calls = 0;
  let finish!: (state: SaveState) => void;
  const toggle = createSaveToggle(() => { calls++; return new Promise<SaveState>((resolve) => { finish = resolve; }); });
  const first = toggle.toggle("p1", { saved: false, likes: 0 }, () => undefined);
  assert.equal(await toggle.toggle("p1", { saved: true, likes: 1 }, () => undefined), null);
  assert.equal(calls, 1);
  finish({ saved: true, likes: 1 });
  await first;
  assert.equal(toggle.isPending("p1"), false);
});

test("the count shown never goes below zero", () => {
  assert.deepEqual(optimisticSave({ saved: true, likes: 0 }), { saved: false, likes: 0 });
});
