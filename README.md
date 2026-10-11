# Hide Lenny

Frontend for the Knight Hacks IX photo hide-and-seek game, built to the [supplied project outline](docs/project-outline.md). Next.js, TypeScript, and Tailwind CSS; no accounts, lobbies, multiplayer, or live video detection. See [verification results](docs/VERIFICATION.md) for the completed checks and integration limits.

The app uses the supplied Lenny SVG in `frontend/public/lenny.svg` for its mascot and browser icon.

## Run locally

Requires Node.js 22.18+ and npm. The checked-in lockfile pins frontend dependency versions.

```powershell
npm ci --prefix frontend
npm run dev
```

Open **http://127.0.0.1:3000**. Start by choosing a tightly cropped reference photo of the actual green 3D-printed Lenny dragon. Then photograph or upload a hiding scene, draw Lenny's actual box, lock one guess, reveal both boxes, and rematch.

With no backend URL, the frontend explicitly runs a **local simulated demo**. Its fixed example box is independent of the marked answer. No photos are uploaded and demo scores stay separate from real model scores. This is a UI demo, not evidence of model feasibility.

### Test from a phone

Connect the computer and phone to the same Wi-Fi. Stop the existing server, run `ipconfig` to find the computer's Wi-Fi IPv4 address, then run these commands from `frontend` (replace the example IP with yours):

```powershell
$env:LENNY_DEV_ALLOWED_ORIGINS = "192.168.1.25"
npx.cmd next dev --hostname 0.0.0.0 --port 3000
```

Open `http://192.168.1.25:3000` on the phone. The allowed origin lets Next.js serve development updates at that address. Narrow screens stack action buttons and box sliders; touch devices get taller slider controls. Test photo upload, touch annotation, reveal, and rotation in demo mode. Round IDs support local HTTP, but camera access needs HTTPS. A real backend must use a URL reachable by the phone and allow this frontend origin through CORS; `localhost` on the phone refers to the phone itself.

## Connect the backend

Copy `frontend/.env.example` to `frontend/.env.local` and set:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_LENNY_REFERENCE_URL=/lenny-reference.jpg
```

Put the **real, team-selected cropped reference photo** at `frontend/public/lenny-reference.jpg`. No real photo was supplied during this implementation, so none is fabricated or bundled. Without a configured default, players choose their reference in the UI. Select this reference and freeze model settings after the outline's feasibility milestone. Restart Next.js after configuration changes; public environment values are embedded at build time.

The backend must implement [the proposed integration contract](docs/API_CONTRACT.md). The outline specifies endpoint names and box conventions but not complete JSON schemas; this document fills those gaps for team agreement. Update the adapter and contract together if the backend team chooses different field names.

Use HTTPS for both applications in deployment. The FastAPI service must permit the frontend's exact origin, `GET/POST/OPTIONS`, and `Content-Type` plus `Idempotency-Key` headers. The frontend contains no credentials or model secrets. Model weights, player uploads, and environment files must stay out of Git.

## How rounds work

- The player marks a recognizable, physically hidden Lenny before seeking. A teammate or judge verifies fairness; annotation does not verify it automatically.
- The browser orients each input, resizes the full image to exactly 960 × 960 pixels (stretching rectangular photos), and converts to JPEG. The displayed scene is the exact JPEG uploaded; normalized boxes refer to that complete image.
- Before seeking, the actual box is editable by dragging a new box or changing four keyboard-accessible edge sliders. After seeking starts, it is frozen.
- Creation retries reuse an idempotency key. Seek retries reuse the round ID. The backend must lock and deduplicate inference; browser cancellation may not cancel server computation.
- Seek locks a prediction without revealing it. Reveal returns both boxes and the server's score. A valid `not_found` awards a player point. A failed request never awards a point.
- IoU is checked against the response's scoring threshold. The fixed winning threshold is 0.50, and the AI box matches the user box dimensions.
- Detection scores are displayed as model scores, never probabilities of correctness. Review confirmations and adjusted review boxes are session-local notes; they do not submit feedback, retrain the model, or alter the locked answer or score.
- Rematch clears the current scene, prediction, and marked answer while keeping the reference, session scores, and the last five scenes. Session state resets on refresh. The backend controls its own data retention.

## Checks

```powershell
npm test
npm --prefix frontend run typecheck
npm run test:browser
npm run build
```

Browser checks use a **test-only API**, synthetic coordinate fixtures, simulated camera input, and an installed Chrome or Edge when detected. Set `LENNY_BROWSER_PATH` to a browser executable if needed, or install Playwright Chromium with `npx --prefix frontend playwright install chromium`. Screenshots are generated in `frontend/artifacts/`. Test fixtures are not prerecorded real-model examples.

Unit tests cover normalized geometry, correct/missed/oversized boxes, strict response validation, timeout/error recovery, idempotent retries, stale responses, cancellation, image disposal, and camera lifecycle. Browser tests cover actual multipart uploads, portrait/landscape/panorama/EXIF photos, 320px and 390px layouts, pointer and keyboard annotation, score/history, denied camera access, repeated capture, track cleanup, slow inference, replacing a scene during a request, and automated accessibility checks.

## Demo validation still required

The Python backend implements uploads, CPU OWL-ViT inference, shared seek jobs,
immutable reveals, and the 50% IoU rule. Before presenting, evaluate held-out
Lenny scenes, measure CPU latency, and test a second real device. Detection
threshold 0.1 is provisional; the winning IoU threshold is fixed at 0.50.
The public OWL-ViT model is Apache-2.0; preserve applicable notices when distributing it.

## Local CPU model backend

See [backend setup](backend/README.md) for installation and startup. The backend
now connects OWL-ViT to seek/reveal with immutable scoring and retry protection.
Set `NEXT_PUBLIC_API_BASE_URL=/api` in `frontend/.env.local` to use it; restart
the frontend. The local Next.js proxy forwards to Python on port 8000.
Model accuracy and demo latency still require real-image evaluation.
