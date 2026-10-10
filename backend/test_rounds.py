"""Run from backend/: .venv\\Scripts\\python.exe -m unittest -v"""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import unittest
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from PIL import Image

import main
from rounds import RoundStore


class RoundTests(unittest.TestCase):
    def setUp(self):
        main.round_store = RoundStore()
        image = BytesIO()
        Image.new("RGB", (40, 30), "green").save(image, format="JPEG")
        self.image = image.getvalue()
        self.key = str(uuid4())

    def create(self, box="[0.2,0.3,0.4,0.6]", reference=None, key=None):
        # Call the real handler with real uploaded-file objects.
        # HTTP transport can also be exercised manually through /docs.
        class Response:
            def __init__(self, status_code, body):
                self.status_code, self.body = status_code, body
            def json(self):
                return self.body
        with BytesIO(self.image if reference is None else reference) as ref, BytesIO(self.image) as scene:
            try:
                body = main.create_round(
                    reference_image=UploadFile(ref, filename="reference.jpg"),
                    scene_image=UploadFile(scene, filename="scene.jpg"),
                    actual_box=box, idempotency_key=key or self.key,
                )
                return Response(200, body)
            except HTTPException as exc:
                return Response(exc.status_code, {"detail": exc.detail})

    def test_create_and_retry_preserve_answer_and_original_response(self):
        first = self.create()
        self.assertEqual(first.status_code, 200)
        round_id = first.json()["round_id"]
        record = main.round_store.rounds[round_id]
        self.assertEqual(record.actual_box, [0.2, 0.3, 0.4, 0.6])
        self.assertEqual(record.scene_bytes, self.image)
        record.state = "complete"
        self.assertEqual(self.create().json(), first.json())
        self.assertEqual(len(main.round_store.rounds), 1)

    def test_reusing_key_with_changed_answer_or_photo_conflicts(self):
        self.create()
        self.assertEqual(self.create(box="[0,0,1,1]").status_code, 409)
        other = BytesIO()
        Image.new("RGB", (40, 30), "red").save(other, format="JPEG")
        self.assertEqual(self.create(reference=other.getvalue()).status_code, 409)

    def test_invalid_boxes(self):
        for box in ('bad', '{}', '[0,0,1]', '[true,0,1,1]',
                    '[0,0,NaN,1]', '[0,0,Infinity,1]',
                    '[-0.1,0,1,1]', '[0.5,0,0.4,1]', '[0,0,0,1]'):
            with self.subTest(box=box):
                self.assertEqual(self.create(box=box).status_code, 400)
        self.assertFalse(main.round_store.rounds)

    def test_image_edges_are_valid(self):
        self.assertEqual(self.create(box="[0,0,1,1]").status_code, 200)

    def test_text_file_and_invalid_key_are_rejected(self):
        self.assertEqual(self.create(reference=b"not an image").status_code, 400)
        self.assertEqual(self.create(key="not-a-uuid").status_code, 400)

    def test_expired_retry_does_not_create_new_round(self):
        response = self.create().json()
        main.round_store.rounds[response["round_id"]].expires_at = 0
        self.assertEqual(self.create().status_code, 410)
        self.assertFalse(main.round_store.rounds)

    def test_storage_limits(self):
        main.round_store = RoundStore(max_bytes=1)
        self.assertEqual(self.create().status_code, 503)
        self.assertFalse(main.round_store.rounds)

    def test_concurrent_retries_create_one_round(self):
        store = RoundStore()
        def create(_):
            return store.create(self.key, self.image, self.image, [0., 0., 1., 1.])
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(create, range(16)))
        self.assertEqual(len({r["round_id"] for r in results}), 1)
        self.assertEqual(len(store.rounds), 1)

    def test_api_schema_and_health(self):
        schema = main.app.openapi()
        operation = schema["paths"]["/rounds"]["post"]
        self.assertIn("multipart/form-data", operation["requestBody"]["content"])
        self.assertTrue(any(p["name"] == "Idempotency-Key" and p["in"] == "header"
                            for p in operation["parameters"]))
        self.assertEqual(main.health(), {"status": "ok", "model_ready": False})


if __name__ == "__main__":
    unittest.main()
