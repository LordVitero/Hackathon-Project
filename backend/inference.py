"""One shared task per round; one active model call per process."""
import asyncio
import logging
from fastapi import HTTPException

logger = logging.getLogger(__name__)


class InferenceService:
    def __init__(self, store, detector, max_pending=4):
        self.store = store
        self.detector = detector
        self.max_pending = max_pending
        self.tasks = {}
        self.slot = asyncio.Semaphore(1)

    async def seek(self, round_id):
        record = self.store.get(round_id)
        if record.reveal is not None:
            return {"round_id": round_id, "state": "complete"}
        task = self.tasks.get(round_id)
        if task is None:
            if len(self.tasks) >= self.max_pending:
                raise HTTPException(503, "Model queue is full. Retry this round later.")
            task = asyncio.create_task(self._run(round_id))
            self.tasks[round_id] = task
            task.add_done_callback(lambda done: self._finished(round_id, done))
        # A disconnected browser must not cancel its already-running guess.
        return await asyncio.shield(task)

    def _finished(self, round_id, task):
        if self.tasks.get(round_id) is task:
            self.tasks.pop(round_id)
        if not task.cancelled():
            task.exception()  # Observe failures even when all clients disconnect.

    async def _run(self, round_id):
        try:
            async with self.slot:
                record = self.store.get(round_id)
                # The correct box is never passed to the model.
                result = await asyncio.to_thread(
                    self.detector.detect, record.reference_bytes, record.scene_bytes)
                self.store.complete(round_id, result)
            return {"round_id": round_id, "state": "complete"}
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Inference failed for round %s", round_id)
            raise HTTPException(503, "Model inference failed. Retry this round; no point awarded.") from exc

    async def close(self):
        if self.tasks:
            await asyncio.gather(*list(self.tasks.values()), return_exceptions=True)
