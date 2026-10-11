# Hide Lenny — Knight Hacks IX

Hide a small green dragon in a photo and challenge an AI to find it. Upload a clear reference photo of Lenny, upload a hiding scene, mark his location, and lock the AI's guess. Reveal both boxes to see who wins.

**The final demo runs on one PC:** a Next.js website and a Python FastAPI backend running Hugging Face's open-source [OWL-ViT](https://huggingface.co/google/owlvit-base-patch16) model on the CPU. AMD cloud access, Jupyter, and a Hugging Face API key are not required. Internet is needed for installation and the first model download.

## Start the demo on the prepared PC

Open this repository in VS Code. Run these in **two separate PowerShell terminals**, from the repository root.

Terminal 1 — model and API:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-backend.ps1
```

Wait for `Model ready on cpu` and `Application startup complete`. Check [backend health](http://127.0.0.1:8000/health): `model_ready` must be `true` before playing.

Terminal 2 — website:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-frontend.ps1
```

This builds and starts the production website using the local API, overriding stale cloud API settings. Open **[http://127.0.0.1:3000](http://127.0.0.1:3000)**. Keep both terminals open; press **Ctrl+C in each** to stop. The address works while the PC and servers are running; it is not a public hosted link.

For frontend editing instead of the presentation build:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-frontend.ps1 -Dev
```

## First-time installation on another Windows PC

Install Python 3.12 and Node.js 22.18 or later, then restart VS Code. From the repository root:

```powershell
python -m venv backend\.venv-local
.\backend\.venv-local\Scripts\python.exe -m pip install -r backend\requirements-cpu.txt --index-url https://download.pytorch.org/whl/cpu
.\backend\.venv-local\Scripts\python.exe -m pip install -r backend\requirements.txt
npm.cmd ci --prefix frontend
```

If your Python command is `py`, use `py -3.12` instead of `python` in the first command. Then use the two startup commands above. The backend launcher also accepts an existing `backend/.venv` when `.venv-local` is absent.

The first model startup downloads several hundred MB into ignored `backend/.model-cache`. Keep that cache for subsequent runs. No weights or virtual environments belong in Git. The launcher uses one CPU model instance with one inference request at a time; do not add Uvicorn workers or `--reload` for the demo.

## Play and scoring

1. Choose a tightly cropped reference photo with Lenny clearly visible.
2. Upload a scene containing the physically hidden dragon. Keep him visible enough for a human to identify.
3. Draw a tight box around his actual location and lock the guess.
4. Wait for inference, then reveal the AI's guess and the score.

The detector receives the reference and scene images, **not the marked answer**. After inference, the backend gives the AI box the same width and height as the user's box, centered on the predicted location and shifted within the image boundaries. The AI wins when **intersection over union (IoU) is at least 0.50**. IoU means intersection area divided by the combined area of both boxes; it is not simply half the user's box covered.

A valid `not_found` gives the player a point. A request or model error gives no point. Retrying the same round retrieves or resumes its existing guess. Detection scores are model scores, not probabilities of correctness. The detection threshold defaults to 0.1; this is separate from the fixed 0.50 scoring threshold.

## How it connects

```text
Browser → Next.js on PC:3000 → /api proxy → FastAPI on PC:8000 → local OWL-ViT
```

The website defaults to `/api`. Normalized coordinates describe the exact uploaded image. The current frontend stretches images to 960 × 960 before upload; the model processor performs its own preprocessing afterward. The local detector uses the player's single reference image, without retraining.

The UI includes an explicitly labeled simulated demo option. It does not run the model and keeps a separate score. For a real-model presentation, leave that option off.

## Repository map

| Location | Purpose |
| --- | --- |
| `frontend/` | Next.js, React, TypeScript, and Tailwind game UI |
| `backend/main.py` | FastAPI uploads, health, and round endpoints |
| `backend/detector.py` | Local Hugging Face OWL-ViT inference |
| `backend/inference.py` | Shared inference jobs and bounded queue |
| `backend/rounds.py`, `backend/scoring.py` | Stored rounds, box sizing, and scoring |
| `backend/images/` | Team reference and scene photos for experiments |
| `lennyDetector.ipynb`, `backend/lennyDetector.ipynb` | Historical AMD/OWLv2 experiments; not used by the website |
| `docs/API_CONTRACT.md` | Request and response contract |
| `docs/project-outline.md`, `docs/VERIFICATION.md` | Earlier planning and verification history |

This README describes the final local deployment; earlier cloud/notebook instructions are historical. See [backend details](backend/README.md) for API behavior and memory limits.

## Test from another device on the same network

Keep the backend bound to `127.0.0.1`. Start the production frontend with:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-frontend.ps1 -Lan
```

Use `ipconfig` to find the PC's Wi-Fi IPv4 address, then open `http://YOUR-PC-IP:3000` on the other device. Allow Node through Windows Firewall on your private network if prompted. Some event Wi-Fi networks block device-to-device traffic. Photo upload works over HTTP; browser camera access on another device generally requires HTTPS. This unauthenticated demo is intended for local use.

## Checks

```powershell
.\backend\.venv-local\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
.\backend\.venv-local\Scripts\python.exe -m unittest discover -s backend -v
npm.cmd test
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build -- --webpack
```

Optional browser checks: `npm.cmd run test:browser` (stop the frontend on port 3000 first). These use a mock API and an installed Chrome/Edge or Playwright Chromium. Automated checks verify game behavior, not hidden-object accuracy. Before presenting, play a complete real-model round and check latency on the presentation PC.

## Troubleshooting and limits

- **Model not ready / 503:** read the backend terminal, fix the reported download or dependency error, and restart it. `/health` HTTP 200 alone does not prove readiness; check `model_ready`.
- **Node/npm not recognized:** restart VS Code. The frontend launcher also checks the standard `C:\Program Files\nodejs` installation.
- **Port already in use:** stop the old server with Ctrl+C in its terminal, then start once.
- **Slow inference:** wait; CPU performance varies. The website allows up to three minutes. Retry the same round after a timeout instead of creating duplicate work.
- **Missed dragon:** try a clearer, tighter reference and a larger, better-lit target. Small, shaded, or occluded objects remain difficult. No accuracy guarantee is claimed.
- **Restart loses rounds:** the backend uses bounded in-memory storage, with 30-minute round expiry. Scores in the browser reset on refresh. There are no accounts or database.

Built with Hugging Face Transformers and PyTorch. The [OWL-ViT model](https://huggingface.co/google/owlvit-base-patch16) is distributed under Apache-2.0; preserve applicable notices when distributing it.
