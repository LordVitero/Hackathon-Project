# Frontend verification — October 10, 2026

## Current frontend audit

- **17 unit tests, all 11 browser scenarios, strict TypeScript, and the production build passed.** The browser suite completed with exit code 0.
- Both reference and scene uploads were decoded by the test API as 960 × 960 JPEGs. PNG and WebP conversion, white compositing of transparency, EXIF inputs, empty/oversized/unsupported/corrupt files, and recovery with a valid upload were checked.
- Fixed round creation on local HTTP: browsers may omit `crypto.randomUUID`, so the frontend generates UUIDs with `crypto.getRandomValues` instead. The regression failed before the fix, and unit/browser regressions now pass.
- Added optional `LENNY_DEV_ALLOWED_ORIGINS` configuration for phone testing. A complete demo round through the computer's Wi-Fi HTTP address passed in a touch-enabled 390px Chrome context, with 960 × 960 images, no horizontal overflow, no page errors, and a connected development-update socket. This is browser emulation, not a physical-phone test.
- Camera capture and cleanup use actual browser video tracks from a generated canvas stream. This replaces an unreliable Chrome fake device that intermittently reported no camera; the cleanup test passed twice in isolation and in the complete suite. Physical camera behavior remains unverified.
- The development server was restored without the test API URL. Current desktop/mobile screenshots are available under `frontend/artifacts/`.

## Initial frontend verification

- **16 unit tests:** normalized box coordinates, reverse drawing, invalid geometry, IoU for exact/missed/oversized predictions, strict reveal parsing, multipart image fields, HTTP/JSON/network/timeout errors, duplicate actions, cancellation, out-of-order responses, idempotency-key reuse, round-ID reuse, stale image disposal, frozen answers, separate demo scores, bounded history, and active/late camera-track cleanup.
- **7 browser scenarios:** installed Chrome on Windows against the test-only loopback API. Both JPEG images actually reached that endpoint; seek requests contained no marked answer. Portrait, landscape, panorama, and EXIF orientation-6 sources stayed aligned at desktop, 390px, and 320px widths. The added 3200px image check verified the uploaded 2400px canonical JPEG. Pointer-drawn and keyboard-adjusted boxes matched uploaded normalized coordinates.
- **Camera checks:** no request before a click, denied permission with a working upload, repeated capture, cancelling the preview, switching to upload, and page hiding. Browser camera input was simulated; tracks were verified ended.
- **Request/reveal checks:** slow requests, cancel/retry, replacing a photo during inference, one locked result in the fixture, valid not-found, inference failure, reveal failure, retry without duplicate scoring, rematch clearing, and side-by-side history.
- **Human review:** confirmations and adjusted review boxes are session-only notes. Saved corrections reopen with their adjustments intact. No feedback submission or learning is claimed, and frozen scores remain unchanged.
- **Accessibility:** axe reported zero violations in the tested annotation, reveal, and mobile demo states; keyboard sliders, labels, heading hierarchy, status/error regions, image overflow, and visible focus styles were checked. Screenshots were inspected and the exposed file inputs and development indicator were removed from the layout.
- **Build:** route type generation, strict TypeScript check, and Next.js production build passed with the final application changes. The build prerenders the homepage.

The full seven-scenario browser suite passed; the subsequently added large-image and saved-review cases also passed targeted reruns. Screenshots are generated locally at `frontend/artifacts/desktop-start.png`, `desktop-reveal.png`, and `mobile-reveal.png`. They depict synthetic coordinate fixtures, not real Lenny inference results.

## Local annotation review follow-up

Reused Alex’s frontend from `106b3bd` and kept the artwork update in `224cd16`. The only feature-code change is in `PhotoBoard`: the pointer that starts a rectangle now keeps control of it, so a second finger cannot replace or finish that drag. Canceled/lost pointers and changes of photo or edit mode clear the unfinished drawing.

The 16 unit tests, full 8-scenario browser suite, and production build passed locally. After the artwork update, the local demo and touch scenarios and the production build passed again. The added browser scenario checks backward mouse drawing, clear/redraw, actual Chromium touch input with a second finger, alignment after resizing to 390px and 320px and back to desktop, and zero photo-upload requests in demo mode. These touch inputs are simulated; a physical phone remains untested. Existing desktop and mobile screenshots were inspected.

## Remaining unverified / team handoff

- No real Lenny reference photo was supplied. Default-photo configuration is ready; reference upload is usable meanwhile.
- No FastAPI/OWL-ViT backend exists in the supplied repository. The proposed exact schemas require team agreement. Real inference, model readiness, backend concurrency/idempotency, answer isolation, retention, and deployed CORS are unverified.
- The model feasibility milestone, held-out real-scene evaluation, tested thresholds, Lenny framing guidance, and sponsor/model distribution requirements remain team work.
- No production deployment, second physical phone, Safari/iOS camera session, or manual screen-reader audit was performed. Mobile browser layouts were tested by resizing Chrome; this does not establish physical-device camera behavior.
- No server feedback or fine-tuning endpoint is part of the outline; review actions remain local and are explicitly labeled.

The frontend is ready for backend integration. The full deployed, real-model project is not represented as finished.
