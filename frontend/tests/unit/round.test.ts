import test from "node:test";
import assert from "node:assert/strict";
import { Round } from "../../lib/round.ts";
import type { RoundApi, Reveal } from "../../lib/api.ts";
import type { Photo } from "../../lib/photo.ts";
import type { Box } from "../../lib/geometry.ts";
const actual: Box = [.4, .4, .6, .6];
function photo(name = "photo"): Photo { return { blob: new Blob([name]), url: "blob:" + name, width: 400, height: 600, dispose() {} }; }
function result(id = "one"): Reveal { return { round_id: id, state: "complete", actual_box: actual, prediction: { status: "found", box: actual, score: .7 }, result: { winner: "ai", iou: 1, iou_threshold: .3 }, model: { id: "test-only", threshold: .1, inference_ms: 1 } }; }
function api(overrides: Partial<RoundApi> = {}): RoundApi { return { create: async () => "one", seek: async () => {}, reveal: async id => result(id), ...overrides }; }
function ready(service = api(), demo = false) {
  const round = new Round(service, demo); round.loadReference(photo("reference")); round.loadScene(round.beginLoad(), photo()); round.annotate(actual); return round;
}
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }

test("one locked guess, one score, and rematch clears scene but keeps reference and history", async () => {
  let creates = 0, seeks = 0;
  const round = ready(api({ create: async () => { creates++; return "one"; }, seek: async () => { seeks++; } }));
  await Promise.all([round.seek(), round.seek()]);
  round.annotate([0, 0, 1, 1]); assert.deepEqual(round.state.actual, actual);
  await Promise.all([round.reveal(), round.reveal()]);
  assert.equal(creates, 1); assert.equal(seeks, 1); assert.equal(round.state.scores.ai, 1); assert.equal(round.state.history.length, 1);
  round.clearScene(); assert.equal(round.state.scene, null); assert.equal(round.state.actual, null); assert.equal(round.state.reveal, null); assert.ok(round.state.reference); assert.equal(round.state.history.length, 1);
});
test("cancelled creation reuses its idempotency key; a late result cannot overwrite a new photo", async () => {
  const old = deferred<string>(); const keys: string[] = [];
  const round = ready(api({ create: async (_r, _s, _a, key) => { keys.push(key); return keys.length === 1 ? old.promise : "two"; } }));
  const pending = round.seek(); round.cancel();
  await round.seek(); assert.equal(keys[0], keys[1]); assert.equal(round.state.id, "two");
  old.resolve("one"); await pending; assert.equal(round.state.id, "two");
  const epoch = round.beginLoad(); round.loadScene(epoch, photo("new"));
  assert.equal(round.state.id, null); assert.equal(round.state.scene!.url, "blob:new");
});
test("out-of-order seeks recover the same known ID and never re-guess", async () => {
  const slow = deferred<void>(); let calls = 0; const ids: string[] = [];
  const round = ready(api({ seek: async id => { ids.push(id); calls++; if (calls === 1) await slow.promise; } }));
  const first = round.seek(); await Promise.resolve(); await Promise.resolve(); round.cancel();
  await round.seek(); assert.deepEqual(ids, ["one", "one"]);
  slow.resolve(); await first; assert.equal(round.state.phase, "locked");
});
test("replacement during reveal ignores late scoring; stale photos are disposed", async () => {
  const slow = deferred<Reveal>(); const round = ready(api({ reveal: async () => slow.promise }));
  await round.seek(); const pending = round.reveal();
  const oldEpoch = round.beginLoad(); const currentEpoch = round.beginLoad();
  let disposed = false; const stale = photo(); stale.dispose = () => { disposed = true; };
  round.loadScene(oldEpoch, stale); assert.ok(disposed);
  round.loadScene(currentEpoch, photo("new")); slow.resolve(result()); await pending;
  assert.equal(round.state.scores.ai, 0); assert.equal(round.state.reveal, null); assert.equal(round.state.phase, "annotating");
});
test("server errors never award a win; review notes do not submit or change scoring", async () => {
  const round = ready(api({ reveal: async () => { throw new Error("offline"); } }));
  await round.seek(); await round.reveal(); assert.equal(round.state.phase, "locked"); assert.equal(round.state.scores.player, 0); assert.equal(round.state.history.length, 0);
  round.api = api(); await round.reveal(); round.review("Flagged", [0, 0, .2, .2]);
  assert.deepEqual(round.state.actual, actual); assert.equal(round.state.scores.ai, 1); assert.equal(round.state.history[0].note, "Flagged");
});
test("demo guess is fixed independent of ground truth and increments only demo scores", async () => {
  const round = ready(api(), true); await round.seek(); await round.reveal();
  const firstBox = round.state.reveal!.prediction.box; assert.equal(round.state.scores.ai + round.state.scores.player, 0);
  assert.equal(round.state.demoScores.ai + round.state.demoScores.player, 1);
  round.clearScene(); round.loadScene(round.beginLoad(), photo("other")); round.annotate([0, 0, .2, .2]); await round.seek(); await round.reveal();
  assert.deepEqual(round.state.reveal!.prediction.box, firstBox); assert.equal(round.state.history[0].demo, true);
});
test("history retains five scenes, frees older image URLs, and releases each photo once", async () => {
  let counter = 0;
  const round = new Round(api({ create: async () => String(++counter) }), false);
  const disposed: string[] = [];
  const make = (name: string) => { const p = photo(name); p.dispose = () => disposed.push(name); return p; };
  round.loadReference(make("reference"));
  for (let i = 0; i < 6; i++) {
    round.loadScene(round.beginLoad(), make("scene-" + i)); round.annotate(actual); await round.seek(); await round.reveal();
  }
  assert.equal(round.state.history.length, 5); assert.equal(round.state.scores.ai, 6);
  assert.deepEqual(disposed, ["scene-0"]);
  round.dispose(); assert.equal(disposed.length, 7); assert.equal(new Set(disposed).size, 7);
});
