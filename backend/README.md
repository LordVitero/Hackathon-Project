# Local backend and OWL-ViT

The backend now implements `/health`, `/images/validate`, `/rounds`,
`/rounds/{id}/seek`, and `/rounds/{id}/reveal`. It loads the public Hugging Face
`google/owlvit-base-patch16` model once at startup. CPU is the default, so AMD
cloud access is optional. First startup needs internet to download model files;
later startups reuse the ignored `backend/.model-cache` directory (or `HF_HOME` if set). No token normally needed.

## Windows setup

Run from `backend` in PowerShell. If you already have `.venv`, use its Python
instead of creating another environment. This task also prepares `.venv-local`
on Tony's machine; it is excluded from Git.

```powershell
python -m venv .venv-local
.\.venv-local\Scripts\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
.\.venv-local\Scripts\python.exe -m pip install -r requirements.txt
.\.venv-local\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1
```

Alternatively run `./start-local.ps1` after installing. It selects `.venv-local`
when present, otherwise `.venv`, and explicitly selects CPU. Avoid `--reload`
for model demos: source changes would reload the model. Use exactly one worker
because rounds and queued jobs are in memory.

`/health` returns `model_ready: true` after successful loading. If loading fails,
the server remains available for diagnostics and uploads, but `/seek` returns
503. Read the terminal error, fix dependencies/connectivity, then restart.

## Frontend connection

Copy `frontend/.env.example` to `frontend/.env.local` if it does not exist.
Set `NEXT_PUBLIC_API_BASE_URL=/api`, then restart the frontend (rebuild if using
`npm run start`). Next.js forwards `/api/*` to Python at `127.0.0.1:8000`.
The browser can therefore use its own site address, including phone testing.
Set the value empty to explicitly use the labeled simulated demo instead.

## How a round works

1. `/rounds` validates two uploads and keeps the marked answer separately.
2. `/seek` shares one asynchronous task across retries for the same round.
   A worker thread runs blocking inference so the API remains responsive.
   One model call runs at a time, with at most four pending distinct rounds.
3. The detector receives only reference and scene bytes, corrects EXIF
   orientation, and uses image-guided detection. Its processor performs model
   resizing automatically; no manual 768/960 resizing is required here.
4. `RoundStore.complete` resizes the selected box to the answer's dimensions
   around the predicted center, shifts it within bounds, and scores IoU >= 0.50.
5. `/reveal` returns that immutable stored box and score. An unfinished round
   returns 409; inference errors return 503 and never award points. Client
   cancellation does not cancel a running guess. Failed inference may be retried.

`LENNY_DEVICE=cpu` is the default. For a compatible GPU PyTorch runtime, set
`LENNY_DEVICE=cuda:0` before starting uvicorn directly. Keep AMD's ROCm PyTorch
installation when using cloud hardware; do not install the CPU wheel there.
`LENNY_DETECTION_THRESHOLD` defaults to 0.1 and needs real-photo evaluation.
It is separate from the fixed 0.50 winning IoU. Scores are not probabilities.

The frontend waits up to three minutes for slower CPU inference. If a timeout
occurs, retry the same round to recover its result rather than create a new guess.
Measure actual latency on your laptop; no performance guarantee is implied.

## Verification

```powershell
.\.venv-local\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv-local\Scripts\python.exe -m unittest -v
```

Tests use a clearly labeled detector stub to verify HTTP uploads, concurrent
retries, cancellation, queue limits, expiry, failure recovery, and scoring.
They do not establish model accuracy. Evaluate the real model on Lenny photos.

Rounds expire after 30 minutes; cleanup is lazy. Storage is bounded to 20 rounds
and 100 MiB of compressed uploads, with 1000 retry records. Restarting loses
rounds and clears retry records. No account system or persistent database.

Model: https://huggingface.co/google/owlvit-base-patch16 (Apache-2.0).
API reference: https://huggingface.co/docs/transformers/model_doc/owlvit.
Do not commit virtual environments, weights, secrets, or player uploads.
