import test from "node:test";
import assert from "node:assert/strict";
import { boxFromPoints, intersectionOverUnion, matchBoxSize, IOU_THRESHOLD, pointFromClient, validBox } from "../../lib/geometry.ts";

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

test("same-size boxes preserve dimensions at edges and use inclusive 50% IoU", () => {
  for (const box of [[0, 0, .02, .02], [.98, .98, 1, 1]] as const) {
    const adjusted = matchBoxSize(box, .4, .6);
    assert.ok(validBox(adjusted));
    assert.ok(Math.abs(adjusted[2] - adjusted[0] - .4) < 1e-12);
    assert.ok(Math.abs(adjusted[3] - adjusted[1] - .6) < 1e-12);
  }
  const actual = [0, 0, .375, .5] as const;
  assert.equal(intersectionOverUnion([.125, 0, .5, .5], actual), IOU_THRESHOLD);
  assert.ok(intersectionOverUnion([.126, 0, .501, .5], actual) < IOU_THRESHOLD);
});
