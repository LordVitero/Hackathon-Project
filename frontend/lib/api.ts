import { intersectionOverUnion, validBox, IOU_THRESHOLD, type Box } from "./geometry.ts";
import type { Photo } from "./photo.ts";
export type Prediction = { status: "found"; box: Box; score: number } | { status: "not_found"; box: null; score: null };
export type Reveal = {
  round_id: string; state: "complete"; prediction: Prediction; actual_box: Box;
  result: { winner: "ai" | "player"; iou: number; iou_threshold: number };
  model: { id: string; threshold: number; inference_ms: number };
};
export type RoundApi = {
  create: (reference: Photo, scene: Photo, actual: Box, key: string, signal: AbortSignal) => Promise<string>;
  seek: (id: string, signal: AbortSignal) => Promise<void>;
  reveal: (id: string, actual: Box, signal: AbortSignal) => Promise<Reveal>;
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error("The server returned invalid round data. Check API_CONTRACT.md.");
  return value as Record<string, unknown>;
}
const unit = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
export function parseReveal(value: unknown, id: string, actual: Box): Reveal {
  const data = record(value), p = record(data.prediction), r = record(data.result), m = record(data.model);
  if (data.round_id !== id || data.state !== "complete" || !validBox(data.actual_box) || data.actual_box.some((n, i) => Math.abs(n - actual[i]) > .00001)) throw new Error("The reveal does not match this round’s locked answer.");
  if (!(p.status === "found" && validBox(p.box) && unit(p.score)) && !(p.status === "not_found" && p.box === null && p.score === null)) throw new Error("The server returned an invalid prediction. Expected a normalized box or not_found.");
  if (!unit(r.iou) || !unit(r.iou_threshold) || r.iou_threshold !== IOU_THRESHOLD || !["ai", "player"].includes(String(r.winner))) throw new Error("The server returned an invalid score.");
  if (p.status === "found") {
    const box = p.box as Box;
    if (Math.abs((box[2] - box[0]) - (actual[2] - actual[0])) > .00001 || Math.abs((box[3] - box[1]) - (actual[3] - actual[1])) > .00001) throw new Error("The AI box must match your box's width and height.");
  }
  const iou = p.status === "found" ? intersectionOverUnion(p.box as Box, actual) : 0;
  if (Math.abs(iou - r.iou) > .005 || r.winner !== (p.status === "found" && iou >= r.iou_threshold ? "ai" : "player")) throw new Error("The server’s score does not match the revealed boxes.");
  if (typeof m.id !== "string" || !m.id || !unit(m.threshold) || typeof m.inference_ms !== "number" || !Number.isFinite(m.inference_ms) || m.inference_ms < 0) throw new Error("The server returned invalid model metadata.");
  return data as unknown as Reveal;
}
export function createApi(base: string, timeoutMs = 180000, fetcher: typeof fetch = fetch): RoundApi {
  async function request(path: string, init: RequestInit, signal: AbortSignal) {
    const root = new URL(base.replace(/\/$/, "") + "/", globalThis.location?.href ?? "http://localhost/");
    if (!["http:", "https:"].includes(root.protocol) || root.username || root.password) throw new Error("Configure an HTTP(S) backend URL without embedded credentials.");
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetcher(new URL(path, root), { ...init, signal: controller.signal, headers: { Accept: "application/json", ...init.headers } });
      if (!response.ok) throw new Error(`The server couldn’t complete the request (HTTP ${response.status}). Retry this round; no point has been awarded.`);
      try { return await response.json(); } catch { throw new Error("The server returned unreadable JSON. Retry or check the API contract."); }
    } catch (error) {
      if (timedOut) throw new Error("The server took too long. Retry to recover the same locked round.");
      if (signal.aborted) throw error;
      if (error instanceof TypeError) throw new Error("Couldn’t reach the backend. Check your connection and its CORS settings, then retry.");
      throw error;
    } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  }
  return {
    async create(reference, scene, actual, key, signal) {
      const form = new FormData();
      form.append("reference_image", reference.blob, "lenny-reference.jpg");
      form.append("scene_image", scene.blob, "lenny-scene.jpg");
      form.append("actual_box", JSON.stringify(actual));
      const data = record(await request("rounds", { method: "POST", body: form, headers: { "Idempotency-Key": key } }, signal));
      if (typeof data.round_id !== "string" || !data.round_id || data.state !== "ready") throw new Error("The server did not return a ready round ID.");
      return data.round_id;
    },
    async seek(id, signal) {
      const data = record(await request(`rounds/${encodeURIComponent(id)}/seek`, { method: "POST" }, signal));
      if (data.round_id !== id || data.state !== "complete") throw new Error("The AI prediction is not locked yet. Retry this round.");
    },
    async reveal(id, actual, signal) { return parseReveal(await request(`rounds/${encodeURIComponent(id)}/reveal`, { method: "GET" }, signal), id, actual); },
  };
}
