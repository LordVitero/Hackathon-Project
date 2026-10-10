// Test-only contract server. This is not the model backend.
import { createServer } from "node:http";
import sharp from "sharp";
let rounds = new Map(), keys = new Map(), counter = 0, settings = {}, events = [];
function iou(a, b) {
  const intersection = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  return intersection / ((a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - intersection);
}
async function body(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks); }
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3000");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  const send = (data, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/health") return send({ status: "ok", model_ready: false });
    if (path === "/test/reset") { rounds = new Map(); keys = new Map(); counter = 0; events = []; settings = JSON.parse((await body(req)).toString() || "{}"); return send({ ok: true }); }
    if (path === "/test/events") return send(events);
    if (path === "/rounds" && req.method === "POST") {
      const form = await new Response(await body(req), { headers: { "Content-Type": req.headers["content-type"] } }).formData();
      const key = req.headers["idempotency-key"];
      const reference = form.get("reference_image"), scene = form.get("scene_image"), actual = JSON.parse(form.get("actual_box"));
      if (!(reference instanceof Blob) || !(scene instanceof Blob) || reference.type !== "image/jpeg" || scene.type !== "image/jpeg") return send({ error: "Expected two JPEG images" }, 422);
      const meta = await sharp(Buffer.from(await scene.arrayBuffer())).metadata();
      events.push({ action: "create", key, actual, sceneType: scene.type, referenceType: reference.type, width: meta.width, height: meta.height, orientation: meta.orientation ?? 1 });
      let round = keys.get(key);
      if (!round) { round = { id: "round-" + (++counter), actual, sceneMeta: meta, locked: false, settings: { ...settings } }; keys.set(key, round); rounds.set(round.id, round); }
      if (round.settings.createDelay) await new Promise(resolve => setTimeout(resolve, round.settings.createDelay));
      return send({ round_id: round.id, state: "ready" });
    }
    const match = path.match(/^\/rounds\/([^/]+)\/(seek|reveal)$/);
    if (!match) return send({ error: "not found" }, 404);
    const round = rounds.get(match[1]); if (!round) return send({ error: "round expired" }, 404);
    if (match[2] === "seek") {
      const uploaded = await body(req); events.push({ action: "seek", id: round.id, bodyBytes: uploaded.length });
      if (round.settings.failSeekOnce) { round.settings.failSeekOnce = false; return send({ error: "inference failed" }, 503); }
      if (round.settings.seekDelay) await new Promise(resolve => setTimeout(resolve, round.settings.seekDelay));
      if (!round.locked) { round.locked = true; events.push({ action: "inference", id: round.id }); }
      return send({ round_id: round.id, state: "complete" });
    }
    events.push({ action: "reveal", id: round.id });
    if (round.settings.failRevealOnce) { round.settings.failRevealOnce = false; return send({ error: "temporary error" }, 503); }
    if (!round.locked) return send({ error: "not locked" }, 409);
    const box = round.settings.box ?? [.4, .4, .6, .6];
    const overlap = round.settings.notFound ? 0 : iou(box, round.actual);
    return send({ round_id: round.id, state: "complete", actual_box: round.actual,
      prediction: round.settings.notFound ? { status: "not_found", box: null, score: null } : { status: "found", box, score: .82 },
      result: { winner: !round.settings.notFound && overlap >= .3 ? "ai" : "player", iou: overlap, iou_threshold: .3 },
      model: { id: "contract-test-fixture", threshold: .1, inference_ms: 10 } });
  } catch (error) { send({ error: String(error) }, 500); }
});
server.listen(4011, "127.0.0.1", () => console.log("Test-only API http://127.0.0.1:4011"));
process.on("SIGTERM", () => server.close());
