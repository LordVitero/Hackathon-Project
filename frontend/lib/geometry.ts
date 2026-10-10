export type Box = readonly [number, number, number, number];
export type Rect = { left: number; top: number; width: number; height: number };
export function validBox(value: unknown): value is Box {
  return Array.isArray(value) && value.length === 4 && value.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1) && value[2] > value[0] && value[3] > value[1];
}
export function clamp(n: number, min = 0, max = 1) { return Math.max(min, Math.min(max, n)); }
export function pointFromClient(x: number, y: number, rect: Rect) {
  if (rect.width <= 0 || rect.height <= 0) return null;
  return [clamp((x - rect.left) / rect.width), clamp((y - rect.top) / rect.height)] as const;
}
export function boxFromPoints(a: readonly number[], b: readonly number[]): Box | null {
  const box: Box = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  return validBox(box) && box[2] - box[0] >= .005 && box[3] - box[1] >= .005 ? box : null;
}
export function boxStyle(box: Box) { return { left: `${box[0] * 100}%`, top: `${box[1] * 100}%`, width: `${(box[2] - box[0]) * 100}%`, height: `${(box[3] - box[1]) * 100}%` }; }
export function intersectionOverUnion(a: Box, b: Box) {
  const intersection = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const area = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]);
  return intersection / (area - intersection);
}
