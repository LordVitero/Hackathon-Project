import unittest
from copy import deepcopy
from uuid import uuid4

from fastapi import HTTPException
from rounds import RoundStore
from scoring import calculate_iou, finalize_prediction, match_box_size


class ScoringTests(unittest.TestCase):
    def test_exact_threshold_and_below(self):
        # Equal 0.375-wide boxes shifted by 0.125 have exactly 50% IoU.
        actual = [0, 0, .375, .5]
        prediction = {"status": "found", "box": [.125, 0, .5, .5], "score": .8}
        _, result = finalize_prediction(prediction, actual)
        self.assertEqual(result["iou"], .5)
        self.assertEqual(result["winner"], "ai")
        prediction["box"] = [.126, 0, .501, .5]
        self.assertEqual(finalize_prediction(prediction, actual)[1]["winner"], "player")

    def test_edges_preserve_dimensions(self):
        for box in ([0, 0, .02, .02], [.98, .98, 1, 1], [0, .98, .02, 1], [.98, 0, 1, .02]):
            adjusted = match_box_size(box, .4, .6)
            self.assertAlmostEqual(adjusted[2] - adjusted[0], .4)
            self.assertAlmostEqual(adjusted[3] - adjusted[1], .6)
            self.assertTrue(all(0 <= n <= 1 for n in adjusted))
        self.assertEqual(match_box_size([.2, .3, .4, .5], 1, 1), [0, 0, 1, 1])

    def test_position_does_not_leak_and_score_is_preserved(self):
        prediction = {"status": "found", "box": [.25, .25, .75, .75], "score": .7}
        original = deepcopy(prediction)
        a, _ = finalize_prediction(prediction, [0, 0, .25, .25])
        b, _ = finalize_prediction(prediction, [.75, .75, 1, 1])
        self.assertEqual(a, b)
        self.assertEqual(a["box"], [.375, .375, .625, .625])
        self.assertEqual(a["score"], .7)
        self.assertEqual(prediction, original)

    def test_misses_and_invalid_outputs(self):
        actual = [.25, .25, .5, .5]
        _, score = finalize_prediction({"status": "not_found", "box": None, "score": None}, actual)
        self.assertEqual(score["winner"], "player")
        self.assertEqual(score["iou"], 0)
        self.assertEqual(calculate_iou([0, 0, .1, .1], actual), 0)
        for prediction in ({"status": "error"}, {"status": "found", "box": actual, "score": float("nan")}, {"status": "found", "box": [0, 0, 0, 1], "score": .8}):
            with self.assertRaises(ValueError):
                finalize_prediction(prediction, actual)

    def test_completion_is_frozen_and_matches_displayed_box(self):
        store = RoundStore()
        actual = [.25, .25, .5, .5]
        round_id = store.create(str(uuid4()), b"reference", b"scene", actual)["round_id"]
        detector = {"prediction": {"status": "found", "box": [0, 0, .75, .75], "score": .8}, "model": {"id": "test", "threshold": .1, "inference_ms": 1}}
        saved = store.complete(round_id, detector)
        self.assertEqual(saved["prediction"]["box"], actual)
        self.assertEqual(saved["result"]["iou"], 1)
        saved["prediction"]["box"][0] = 0
        detector["prediction"]["box"] = [.8, .8, 1, 1]
        self.assertEqual(store.complete(round_id, detector)["prediction"]["box"], actual)
        store.rounds[round_id].expires_at = 0
        with self.assertRaises(HTTPException) as error:
            store.complete(round_id, detector)
        self.assertEqual(error.exception.status_code, 410)


if __name__ == "__main__":
    unittest.main()
