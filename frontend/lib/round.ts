import { validBox, intersectionOverUnion, type Box } from "./geometry.ts";
import type { Photo } from "./photo.ts";
import type { Reveal, RoundApi } from "./api.ts";
export type Phase = "empty" | "preparing" | "annotating" | "seeking" | "interrupted" | "locked" | "revealing" | "revealed";
export type History = { photo: Photo; reveal: Reveal; demo: boolean; reviewBox?: Box; note?: string };
export type State = {
  phase: Phase; reference: Photo | null; scene: Photo | null; actual: Box | null;
  id: string | null; reveal: Reveal | null; error: string; status: string;
  history: History[]; scores: { ai: number; player: number }; demoScores: { ai: number; player: number };
};
const fresh = (): State => ({ phase: "empty", reference: null, scene: null, actual: null, id: null, reveal: null, error: "", status: "", history: [], scores: { ai: 0, player: 0 }, demoScores: { ai: 0, player: 0 } });
export class Round {
  state = fresh();
  epoch = 0;
  operation = 0;
  key = "";
  controller: AbortController | null = null;
  api: RoundApi;
  demo: boolean;
  onChange: (state: State) => void;
  constructor(api: RoundApi, demo: boolean, onChange: (state: State) => void = () => {}) { this.api = api; this.demo = demo; this.onChange = onChange; }
  change(values: Partial<State>) { this.state = { ...this.state, ...values }; this.onChange(this.state); }
  invalidate() { this.operation++; this.controller?.abort(); this.controller = null; }
  clearScene() {
    this.epoch++; this.invalidate(); this.key = "";
    if (this.state.scene && !this.state.history.some(h => h.photo === this.state.scene)) this.state.scene.dispose();
    this.change({ phase: "empty", scene: null, actual: null, id: null, reveal: null, error: "", status: "" });
  }
  beginLoad() { this.clearScene(); this.change({ phase: "preparing", status: "Preparing your photo…" }); return this.epoch; }
  loadScene(epoch: number, photo: Photo) {
    if (epoch !== this.epoch) { photo.dispose(); return false; }
    this.change({ phase: "annotating", scene: photo, status: "Photo ready. Draw a box around Lenny before locking the guess." });
    return true;
  }
  loadReference(photo: Photo) {
    this.clearScene(); this.state.reference?.dispose();
    this.change({ reference: photo, status: "Reference ready. Now hide Lenny and add your scene photo." });
  }
  failLoad(epoch: number, error: Error) { if (epoch === this.epoch) this.change({ phase: "empty", error: error.message, status: "" }); }
  annotate(box: Box | null) {
    if (this.state.phase === "annotating" && (!box || validBox(box))) this.change({ actual: box, error: "" });
  }
  async seek() {
    if (!["annotating", "interrupted"].includes(this.state.phase) || !this.state.reference || !this.state.scene || !this.state.actual) return;
    this.invalidate();
    const operation = this.operation, epoch = this.epoch;
    const { reference, scene, actual } = this.state;
    this.key ||= crypto.randomUUID();
    const signal = (this.controller = new AbortController()).signal;
    const current = () => operation === this.operation && epoch === this.epoch;
    this.change({ phase: "seeking", error: "", status: this.demo ? "Locking a simulated guess…" : "Uploading photos and asking the model to find Lenny…" });
    try {
      let id = this.state.id;
      if (this.demo) {
        if (!id) { id = "demo-" + this.key; this.change({ id }); }
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); };
          const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 800);
          signal.addEventListener("abort", abort, { once: true });
        });
      } else {
        if (!id) {
          id = await this.api.create(reference, scene, actual, this.key, signal);
          if (!current()) return;
          this.change({ id, status: "Photos received. Waiting for the locked prediction…" });
        }
        await this.api.seek(id, signal);
      }
      if (current()) this.change({ phase: "locked", status: "One guess is locked. Ready for the reveal?" });
    } catch (error) {
      if (current()) this.change({ phase: "interrupted", error: (error as Error).message, status: "No point awarded. Retry to recover this same round." });
    }
  }
  cancel() {
    const revealing = this.state.phase === "revealing";
    this.invalidate();
    this.change({ phase: revealing ? "locked" : "interrupted", error: "", status: "Cancelled on this device. Retrying recovers the same round; the server may still finish its locked guess." });
  }
  async reveal() {
    if (this.state.phase !== "locked" || !this.state.id || !this.state.actual || !this.state.scene) return;
    this.invalidate();
    const operation = this.operation, epoch = this.epoch;
    const { id, actual, scene } = this.state;
    const signal = (this.controller = new AbortController()).signal;
    this.change({ phase: "revealing", error: "", status: "Opening the reveal…" });
    try {
      let reveal: Reveal;
      if (this.demo) {
        // Fixed example box. The actual answer never selects or changes the guess.
        const box: Box = [.36, .32, .59, .57];
        const iou = intersectionOverUnion(box, actual);
        reveal = { round_id: id, state: "complete", actual_box: actual,
          prediction: { status: "found", box, score: .72 },
          result: { winner: iou >= .3 ? "ai" : "player", iou, iou_threshold: .3 },
          model: { id: "simulated-example", threshold: .1, inference_ms: 0 } };
      } else reveal = await this.api.reveal(id, actual, signal);
      if (operation !== this.operation || epoch !== this.epoch) return;
      const history = [...this.state.history, { photo: scene, reveal, demo: this.demo }];
      if (history.length > 5) history.shift()!.photo.dispose();
      const field = this.demo ? "demoScores" : "scores";
      const scores = { ...this.state[field], [reveal.result.winner]: this.state[field][reveal.result.winner] + 1 };
      this.change({ phase: "revealed", reveal, history, [field]: scores, status: this.demo ? "Simulated reveal ready. Only the demo score was updated." : "Reveal ready. The backend’s score is recorded for this session." });
    } catch (error) {
      if (operation === this.operation && epoch === this.epoch) this.change({ phase: "locked", error: (error as Error).message, status: "Reveal failed. Your round is still locked; retry the reveal." });
    }
  }
  review(note: string, reviewBox?: Box) {
    if (this.state.phase !== "revealed") return;
    this.change({ history: this.state.history.map(h => h.reveal.round_id === this.state.id ? { ...h, note, reviewBox } : h), status: "Review note kept for this session only. No feedback was sent and the locked score is unchanged." });
  }
  dispose() {
    this.epoch++; this.invalidate();
    const photos = new Set([...this.state.history.map(h => h.photo), this.state.scene, this.state.reference]);
    photos.forEach(p => p?.dispose());
  }
}
