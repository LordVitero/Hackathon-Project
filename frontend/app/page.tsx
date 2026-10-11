"use client";
import { useEffect, useRef, useState } from "react";
import { Mascot } from "../components/Mascot";
import { PhotoBoard } from "../components/PhotoBoard";
import { createApi } from "../lib/api";
import { Camera } from "../lib/camera";
import { capturePhoto, preparePhoto } from "../lib/photo";
import { Round, type State } from "../lib/round";
import type { Box } from "../lib/geometry";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";
const REFERENCE_URL = process.env.NEXT_PUBLIC_LENNY_REFERENCE_URL ?? "";

export default function Home() {
  const roundRef = useRef<Round | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [demo, setDemo] = useState(!API_BASE);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [captureBusy, setCaptureBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewBox, setReviewBox] = useState<Box | null>(null);
  const sceneInput = useRef<HTMLInputElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const camera = useRef<Camera | null>(null);
  const loadSequence = useRef(0);
  const title = useRef<HTMLHeadingElement>(null);
  const cameraButton = useRef<HTMLButtonElement>(null);
  const cameraTitle = useRef<HTMLHeadingElement>(null);
  const wasCameraOpen = useRef(false);
  const previousPhase = useRef("");
  const previousReference = useRef(false);

  useEffect(() => {
    const round = new Round(createApi(API_BASE), !API_BASE, next => setState({ ...next }));
    roundRef.current = round; setState({ ...round.state });
    camera.current = new Camera(video.current!, navigator.mediaDevices);
    const stopCamera = () => {
      camera.current?.stop(); setCameraOpen(false); setCameraReady(false); setCaptureBusy(false);
    };
    const visibility = () => { if (document.visibilityState === "hidden") stopCamera(); };
    const leave = () => { stopCamera(); if (["seeking", "revealing"].includes(round.state.phase)) round.cancel(); else round.invalidate(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    let alive = true;
    if (REFERENCE_URL) {
      const sequence = ++loadSequence.current;
      fetch(REFERENCE_URL).then(response => {
        if (!response.ok) throw new Error("The default Lenny photo is unavailable. Choose a reference photo to continue.");
        return response.blob();
      }).then(preparePhoto).then(photo => {
        if (!alive || sequence !== loadSequence.current) photo.dispose(); else round.loadReference(photo);
      }).catch(error => { if (alive && sequence === loadSequence.current) round.change({ error: error.message }); });
    }
    return () => {
      alive = false; loadSequence.current++; camera.current?.stop(); round.dispose();
      document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", leave);
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const changed = previousPhase.current !== state.phase;
    if (changed && ["annotating", "interrupted", "locked", "revealed"].includes(state.phase)) title.current?.focus({ preventScroll: true });
    if (changed && state.phase === "empty" && previousPhase.current !== "") cameraButton.current?.focus();
    if (state.reference && !previousReference.current) cameraButton.current?.focus();
    previousPhase.current = state.phase; previousReference.current = !!state.reference;
  }, [state]);

  useEffect(() => {
    if (cameraOpen) cameraTitle.current?.focus();
    else if (wasCameraOpen.current) cameraButton.current?.focus();
    wasCameraOpen.current = cameraOpen;
  }, [cameraOpen]);

  function closeCamera() {
    camera.current?.stop(); setCameraOpen(false); setCameraReady(false); setCaptureBusy(false);
  }
  async function openCamera() {
    loadSequence.current++; roundRef.current?.clearScene();
    setCameraError(""); setReviewing(false); setCameraOpen(true); setCameraReady(false);
    try { if (await camera.current!.open()) setCameraReady(true); }
    catch (error) { setCameraError((error as Error).message); closeCamera(); cameraButton.current?.focus(); }
  }
  async function loadPhoto(file: Blob, reference = false) {
    const round = roundRef.current!;
    const sequence = ++loadSequence.current;
    const epoch = round.beginLoad();
    closeCamera(); setCameraError(""); setReviewing(false);
    try {
      const photo = await preparePhoto(file);
      if (sequence !== loadSequence.current) { photo.dispose(); return; }
      if (reference) round.loadReference(photo); else round.loadScene(epoch, photo);
    } catch (error) { if (sequence === loadSequence.current) round.failLoad(epoch, error as Error); }
  }
  async function capture() {
    if (captureBusy || !cameraReady) return;
    setCaptureBusy(true);
    const sequence = loadSequence.current;
    try {
      const file = await capturePhoto(video.current!);
      if (sequence !== loadSequence.current || !camera.current?.stream) return;
      await loadPhoto(file);
    } catch (error) { setCameraError((error as Error).message); }
    finally { setCaptureBusy(false); }
  }
  function rematch() {
    loadSequence.current++; closeCamera(); roundRef.current!.clearScene(); setReviewing(false); setReviewBox(null);
    if (sceneInput.current) sceneInput.current.value = "";
  }
  function uploadScene() { loadSequence.current++; closeCamera(); sceneInput.current?.click(); }
  const ready = !!state?.reference;
  const phase = state?.phase ?? "empty";
  const hasScene = !!state?.scene;
  const busy = phase === "seeking" || phase === "revealing";
  const reveal = state?.reveal;
  const scores = state ? (demo ? state.demoScores : state.scores) : { ai: 0, player: 0 };
  const historyItem = state?.history.find(h => h.reveal.round_id === state.id);
  const headings: Record<string, string> = {
    annotating: "Show us where Lenny is.", seeking: "A little dragon. A big search.",
    interrupted: "Let’s finish this round.", locked: "One guess. No peeking.", revealing: "Here comes the reveal…",
    revealed: demo ? (reveal?.result.winner === "ai" ? "The demo guess found Lenny." : "You beat the demo guess!") : (reveal?.result.winner === "ai" ? "Found you, little dragon!" : "A sneaky spot. You win!"),
  };

  return <div className="app-shell" data-ready={!!state}>
    <header className="site-header">
      <a className="skip-link" href="#game">Skip to game</a>
      <div className="wordmark"><Mascot /><span>hide lenny<span className="wordmark-dot">.</span></span></div>
      <span className="header-note">{state && state.history.length > 0 ? <>{demo ? "Demo" : "Session"} · You {scores.player} / AI {scores.ai}</> : "a little hide & seek"}</span>
    </header>
    <main id="game" tabIndex={-1} className={hasScene || cameraOpen ? "active-game" : ""}>
      {!hasScene && !cameraOpen && <section className="intro" aria-labelledby="intro-title">
        <p className="eyebrow">CAN YOU HIDE HIM IN PLAIN SIGHT?</p>
        <h1 id="intro-title">You hide.<br /><span>AI seeks.</span></h1>
        <p className="intro-copy">A little green dragon. A sneaky hiding spot.<br className="desktop-break" /> Take a photo and see who wins.</p>
      </section>}
      <section className="game" aria-label="Hide Lenny round">
        <div className="reference-strip">
          {state?.reference ? <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.reference.url} alt="The reference photo the model will seek" width="52" height="52" />
            <div><strong>Meet the target.</strong><span>Your reference photo of Lenny</span></div>
            <button className="text-button ml-auto" type="button" onClick={() => referenceInput.current?.click()}>Change reference</button>
          </> : <>
            <div><strong>First, show us Lenny.</strong><span>Choose a tightly cropped photo of your green dragon.</span></div>
            <button className="button secondary" type="button" disabled={!state || phase === "preparing"} onClick={() => referenceInput.current?.click()}>Choose reference</button>
          </>}
        </div>
        <p className={demo ? "mode-note demo-note" : "mode-note"}>
          {demo ? "Demo mode · simulated AI box, local photos, separate demo score. No model is connected." : "AI mode · photos go to the configured backend only when you lock the guess."}
        </p>
        {API_BASE && !hasScene && !cameraOpen && <label className="demo-choice"><input type="checkbox" checked={demo} onChange={e => {
          rematch(); roundRef.current!.demo = e.target.checked; setDemo(e.target.checked);
        }} /> Try a simulated round</label>}
        {!hasScene && !cameraOpen && <div className="empty-photo">
          <Mascot large /><h2>Where will you hide him?</h2>
          <p>Keep one Lenny visible and recognizable in your photo.<br /> Clutter is fair game. Completely covering him isn’t.</p>
          <div className="actions">
            <button ref={cameraButton} className="button primary" type="button" disabled={!ready || phase === "preparing"} onClick={openCamera}>Take a photo</button>
            <button className="button secondary" type="button" disabled={!ready || phase === "preparing"} onClick={uploadScene}>Upload a scene</button>
          </div>
          <p className="small-note">{ready ? "Camera opens only when you choose. JPEG, PNG or WebP · up to 12 MB." : "Choose your reference photo above to start."}</p>
        </div>}
        <div className="camera-panel" hidden={!cameraOpen}>
          <h1 ref={cameraTitle} tabIndex={-1}>Get Lenny in the picture.</h1><p>Keep the hiding spot in view. This is a still-photo game.</p>
          <video ref={video} autoPlay playsInline muted aria-label="Live camera preview" />
          <div className="actions">
            <button className="button primary" type="button" disabled={!cameraReady || captureBusy} onClick={capture}>Capture photo</button>
            <button className="button secondary" type="button" onClick={uploadScene}>Upload instead</button>
            <button className="text-button" type="button" onClick={() => { loadSequence.current++; closeCamera(); cameraButton.current?.focus(); }}>Cancel camera</button>
          </div><p role="status">{cameraReady ? "Camera ready." : "Waiting for camera access…"}</p>
        </div>
        {state?.scene && <div className="round">
          <div className="photo-topline"><span>Your hiding spot</span><button className="text-button" type="button" onClick={() => sceneInput.current?.click()}>Replace photo</button></div>
          <PhotoBoard photo={state.scene} actual={reviewing ? reviewBox : state.actual} prediction={reveal?.prediction.box}
            editable={phase === "annotating" || reviewing} onChange={box => reviewing ? setReviewBox(box) : roundRef.current!.annotate(box)} />
          {phase === "revealed" && <div className="legend"><span className="actual-key">Lenny’s actual spot</span><span className="prediction-key">{reveal?.prediction.status === "not_found" ? "AI: not found (no box)" : "AI’s locked guess"}</span></div>}
          <div className="round-controls">
            <h1 ref={title} tabIndex={-1}>{headings[phase]}</h1>
            {phase === "annotating" && <>
              <p>Mark Lenny’s actual spot before the AI gets its one guess.<br /> This answer is stored separately and must never guide detection.</p>
              <div className="actions"><button className="button primary" type="button" disabled={!state.actual || !ready} onClick={() => roundRef.current!.seek()}>{demo ? "Lock demo guess" : "Lock AI guess"}</button></div>
              <p className="small-note">Your box will be frozen for this round. A teammate or judge confirms fair hiding.</p>
            </>}
            {phase === "interrupted" && <><p>The marked answer is frozen. Retrying recovers the same round and prediction.</p><div className="actions"><button className="button primary" type="button" onClick={() => roundRef.current!.seek()}>Retry this round</button></div></>}
            {busy && <><p>{phase === "seeking" ? "Model inference can take a moment. Your marked answer is locked." : "Retrieving both boxes and the server’s score."}</p><div className="actions"><button className="button secondary" type="button" onClick={() => roundRef.current!.cancel()}>Cancel request</button></div></>}
            {phase === "locked" && <><p>The guess is locked. Let’s see how well you hid Lenny.</p><div className="actions"><button className="button primary" type="button" onClick={() => roundRef.current!.reveal()}>Reveal the guess</button></div></>}
            {phase === "revealed" && reveal && <>
              <p>{reveal.prediction.status === "not_found" ? "The model returned a valid “not found” result. You win this round." : reveal.result.winner === "ai" ? "The guess overlaps your marked spot enough to win." : "The guess missed your marked spot. Nicely hidden."}</p>
              <p className="small-note">AI uses your box size; finds its own location. Wins at 50% IoU. Box overlap (IoU): {reveal.result.iou.toFixed(2)} · Winning threshold: {reveal.result.iou_threshold.toFixed(2)}{demo ? " (demo rule)" : ""}</p>
              {reveal.prediction.status === "found" && <p className="small-note">Detection score: {reveal.prediction.score.toFixed(2)}. This is a model score, not a probability of correctness.</p>}
              {!demo && <details className="model-details"><summary>Model details</summary><p>{reveal.model.id} · Detection threshold {reveal.model.threshold} · {(reveal.model.inference_ms / 1000).toFixed(1)}s inference</p></details>}
              {reviewing ? <>
                <p>Adjust the box above for teammate review. This note won’t change the locked answer or score.</p>
                <div className="actions"><button className="button secondary" type="button" disabled={!reviewBox} onClick={() => { roundRef.current!.review("Flagged for teammate review", reviewBox!); setReviewing(false); title.current?.focus(); }}>Keep review note</button><button className="text-button" type="button" onClick={() => setReviewing(false)}>Cancel review</button></div>
              </> : <>
                <div className="actions"><button className="button primary" type="button" onClick={rematch}>Hide Lenny again</button></div>
                <div className="review-actions"><button className="text-button" type="button" onClick={() => roundRef.current!.review("Player confirmed the result")}>Looks right</button><button className="text-button" type="button" onClick={() => { setReviewBox(historyItem?.reviewBox ?? state.actual); setReviewing(true); }}>Flag for review</button></div>
              </>}
              {historyItem?.note && <p className="small-note">{historyItem.note} · kept in this session only</p>}
            </>}
          </div>
        </div>}
        <input ref={referenceInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Reference photo upload" tabIndex={-1} onChange={e => {
          const file = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (file) loadPhoto(file, true);
        }} />
        <input ref={sceneInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Scene photo upload" tabIndex={-1} onChange={e => {
          const file = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (file) loadPhoto(file);
        }} />
        {(state?.error || cameraError) && <p className="error-message" role="alert">{state?.error || cameraError}</p>}
        <p className="status-message" role="status" aria-live="polite" aria-atomic="true">{state?.status}</p>
      </section>
      {!hasScene && !cameraOpen && <p className="how-it-works">Hide <span aria-hidden="true">→</span> Mark <span aria-hidden="true">→</span> Lock <span aria-hidden="true">→</span> Reveal <span aria-hidden="true">→</span> Rematch</p>}
      {state && state.history.length > 0 && <section className="history" aria-labelledby="history-title">
        <div className="history-heading"><h2 id="history-title">The hiding spots so far</h2><span>Last {state.history.length} · this session</span></div>
        <ol className="history-grid">{state.history.map(item => <li key={item.reveal.round_id}>
          <PhotoBoard photo={item.photo} actual={item.reveal.actual_box} prediction={item.reveal.prediction.box} compact />
          <p><strong>{item.reveal.result.winner === "ai" ? "AI found Lenny" : "You hid Lenny"}</strong><span>{item.demo ? "Simulated demo" : "Real model round"} · IoU {item.reveal.result.iou.toFixed(2)}</span>{item.note && <span>{item.note}</span>}</p>
        </li>)}</ol>
        <p className="small-note">Scores and review notes last until you refresh. Photos stay only for this session; the last five scenes are shown.</p>
      </section>}
    </main><footer>Small hiding spots. Big adventures.</footer>
  </div>;
}
