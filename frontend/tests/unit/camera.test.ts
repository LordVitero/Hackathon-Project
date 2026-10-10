import test from "node:test";
import assert from "node:assert/strict";
import { Camera } from "../../lib/camera.ts";
function setup(getUserMedia: () => Promise<MediaStream>) {
  const video = { srcObject: null, play: async () => {} } as unknown as HTMLVideoElement;
  return new Camera(video, { getUserMedia } as unknown as MediaDevices);
}
test("camera stops active tracks and late permission grants after cancellation", async () => {
  let stops = 0, resolve!: (stream: MediaStream) => void;
  const stream = { getTracks: () => [{ stop() { stops++; } }] } as unknown as MediaStream;
  const camera = setup(() => new Promise(r => { resolve = r; }));
  const pending = camera.open(); camera.stop(); resolve(stream); assert.equal(await pending, false); assert.equal(stops, 1);
  const active = setup(async () => stream); assert.equal(await active.open(), true); active.stop(); assert.equal(stops, 2); assert.equal(active.video.srcObject, null);
});
test("denied permission gives an upload alternative", async () => {
  const camera = setup(async () => { throw new DOMException("Denied", "NotAllowedError"); });
  await assert.rejects(camera.open(), /Upload a photo instead/); assert.equal(camera.stream, null);
});
