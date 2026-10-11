"""Local image-guided OWL-ViT inference. Never receives the marked answer."""
import os
import torch
from io import BytesIO
from math import isfinite
from pathlib import Path
from threading import Lock
from time import perf_counter
from PIL import Image, ImageOps
os.environ.setdefault("HF_HOME", str(Path(__file__).resolve().parent / ".model-cache"))

from transformers import OwlViTProcessor, OwlViTForObjectDetection


class LennyDetector:
    def __init__(self, model_id="google/owlvit-base-patch16", device="cpu", threshold=0.1):
        if not 0 <= threshold <= 1:
            raise ValueError("Detection threshold must be between 0 and 1.")
        self.model_id, self.device, self.threshold = model_id, device, threshold
        self.lock = Lock()
        self.processor = OwlViTProcessor.from_pretrained(model_id)
        self.model = OwlViTForObjectDetection.from_pretrained(model_id).to(device)
        self.model.eval()

    @staticmethod
    def decode_image(data):
        if not data or len(data) > 12 * 1024 * 1024:
            raise ValueError("Each image must be nonempty and at most 12 MiB.")
        with Image.open(BytesIO(data)) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError("Use a JPEG, PNG, or WebP image.")
            if image.width * image.height > 20_000_000:
                raise ValueError("Image exceeds 20 megapixels.")
            return ImageOps.exif_transpose(image).convert("RGB")

    def detect(self, reference_bytes: bytes, scene_bytes: bytes) -> dict:
        with self.lock:
            started = perf_counter()
            with (self.decode_image(reference_bytes) as reference,
                  self.decode_image(scene_bytes) as scene):
                inputs = self.processor(images=scene, query_images=reference,
                                        return_tensors="pt").to(self.device)
                with torch.inference_mode():
                    outputs = self.model.image_guided_detection(**inputs)
                    sizes = torch.tensor([[scene.height, scene.width]], device=self.device)
                    result = self.processor.post_process_image_guided_detection(
                        outputs=outputs, threshold=self.threshold, target_sizes=sizes
                    )[0]
                boxes = result["boxes"].detach().cpu().tolist()
                scores = result["scores"].detach().cpu().tolist()
                prediction = {"status": "not_found", "box": None, "score": None}
                for score, box in sorted(zip(scores, boxes), key=lambda pair: pair[0], reverse=True):
                    if not all(isfinite(v) for v in [score, *box]):
                        raise RuntimeError("Non-finite model output.")
                    if score < self.threshold:
                        continue
                    scales = [scene.width, scene.height, scene.width, scene.height]
                    box = [max(0.0, min(1.0, v / scale)) for v, scale in zip(box, scales)]
                    if box[2] <= box[0] or box[3] <= box[1]:
                        continue
                    prediction = {"status": "found", "box": box, "score": float(score)}
                    break
            return {"prediction": prediction, "model": {
                "id": self.model_id, "threshold": self.threshold,
                "inference_ms": round((perf_counter() - started) * 1000, 2)}}
