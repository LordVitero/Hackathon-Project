"""Game rules applied AFTER the detector has selected its candidate."""
from math import isfinite

IOU_THRESHOLD = 0.5


def validate_box(box):
    if (not isinstance(box, (list, tuple)) or len(box) != 4
            or any(type(v) not in (int, float) or not isfinite(v)
                   or not 0 <= v <= 1 for v in box)
            or box[2] <= box[0] or box[3] <= box[1]):
        raise ValueError("Expected a positive-area normalized box")


def match_box_size(predicted_box, target_width, target_height):
    validate_box(predicted_box)
    if any(type(v) not in (int, float) or not isfinite(v)
           or not 0 < v <= 1 for v in (target_width, target_height)):
        raise ValueError("Box dimensions must be in (0, 1]")
    center_x = (predicted_box[0] + predicted_box[2]) / 2
    center_y = (predicted_box[1] + predicted_box[3]) / 2
    left = max(0.0, min(center_x - target_width / 2, 1 - target_width))
    top = max(0.0, min(center_y - target_height / 2, 1 - target_height))
    return [left, top, left + target_width, top + target_height]


def calculate_iou(box_a, box_b):
    validate_box(box_a)
    validate_box(box_b)
    intersection = (max(0.0, min(box_a[2], box_b[2]) - max(box_a[0], box_b[0]))
                    * max(0.0, min(box_a[3], box_b[3]) - max(box_a[1], box_b[1])))
    area_a = (box_a[2] - box_a[0]) * (box_a[3] - box_a[1])
    area_b = (box_b[2] - box_b[0]) * (box_b[3] - box_b[1])
    return intersection / (area_a + area_b - intersection)


def finalize_prediction(prediction, actual_box):
    """Return a new adjusted prediction and score without changing inputs."""
    validate_box(actual_box)
    if prediction.get("status") == "not_found":
        if prediction.get("box") is not None or prediction.get("score") is not None:
            raise ValueError("not_found must have null box and score")
        adjusted = {"status": "not_found", "box": None, "score": None}
        iou = 0.0
    elif prediction.get("status") == "found":
        score = prediction.get("score")
        if type(score) not in (int, float) or not isfinite(score) or not 0 <= score <= 1:
            raise ValueError("Detection score must be in [0, 1]")
        box = match_box_size(prediction.get("box"),
                             actual_box[2] - actual_box[0],
                             actual_box[3] - actual_box[1])
        adjusted = {"status": "found", "box": box, "score": score}
        iou = calculate_iou(box, actual_box)
    else:
        raise ValueError("Invalid prediction status; inference errors are not misses")
    return adjusted, {"winner": "ai" if iou >= IOU_THRESHOLD else "player",
                      "iou": iou, "iou_threshold": IOU_THRESHOLD}
