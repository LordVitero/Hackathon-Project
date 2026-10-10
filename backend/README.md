# Backend handoff

The frontend work does not implement or simulate a production model backend. Tony/backend and the ML teammate own this service per the supplied project outline.

Implement Python 3.12, FastAPI/Pydantic, Pillow, Transformers/PyTorch and `google/owlvit-base-patch16` after feasibility testing on real Lenny photos. See [the proposed API contract](../docs/API_CONTRACT.md) for the exact upload fields, round IDs, idempotency, locked seek, reveal, and scoring schemas used by the frontend.

Keep detector inputs limited to reference and scene. Store the marked answer separately for scoring. Load the model once, bound concurrent inference, return valid not-found distinctly from errors, and freeze tested thresholds. Do not commit model weights, secrets, virtual environments, or player uploads.

`frontend/tests/mock-api.mjs` is exclusively a contract-test fixture; it is not the detector or a deployment candidate.
