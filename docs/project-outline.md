# Hide Lenny — Knight Hacks IX Project Outline

## 1. Shared project direction

**Pitch:** Can you hide Lenny in plain sight from AI?

Hide Lenny is a full-stack web game where a player physically hides an object, photographs the scene, and challenges an open-source vision model to locate it. For our Knight Hacks IX demo, the target is Lenny: the small, bright green, 3D-printed dragon mascot distributed at the hackathon.

The player supplies a reference photo showing what to seek. The AI receives that reference and the hiding photo, makes one prediction, and the website reveals whether it found the target.

The fun comes from physical camouflage, clutter, unusual placement, and a clear visual reveal. Our priorities are a reliable end-to-end round and a polished rematch experience.

**Demo target:** Lenny, tested thoroughly. **Underlying capability:** reference-based detection that could also accept other objects. We will not promise reliable detection of arbitrary objects until tested.

## 2. Minimum finished product

The required loop is:

**Choose reference → hide Lenny → upload scene → mark actual location → lock AI guess → reveal → rematch.**

Required features:

- A default, tightly cropped reference photo of Lenny.
- Scene-photo upload, with a preview and clear instructions.
- A tool for drawing a box around Lenny's actual location.
- Real inference using a Hugging Face model.
- One locked AI prediction per round, or a valid “not found” result.
- A reveal showing the AI box and the actual target box, with labels and a result.
- A rematch flow and simple session score.
- Useful loading and error states.
- A deployed website and backend that the team can demonstrate.

The two features receiving most of our effort are **hide-and-reveal rounds** and **rematches with a side-by-side round history**.

## 3. Rules for fair hiding

Agreed gameplay rules:

1. The target must actually appear in the submitted scene photo.
2. A person familiar with the target must be able to recognize it in that photo.
3. Partial occlusion is allowed; complete covering is not.
4. Hiding uses physical arrangement, clutter, and camouflage. Digital removal or compositing is not allowed.
5. Use one Lenny per scene for the initial version.
6. A teammate or judge confirms fair hiding during the live demo.
7. The AI gets one prediction per round. Its model settings stay fixed during scored play.

The player-marked box records the answer; it does not independently prove that the hiding was fair. Automated fairness verification is outside the MVP.

We will establish photo-framing guidance after model testing. In particular, Lenny must occupy enough of the image to survive preprocessing and remain recognizable.

## 4. What “using AI” means here

### Starting model

Use **`google/owlvit-base-patch16`** through Hugging Face Transformers and PyTorch.

OWL-ViT supports **image-guided object detection**: the model receives a reference image and searches a separate scene image for similar objects, producing bounding boxes and detection scores.

- Model: https://huggingface.co/google/owlvit-base-patch16
- API documentation: https://huggingface.co/docs/transformers/model_doc/owlvit

This is our starting candidate, not a verified Lenny detector. We must test it on real Lenny photos before committing the rest of the project around its behavior.

### Reference images are not training

Uploading a reference conditions the search; it does not update model weights. Describe the implementation as **reference-based object detection using a pretrained open-source model**.

Custom fine-tuning is optional and contingent on testing. A Lenny-specific trained detector and a general “upload any target” detector are different capabilities. We should not present one as the other.

### Hugging Face's role

- **Model Hub:** obtain the pretrained model and processor.
- **Transformers:** run the detection workflow.
- **Docker Spaces:** an optional deployment home for the FastAPI service.

The public model is Apache-2.0 licensed. Include model attribution and applicable license notices. The hackathon lists a Hugging Face open-source AI prize; confirm detailed sponsor requirements with the organizers.

## 5. Model feasibility milestone — do this first

Spend the first 1–2 hours testing detection independently of the website.

Collect approximately 20–30 scene photos, including:

- Obvious placements.
- Different views of Lenny.
- Different backgrounds and lighting.
- Clutter and green distractors.
- Fair partial occlusion.
- Different distances from the camera.
- Scenes without Lenny, to check false detections.

Reserve some scenes for evaluation after choosing settings. Do not tune and report results on exactly the same images.

Record the predicted box, detection score, whether it finds the right object, and elapsed inference time. Select the reference photo and threshold using observed results. Model scores are not calibrated probabilities of correctness.

**Proceed when:** obvious placements work consistently, latency is acceptable on the intended hardware, and challenging scenes produce an interesting mix of fair successes and misses.

**If it struggles:** improve reference framing and photo guidance first. Compare another compatible detector or investigate fixed overlapping image crops if small-object size is the issue. Tiling adds latency and coordinate complexity, so adopt it only if testing justifies it. Discuss fine-tuning only after the baseline is understood.

## 6. Architecture and technology

```text
Next.js browser UI
        ↓ image uploads and round requests
FastAPI backend
        ├── round state and scoring
        ├── image validation and orientation handling
        └── OWL-ViT inference through Transformers/PyTorch
        ↓ structured results
Next.js box overlays, reveal, and rematch
```

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | Next.js, TypeScript, Tailwind CSS | Upload, annotation, reveal, history |
| Backend | Python 3.12, FastAPI, Pydantic | API contracts, round state, scoring |
| ML | Transformers, PyTorch, OWL-ViT | Reference-based localization |
| Images | Pillow | Decode, orient, convert, and prepare images |
| Collaboration | Git and GitHub | Shared code and reproducible setup |
| Deployment | Docker; consider Hugging Face Docker Spaces for backend | Run the model service |

Begin with one Python service containing the model. Load the model once at startup and bound concurrent inference. Do not load it again for every request.

No accounts or database are required for the MVP. In-memory rounds are acceptable for a demo, but reset on backend restart and assume one server process. Add persistence only if needed.

Use one repository:

```text
hide-lenny/
├── frontend/
├── backend/
│   ├── main.py
│   ├── detector.py
│   ├── scoring.py
│   └── requirements.txt
├── sample-images/
├── .gitignore
└── README.md
```

Commit dependency versions after the model works. Do not commit virtual environments, node_modules, model weights, secrets, or generated player uploads.

## 7. Integration contract — proposed defaults

Agree on these details before frontend and backend implementation diverge.

### Coordinate convention

Represent boxes as normalized **`[x_min, y_min, x_max, y_max]`**, with values between 0 and 1, measured against the complete, correctly oriented scene image.

The frontend converts from displayed-image coordinates; the backend converts model output from pixel coordinates. Both must refer to the same oriented image. Phone-photo EXIF rotation and preview scaling must be handled consistently.

### Round endpoints

- `GET /health`: confirm the service is alive. Report model readiness separately if loading is incomplete.
- `POST /rounds`: accept the reference image, scene image, and actual target box; return a round ID.
- `POST /rounds/{id}/seek`: run inference and store the locked prediction. Repeated requests return the existing result rather than creating another guess.
- `GET /rounds/{id}/reveal`: return the locked prediction, actual box, and score.

Suggested round states: `ready`, `seeking`, `complete`, and `error`.

The detector's function accepts **reference image + scene image only**. The actual target box must never affect detection, candidate selection, or thresholding.

### Prediction policy

After postprocessing, select the highest-scoring valid box above a fixed threshold. If none qualifies, return `not_found`. Distinguish this from an inference failure: a server error must not award the player a win.

Record the model identifier, threshold, and inference duration for debugging and reproducibility.

### Scoring

**Proposed starting rule:** AI wins when its predicted box has intersection-over-union (IoU) of at least **0.3** with the actual target box. Otherwise the player wins. IoU measures overlap relative to the combined area of both boxes.

This value is provisional. Test it against real predictions, including boxes that locate Lenny but fit imperfectly. Choose and freeze the rule before scored gameplay. Show both boxes, and allow a teammate to adjudicate disputed demo rounds.

## 8. Team responsibilities

| Owner | Main work | Deliverable |
|---|---|---|
| Tony — backend | FastAPI, uploads, state, scoring, deployment | Reliable round API |
| Teammate 2 — ML | Test photos, reference selection, inference, thresholds | Working detector module and findings |
| Teammate 3 — frontend | Upload flow, target marking, API integration | Complete playable interface |
| Teammate 4 — game experience | Visual design, reveal, history, testing, demo | Polished experience and presentation |

Responsibilities can overlap. Agree on API shapes and coordinates together; integrate early rather than waiting for each part to be finished.

Use Codex for scoped implementation tasks with explicit contracts and acceptance criteria. Review generated changes, test real photos, and keep the team aligned through this outline and the repository README.

## 9. Build order and checkpoints

Planning estimate: **12–18 focused elapsed hours** for a polished demo with four people, assuming reference detection is viable. A basic playable version may take 6–8 hours. These are estimates, not guarantees.

1. **Feasibility:** run detection on real Lenny scenes and select settings.
2. **Shared contract:** agree on coordinates, endpoints, prediction policy, and scoring.
3. **Parallel implementation:** build detector/backend, frontend annotation, and reveal design.
4. **First integration:** complete one real round from upload to reveal.
5. **Rematch:** add session score and round history.
6. **Deployment:** verify on intended hosting and a second device.
7. **Polish and rehearsal:** improve instructions, errors, visuals, and the live demo.

Target an early deployment and preserve 2–3 hours of troubleshooting buffer. Custom training would add substantial uncertain work and is not required for completion.

## 10. Verification and definition of done

The project is finished when:

- A judge can complete a round with minimal explanation.
- Detection uses the real model and never receives the marked answer.
- Boxes align correctly on desktop and phone-photo examples.
- No detection, a failed request, and a disputed box are handled distinctly.
- Repeated seek requests preserve the same locked guess.
- Scoring works for correct, incorrect, and oversized predicted boxes.
- Loading, retry, rematch, and session history work.
- The deployed website reaches the backend successfully.
- The team can explain the model, reference conditioning, limitations, and game rules.

Prioritize meaningful checks for box conversion, scoring, repeated requests, and end-to-end inference. Test actual images alongside API behavior.

## 11. Demo plan

Run a best-of-three challenge:

1. Show Lenny in an obvious scene to establish baseline ability.
2. Invite a judge to hide their Lenny fairly among props on the table.
3. Upload the photo, mark the answer, and lock the AI prediction.
4. Reveal both boxes and the result.
5. Rearrange and rematch; display the round history.

Have tested example photos available if live capture or connectivity becomes troublesome, and clearly identify prerecorded examples. Record a backup demo video showing the actual working application.

**Opening pitch:** “Everyone here has Lenny. We built a game that challenges you to hide him in plain sight from an open-source vision model.”

**Technical explanation:** “The model compares a reference photo with the scene and predicts a bounding box. Our backend locks that guess and scores it against the separately stored answer.”

## 12. Scope guardrails

Defer these until the main loop is reliable:

- Custom training.
- Accounts, global leaderboards, and persistent player profiles.
- Real-time video detection.
- AI-generated hiding scenes or an AI-hider mode.
- Audio, chat, and unrelated model features.
- Automated fairness verification.
- Claims that any uploaded object will work reliably.

Possible stretch features: custom reference upload, additional reference angles, public leaderboard, or tested image tiling. Add at most one that improves the demonstrated game.

**Shared priority:** Make one complete, fair, understandable round work reliably, then make the reveal and rematch memorable.
