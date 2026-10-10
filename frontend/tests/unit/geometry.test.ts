import test from "node:test";
import assert from "node:assert/strict";
import { boxFromPoints, intersectionOverUnion, pointFromClient, validBox } from "../../lib/geometry.ts";

test("normalized points remain identical for portrait, landscape, mobile, and wide images", () => {
  for (const [width, height] of [[600, 900], [1000, 500], [300, 450], [340, 85]]) {
    const rect = { left: 37, top: 108, width, height };
    const point = pointFromClient(37 + width * .25, 108 + height * .8, rect)!;
    assert.ok(Math.abs(point[0] - .25) < .00001);
    assert.ok(Math.abs(point[1] - .8) < .00001);
  }
  assert.deepEqual(pointFromClient(-10, 500, { left: 0, top: 0, width: 100, height: 100 }), [0, 1]);
  assert.equal(pointFromClient(1, 1, { left: 0, top: 0, width: 0, height: 1 }), null);
});
test("boxes support reverse drawing and reject empty or out-of-bounds geometry", () => {
  assert.deepEqual(boxFromPoints([.8, .9], [.1, .2]), [.1, .2, .8, .9]);
  assert.equal(boxFromPoints([.2, .2], [.2, .3]), null);
  for (const box of [[0, 0, 1, 1], [.1, .1, .2, .2]]) assert.ok(validBox(box));
  for (const box of [[-.1, 0, 1, 1], [0, 0, Infinity, 1], [0, 0, 0, 1], [1, 1, 0, 0], [0, 0, "1", 1]]) assert.equal(validBox(box), false);
});
test("IoU scores exact, missed, and oversized predictions correctly", () => {
  assert.equal(intersectionOverUnion([.4, .4, .6, .6], [.4, .4, .6, .6]), 1);
  assert.equal(intersectionOverUnion([0, 0, .2, .2], [.4, .4, .6, .6]), 0);
  assert.ok(Math.abs(intersectionOverUnion([0, 0, 1, 1], [.4, .4, .6, .6]) - .04) < .00001);
});
