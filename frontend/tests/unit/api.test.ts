import test from "node:test";
import assert from "node:assert/strict";
import { createApi, parseReveal } from "../../lib/api.ts";
import type { Photo } from "../../lib/photo.ts";
import type { Box } from "../../lib/geometry.ts";
const box: Box = [.4, .4, .6, .6];
const photo: Photo = { blob: new Blob(["pixels"], { type: "image/jpeg" }), url: "blob:test", width: 400, height: 600, dispose() {} };
const reveal = () => ({ round_id: "round-1", state: "complete", prediction: { status: "found", box, score: .72 }, actual_box: box, result: { winner: "ai", iou: 1, iou_threshold: .5 }, model: { id: "google/owlvit-base-patch16", threshold: .1, inference_ms: 1300 } });
test("create uploads both canonical images and a separately stored normalized answer", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, options) => {
    calls++; assert.equal(String(url), "http://localhost:4011/rounds");
    assert.equal((options!.headers as Record<string, string>)["Idempotency-Key"], "same-round-key");
    const form = options!.body as FormData;
    assert.deepEqual([...form.keys()], ["reference_image", "scene_image", "actual_box"]);
    assert.equal((form.get("scene_image") as File).type, "image/jpeg");
    assert.equal(await (form.get("reference_image") as File).text(), "pixels");
    assert.deepEqual(JSON.parse(form.get("actual_box") as string), box);
    return Response.json({ round_id: "round-1", state: "ready" });
  };
  assert.equal(await createApi("http://localhost:4011", 1000, fetcher).create(photo, photo, box, "same-round-key", new AbortController().signal), "round-1");
  assert.equal(calls, 1);
});
test("seek sends no answer or images, and reveal validates the server score", async () => {
  const fetcher: typeof fetch = async (url, options) => {
    if (String(url).endsWith("/seek")) { assert.equal(options!.body, undefined); return Response.json({ round_id: "round-1", state: "complete" }); }
    return Response.json(reveal());
  };
  const api = createApi("http://localhost:4011", 1000, fetcher);
  await api.seek("round-1", new AbortController().signal);
  assert.equal((await api.reveal("round-1", box, new AbortController().signal)).result.winner, "ai");
});
test("not found is valid; wrong-round, malformed, and dishonest scoring responses fail", () => {
  const data = reveal();
  assert.equal(parseReveal({ ...data, prediction: { status: "not_found", box: null, score: null }, result: { winner: "player", iou: 0, iou_threshold: .5 } }, "round-1", box).prediction.status, "not_found");
  for (const changed of [
    { round_id: "other" }, { actual_box: [0, 0, 1, 1] },
    { prediction: { status: "found", box: [20, 20, 80, 80], score: .7 } },
    { prediction: { status: "found", box, score: 72 } },
    { result: { winner: "player", iou: 1, iou_threshold: .5 } },
  ]) assert.throws(() => parseReveal({ ...data, ...changed }, "round-1", box));
});
test("HTTP, invalid JSON, network, and timeouts stay explicit and recoverable", async () => {
  for (const [fetcher, message] of [
    [async () => new Response("failed", { status: 503 }), /HTTP 503/],
    [async () => new Response("not json"), /unreadable JSON/],
    [async () => { throw new TypeError("network"); }, /Couldn’t reach/],
  ] as const) await assert.rejects(createApi("http://localhost:4011", 20, fetcher as typeof fetch).seek("round-1", new AbortController().signal), message);
  const slow: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => options!.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  await assert.rejects(createApi("http://localhost:4011", 10, slow).seek("round-1", new AbortController().signal), /too long/);
});

test("reveal rejects obsolete threshold and mismatched AI dimensions", () => {
  const data = reveal();
  assert.throws(() => parseReveal({ ...data, result: { ...data.result, iou_threshold: .3 } }, "round-1", box));
  assert.throws(() => parseReveal({ ...data, prediction: { ...data.prediction, box: [.3, .3, .7, .7] } }, "round-1", box), /width and height/);
});
