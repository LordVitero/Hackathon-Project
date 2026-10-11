from io import BytesIO
import json

from fastapi import FastAPI, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps, UnidentifiedImageError
from rounds import RoundStore

app = FastAPI(title="Hide Lenny API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

MAX_FILE_BYTES = 12 * 1024 * 1024  # 12 MB per image
MAX_IMAGE_PIXELS = 20_000_000
round_store = RoundStore()


@app.get("/health")
def health():
    return {"status": "ok", "model_ready": False}


def read_image(upload: UploadFile) -> Image.Image:
    data = upload.file.read(MAX_FILE_BYTES + 1)

    if not data:
        raise HTTPException(400, "The uploaded file is empty.")

    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, "Each image must be 12 MB or smaller.")

    try:
        with Image.open(BytesIO(data)) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise HTTPException(400, "Please upload a JPEG, PNG, or WebP image.")

            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise HTTPException(413, "Image exceeds 20 megapixels.")

            # Correct rotation from phone-camera metadata.
            image = ImageOps.exif_transpose(image)

            # Return decoded RGB pixels for the future detector.
            return image.convert("RGB")

    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(400, "The file could not be read as an image.")


@app.post("/images/validate")
def validate_images(reference: UploadFile, scene: UploadFile):
    reference_image = read_image(reference)
    scene_image = read_image(scene)

    return {
        "status": "valid",
        "reference": {
            "width": reference_image.width,
            "height": reference_image.height,
        },
        "scene": {
            "width": scene_image.width,
            "height": scene_image.height,
        },
    }


def parse_actual_box(value: str) -> list[float]:
    """Convert form text to a valid box on the complete, oriented image."""
    try:
        box = json.loads(value)
    except json.JSONDecodeError:
        raise HTTPException(400, "actual_box must be a JSON array.")
    if not isinstance(box, list) or len(box) != 4:
        raise HTTPException(400, "actual_box must contain four numbers.")
    # bool is a subclass of int; reject it explicitly through exact types.
    if any(type(n) not in (int, float) for n in box):
        raise HTTPException(400, "Box coordinates must be numbers.")
    if any(not (0 <= n <= 1) for n in box):
        raise HTTPException(400, "Box coordinates must be finite and between 0 and 1.")
    box = [float(n) for n in box]
    if box[2] <= box[0] or box[3] <= box[1]:
        raise HTTPException(400, "The box must have positive width and height.")
    return box


def validated_image_bytes(upload: UploadFile) -> bytes:
    """Validate decoded pixels, but retain compressed uploads for later seeking."""
    with read_image(upload):
        pass
    upload.file.seek(0)
    return upload.file.read(MAX_FILE_BYTES + 1)


@app.post("/rounds")
def create_round(
    reference_image: UploadFile,
    scene_image: UploadFile,
    actual_box: str = Form(..., max_length=256),
    idempotency_key: str = Header(
        ..., alias="Idempotency-Key", min_length=1, max_length=128
    ),
):
    """Remember one game round. Creation does not run the detector."""
    box = parse_actual_box(actual_box)
    reference_bytes = validated_image_bytes(reference_image)
    scene_bytes = validated_image_bytes(scene_image)
    return round_store.create(idempotency_key, reference_bytes, scene_bytes, box)
