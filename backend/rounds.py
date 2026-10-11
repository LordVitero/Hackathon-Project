"""Temporary, single-process game storage; no images or answers go to disk."""

from copy import deepcopy
from scoring import finalize_prediction
from dataclasses import dataclass
from hashlib import sha256
import json
from threading import Lock
from time import monotonic
from uuid import UUID, uuid4

from fastapi import HTTPException


@dataclass
class Round:
    reference_bytes: bytes
    scene_bytes: bytes
    actual_box: list[float]
    expires_at: float
    state: str = "ready"
    prediction: dict | None = None
    reveal: dict | None = None


class RoundStore:
    def __init__(self, ttl_seconds=1800, max_rounds=20,
                 max_bytes=100 * 1024 * 1024, max_keys=1000):
        self.ttl_seconds = ttl_seconds
        self.max_rounds = max_rounds
        self.max_bytes = max_bytes
        self.max_keys = max_keys
        self.rounds: dict[str, Round] = {}
        # Small retry records survive image expiry, preventing a new guess
        # from being silently created using an old creation key.
        self.creation_requests: dict[str, tuple[str, str]] = {}
        self.lock = Lock()

    def _expire(self):
        now = monotonic()
        for round_id in list(self.rounds):
            if self.rounds[round_id].expires_at <= now:
                del self.rounds[round_id]

    def create(self, key, reference_bytes, scene_bytes, box):
        try:
            key = str(UUID(key))
        except ValueError:
            raise HTTPException(400, "Idempotency-Key must be a UUID.")
        fingerprint = sha256(json.dumps([
            sha256(reference_bytes).hexdigest(),
            sha256(scene_bytes).hexdigest(), box,
        ]).encode()).hexdigest()

        # Checking retries and inserting a round must happen atomically.
        with self.lock:
            self._expire()
            previous = self.creation_requests.get(key)
            if previous:
                previous_fingerprint, round_id = previous
                if fingerprint != previous_fingerprint:
                    raise HTTPException(409, "Key already used for different round data.")
                if round_id not in self.rounds:
                    raise HTTPException(410, "Round expired. Start a new round with a new key.")
                # Return the ORIGINAL creation response, even after seeking.
                return {"round_id": round_id, "state": "ready"}

            used_bytes = sum(len(r.reference_bytes) + len(r.scene_bytes)
                             for r in self.rounds.values())
            new_bytes = len(reference_bytes) + len(scene_bytes)
            if (len(self.rounds) >= self.max_rounds
                    or used_bytes + new_bytes > self.max_bytes
                    or len(self.creation_requests) >= self.max_keys):
                raise HTTPException(503, "Local round storage is full. Try later or restart the service.")

            round_id = str(uuid4())
            self.rounds[round_id] = Round(
                reference_bytes, scene_bytes, list(box),
                monotonic() + self.ttl_seconds,
            )
            self.creation_requests[key] = (fingerprint, round_id)
            return {"round_id": round_id, "state": "ready"}

    def complete(self, round_id, detector_result):
        """Lock the adjusted box and score once; call after successful inference.

        This does not schedule inference: /seek must still deduplicate in-flight
        detector calls. The detector receives only reference and scene bytes.
        """
        with self.lock:
            record = self.rounds.get(round_id)
            if record is None:
                raise HTTPException(404, "Round not found.")
            if record.expires_at <= monotonic():
                raise HTTPException(410, "Round expired.")
            if record.reveal is not None:
                return deepcopy(record.reveal)
            prediction, result = finalize_prediction(
                detector_result["prediction"], record.actual_box)
            reveal = {"round_id": round_id, "state": "complete",
                      "actual_box": list(record.actual_box),
                      "prediction": prediction, "result": result,
                      "model": deepcopy(detector_result["model"])}
            record.prediction = deepcopy(prediction)
            record.reveal = reveal
            record.state = "complete"
            return deepcopy(reveal)

    def get(self, round_id):
        """Internal lookup; callers must never return image bytes or answers early."""
        with self.lock:
            record = self.rounds.get(round_id)
            if record is None:
                raise HTTPException(404, "Round not found or no longer retained.")
            if record.expires_at <= monotonic():
                raise HTTPException(410, "Round expired.")
            return record

    def get_reveal(self, round_id):
        with self.lock:
            record = self.rounds.get(round_id)
            if record is None:
                raise HTTPException(404, "Round not found or no longer retained.")
            if record.expires_at <= monotonic():
                raise HTTPException(410, "Round expired.")
            if record.reveal is None:
                raise HTTPException(409, "Prediction is not locked yet.")
            return deepcopy(record.reveal)
