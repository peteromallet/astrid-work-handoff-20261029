# Draft voiceover synchronization action

The V3 action accepts an explicit project, timeline reference, timing policy and
optional JSON-compatible settings. It compares pinned script occurrences with
managed draft-audio provenance, asks the connected Runtime for changed speech
through `generation.generate_speech`, validates one candidate and publishes
through the caller-bound canonical authoring client.

The action returns structured `report` and `receipt` values. It does not
create a separate `draft_voiceover` action and it never renders video. Legacy
audio replacement remains explicit through `adopt_clip_ids`; locked, final and
recorded narration remains protected.
