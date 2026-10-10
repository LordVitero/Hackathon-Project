"use client";
import { useRef, useState } from "react";
import { boxFromPoints, boxStyle, clamp, pointFromClient, type Box } from "../lib/geometry";
import type { Photo } from "../lib/photo";
export function PhotoBoard({ photo, actual, prediction, editable = false, onChange, compact = false }: {
  photo: Photo; actual: Box | null; prediction?: Box | null; editable?: boolean; onChange?: (box: Box | null) => void; compact?: boolean;
}) {
  const image = useRef<HTMLImageElement>(null);
  const start = useRef<readonly [number, number] | null>(null);
  const moved = useRef(false);
  const [draft, setDraft] = useState<Box | null>(null);
  const displayed = draft ?? actual;
  function point(e: React.PointerEvent) { return image.current ? pointFromClient(e.clientX, e.clientY, image.current.getBoundingClientRect()) : null; }
  function changeEdge(index: number, value: number) {
    const box = [...(actual ?? [.4, .4, .6, .6])] as [number, number, number, number];
    if (index < 2) box[index] = clamp(value, 0, box[index + 2] - .005);
    else box[index] = clamp(value, box[index - 2] + .005, 1);
    onChange?.(box);
  }
  return <div className={compact ? "board compact" : "board"}>
    <figure className={editable ? "photo-stage editable" : "photo-stage"}
      onPointerDown={e => {
        if (!editable || e.button !== 0) return;
        const p = point(e); if (!p) return;
        start.current = p; moved.current = false; setDraft(null);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={e => {
        if (!editable || !start.current) return;
        const p = point(e); if (!p) return;
        const box = boxFromPoints(start.current, p);
        if (box) { moved.current = true; setDraft(box); }
      }}
      onPointerUp={e => {
        if (!editable || !start.current) return;
        const p = point(e);
        const box = p ? boxFromPoints(start.current, p) : null;
        if (moved.current && box) onChange?.(box);
        start.current = null; setDraft(null);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => { start.current = null; setDraft(null); }}
    >
      {/* Native image preserves the exact submitted pixels and intrinsic aspect ratio. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={image} src={photo.url} width={photo.width} height={photo.height} alt={compact ? "Previous hiding scene" : "Your scene photo of Lenny’s hiding spot"} draggable={false} />
      {displayed && <div className="box actual-box" data-testid="actual-box" style={boxStyle(displayed)}><span className="box-label">Lenny</span></div>}
      {prediction && <div className="box prediction-box" data-testid="prediction-box" style={boxStyle(prediction)}><span className="box-label">AI guess</span></div>}
    </figure>
    {editable && <div className="annotation-tools">
      <p id="box-help">Drag a box around Lenny. Redraw it to change it, or adjust each edge below.</p>
      <div className="edge-controls">
        {["Left edge", "Top edge", "Right edge", "Bottom edge"].map((label, i) => <label key={label}>{label}
          <input type="range" min="0" max="1000" step="1" value={Math.round((actual ?? [.4, .4, .6, .6])[i] * 1000)} aria-describedby="box-help"
            onChange={e => changeEdge(i, Number(e.target.value) / 1000)} aria-valuetext={Math.round((actual ?? [.4, .4, .6, .6])[i] * 100) + " percent"} />
        </label>)}
      </div>
      <button className="text-button" type="button" onClick={() => onChange?.([.4, .4, .6, .6])}>Start with a centered box</button>
      {actual && <button className="text-button" type="button" onClick={() => onChange?.(null)}>Clear box</button>}
    </div>}
  </div>;
}
