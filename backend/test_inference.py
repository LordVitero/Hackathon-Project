import asyncio
from io import BytesIO
from threading import Event
import unittest
from uuid import uuid4

import httpx
from fastapi import HTTPException
from PIL import Image
import main
from inference import InferenceService
from rounds import RoundStore


class DetectorStub:
    def __init__(self):
        self.calls = 0
        self.started = Event()
        self.release = Event()
        self.release.set()
        self.fail = False

    def detect(self, reference, scene):
        self.calls += 1
        self.inputs = (reference, scene)
        self.started.set()
        if not self.release.wait(5):
            raise RuntimeError("Test detector timed out")
        if self.fail:
            raise RuntimeError("Test model error")
        return {"prediction": {"status": "found", "box": [0, 0, .75, .75], "score": .8},
                "model": {"id": "test-only", "threshold": .1, "inference_ms": 1}}


class InferenceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.store = RoundStore()
        self.detector = DetectorStub()
        self.service = InferenceService(self.store, self.detector)
        self.round_id = self.store.create(str(uuid4()), b"reference", b"scene", [.25, .25, .5, .5])["round_id"]

    async def asyncTearDown(self):
        self.detector.release.set()
        await self.service.close()

    async def test_concurrent_retries_share_one_guess(self):
        await asyncio.gather(*(self.service.seek(self.round_id) for _ in range(8)))
        await self.service.seek(self.round_id)
        self.assertEqual(self.detector.calls, 1)
        self.assertEqual(self.detector.inputs, (b"reference", b"scene"))
        reveal = self.store.get_reveal(self.round_id)
        self.assertEqual(reveal["prediction"]["box"], [.25, .25, .5, .5])
        self.assertEqual(reveal["result"]["winner"], "ai")

    async def test_cancellation_preserves_running_guess_and_queue_is_bounded(self):
        self.service.max_pending = 1
        self.detector.release.clear()
        task = asyncio.create_task(self.service.seek(self.round_id))
        self.assertTrue(await asyncio.to_thread(self.detector.started.wait, 2))
        second = self.store.create(str(uuid4()), b"r", b"s", [0, 0, 1, 1])["round_id"]
        with self.assertRaises(HTTPException) as error:
            await self.service.seek(second)
        self.assertEqual(error.exception.status_code, 503)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.detector.release.set()
        await self.service.seek(self.round_id)
        self.assertEqual(self.detector.calls, 1)

    async def test_error_does_not_award_point_and_retry_can_succeed(self):
        self.detector.fail = True
        with self.assertRaises(HTTPException) as error:
            await self.service.seek(self.round_id)
        self.assertEqual(error.exception.status_code, 503)
        with self.assertRaises(HTTPException) as error:
            self.store.get_reveal(self.round_id)
        self.assertEqual(error.exception.status_code, 409)
        self.detector.fail = False
        await self.service.seek(self.round_id)
        self.assertEqual(self.detector.calls, 2)

    async def test_expired_and_unknown_rounds_do_not_run_model(self):
        self.store.rounds[self.round_id].expires_at = 0
        for round_id, expected in [(self.round_id, 410), ("missing", 404)]:
            with self.assertRaises(HTTPException) as error:
                await self.service.seek(round_id)
            self.assertEqual(error.exception.status_code, expected)
        self.assertEqual(self.detector.calls, 0)

    async def test_http_upload_seek_reveal_and_unavailable_model(self):
        previous_store, previous_service = main.round_store, main.inference_service
        main.round_store, main.inference_service = self.store, self.service
        try:
            image = BytesIO()
            Image.new("RGB", (30, 20), "green").save(image, format="JPEG")
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                self.assertTrue((await client.get("/health")).json()["model_ready"])
                response = await client.post("/rounds", files={
                    "reference_image": ("r.jpg", image.getvalue(), "image/jpeg"),
                    "scene_image": ("s.jpg", image.getvalue(), "image/jpeg"),
                }, data={"actual_box": "[0.25,0.25,0.5,0.5]"}, headers={"Idempotency-Key": str(uuid4())})
                self.assertEqual(response.status_code, 200)
                round_id = response.json()["round_id"]
                url = f"/rounds/{round_id}"
                self.assertEqual((await client.get(url + "/reveal")).status_code, 409)
                self.assertEqual((await client.post(url + "/seek")).status_code, 200)
                reveal = (await client.get(url + "/reveal")).json()
                self.assertEqual(reveal["result"]["iou_threshold"], .5)
                self.assertEqual(reveal["prediction"]["box"], reveal["actual_box"])
                self.assertEqual((await client.get(url + "/reveal")).json(), reveal)
                main.inference_service = None
                self.assertFalse((await client.get("/health")).json()["model_ready"])
                self.assertEqual((await client.post(url + "/seek")).status_code, 503)
        finally:
            main.round_store, main.inference_service = previous_store, previous_service


if __name__ == "__main__":
    unittest.main()
