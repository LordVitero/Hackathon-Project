# Backend handoff

## Implemented backend milestone

`main.py` now provides `/health`, `/images/validate`, and `POST /rounds`.
Round creation accepts `reference_image`, `scene_image`, `actual_box` (a JSON
array encoded as form text), and a UUID `Idempotency-Key` header. Same-key
retries with the same contents return the original ID; changed contents return
409. Invalid boxes/images return 400 and oversized uploads return 413.

`rounds.py` keeps compressed photos and the marked answer in memory, with a
30-minute expiry, at most 20 active rounds and 100 MiB of stored photos. Old
retry keys retain small records so an expired retry returns 410. The key ledger
is limited to 1000 keys per service lifetime. Restarting or development reload
clears all storage. Run one server process while using this store.

Run locally from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

Run handler/storage/schema unit checks:

```powershell
.\.venv\Scripts\python.exe -m unittest -v
```

These checks cover real image decoding, box validation, retry conflicts,
concurrent creation, expiry, limits and the OpenAPI request schema. Exercise
HTTP uploads separately using `/docs`.

No detector is wired yet: health returns `model_ready: false`. `/seek` and
`/reveal` remain to be implemented when the teammate's detector is available.
Do not configure the frontend for real gameplay until those endpoints work.

To test round creation in `/docs`, use two valid photos, an `actual_box` such as
`[0.2,0.3,0.4,0.6]`, and a UUID such as
`b5468228-03b7-4ff4-9d51-d38384b77321`. Re-executing unchanged should return
the same round ID; changing the box with the same key should return 409.

The frontend work does not implement or simulate a production model backend. Tony/backend and the ML teammate own this service per the supplied project outline.

Implement Python 3.12, FastAPI/Pydantic, Pillow, Transformers/PyTorch and `google/owlvit-base-patch16` after feasibility testing on real Lenny photos. See [the proposed API contract](../docs/API_CONTRACT.md) for the exact upload fields, round IDs, idempotency, locked seek, reveal, and scoring schemas used by the frontend.

Keep detector inputs limited to reference and scene. Store the marked answer separately for scoring. Load the model once, bound concurrent inference, return valid not-found distinctly from errors, and freeze tested thresholds. Do not commit model weights, secrets, virtual environments, or player uploads.

`frontend/tests/mock-api.mjs` is exclusively a contract-test fixture; it is not the detector or a deployment candidate.
