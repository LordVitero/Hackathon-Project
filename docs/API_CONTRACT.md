# Proposed Hide Lenny frontend / FastAPI contract

Implements the proposed defaults in the supplied project outline. **This is a concrete proposal for the backend team, not a claim that a live backend already implements it.** Configured requests use this schema strictly; failures never fall back to simulated success.

## Coordinates and images

Boxes are normalized `[x_min, y_min, x_max, y_max]`, measured from the top-left of the **complete, correctly oriented scene**. Values must be finite numbers in `[0,1]`, with `x_max > x_min` and `y_max > y_min`. `0` and `1` are valid image edges. No CSS cropping, mirrored previews, or letterbox offsets are part of the coordinate system.

The browser applies EXIF orientation, resizes the entire reference and scene images to exactly 960 × 960 pixels without cropping or padding, composites transparency over white, and encodes JPEG at quality 0.92. Rectangular inputs are stretched to square. The same resulting JPEG is previewed and uploaded. The backend must decode/validate both images with Pillow and avoid rotating these canonical images a second time. The actual box refers to the submitted scene, not the original camera file. Uploads accept source JPEG, PNG, and WebP under 12 MB.

Keep `actual_box` in the round/scoring layer. **Detection and candidate selection receive only reference image + scene image.** Never crop to the answer, choose candidates using it, or tune the threshold from it.

## Health

`GET /health`

```json
{"status":"ok","model_ready":true}
```

Health is for deployment checks. A reachable server with `model_ready:false` is not a usable model. The frontend does not assume connectivity or model readiness merely from configured environment values.

## Create a round

`POST /rounds` with multipart form data:

| Field | Value |
|---|---|
| `reference_image` | Canonical JPEG file, `lenny-reference.jpg` |
| `scene_image` | Canonical JPEG file, `lenny-scene.jpg` |
| `actual_box` | JSON string containing the normalized four-number array |

Header: `Idempotency-Key: <client-generated UUID>`. Browsers set the multipart boundary; do not manually set its Content-Type.

Response (200 or 201):

```json
{"round_id":"opaque-round-id","state":"ready"}
```

For repeated creation with the same key and payload, return the **original creation response** and round ID without duplicating the round. Reject a changed payload using the same key. This covers a lost response, timeout, or client cancellation after the upload reached the server. The frontend keeps the key until the photo/round is replaced. Return clear non-2xx errors for invalid files, expired keys, or resource limits. Bind any server-side state to the appropriate deployment/session context.

## Lock one AI guess

`POST /rounds/{round_id}/seek` with **no request body**.

```json
{"round_id":"opaque-round-id","state":"complete"}
```

Hold this request until inference has completed (frontend timeout: 60 seconds per request). Lock one result or valid `not_found`. Simultaneous/repeated seeks must share the same in-flight computation and return the same locked result, with no new random guess. The frontend does not treat `ready` or `seeking` as completion; asynchronous job protocols require an agreed polling adapter.

Return non-2xx on inference failure. Do not encode inference errors as `not_found` or player wins. After failures, a safe retry should recover the existing round. If a backend restarts and loses in-memory state, respond with 404/410 so the frontend can display the error and let the user replace the scene.

## Reveal and score

`GET /rounds/{round_id}/reveal`

```json
{
  "round_id":"opaque-round-id",
  "state":"complete",
  "prediction":{"status":"found","box":[0.40,0.40,0.60,0.60],"score":0.82},
  "actual_box":[0.40,0.40,0.60,0.60],
  "result":{"winner":"ai","iou":1.0,"iou_threshold":0.3},
  "model":{"id":"google/owlvit-base-patch16","threshold":0.1,"inference_ms":1300}
}
```

For a valid miss:

```json
{
  "round_id":"opaque-round-id",
  "state":"complete",
  "prediction":{"status":"not_found","box":null,"score":null},
  "actual_box":[0.40,0.40,0.60,0.60],
  "result":{"winner":"player","iou":0.0,"iou_threshold":0.3},
  "model":{"id":"google/owlvit-base-patch16","threshold":0.1,"inference_ms":1300}
}
```

Detection score and threshold must be finite numbers in `[0,1]`. Model scores are **not calibrated probabilities**. Inference duration is finite nonnegative milliseconds. Model ID must be a nonempty string. Select the highest-scoring valid prediction above a fixed tested threshold, as outlined; the example threshold above is illustrative, not model-tested.

`winner` is `ai` when a found box has IoU at least `iou_threshold`; otherwise it is `player`. A `not_found` result has IoU zero. Threshold must be in `(0,1]`. The frontend recomputes IoU as an integration check, tolerating 0.005 numeric rounding, and verifies the returned actual box matches its locked answer. Invalid responses remain recoverable errors and award no score.

An oversized whole-image prediction does not automatically win: it is subject to the same IoU rule. Freeze the scoring threshold before real gameplay; the outline's 0.3 is provisional.

## Human review and cancellation

The outlined API has no feedback/training endpoint. “Looks right” and “Flag for review” keep notes locally for teammate adjudication. An adjusted review box is kept separately from the scored answer. **No feedback is submitted, no weights change, and no server score is amended.** A future adjudication endpoint requires a separate agreed contract.

Cancellation aborts client fetches and prevents stale results from updating the UI. It does not promise to stop server inference or erase uploaded images. Retry uses the same key/round ID. Replacing the reference or scene starts a new round; late responses from the old round cannot change the new scene or score.

## CORS, deployment, and retention

Allow the actual frontend origin, `GET/POST/OPTIONS`, and `Content-Type, Idempotency-Key` request headers. Use HTTPS for camera access beyond localhost and to avoid mixed-content API failures. Endpoint URLs are public configuration and must contain no secrets. The MVP requires no accounts or browser credentials.

The browser retains at most five scene URLs for history and releases stale image URLs. Refresh loses session state. The backend team must set its own upload/round expiry, concurrency, byte/pixel limits, and retention policy. The frontend does not claim that transmitted photos remain exclusively on the device.
