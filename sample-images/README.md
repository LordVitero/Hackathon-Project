# Real Lenny evaluation images

No real Lenny photographs were provided for this frontend implementation. The test suite generates synthetic coordinate fixtures only; these are not evidence of detector feasibility.

The ML team should collect the outline's 20–30 scenes and reserve held-out examples. Include obvious placements, multiple views, lighting, clutter, green distractors, fair partial occlusion, camera distances, and scenes without Lenny. Select a real, tightly cropped default reference after testing, then put the approved asset in `frontend/public/` and configure `NEXT_PUBLIC_LENNY_REFERENCE_URL`.

Use images the team is authorized to distribute; do not commit generated player uploads.
