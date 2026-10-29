# music.duck

`music.duck` analyzes a pinned snapshot of a currently published project
timeline and creates a ducked copy of its music bed. It does not edit or
publish the timeline. The command action is intentionally local: it receives
the selected music and voice media plus their placement metadata in one
Runtime-managed snapshot file and has no Runtime client or timeline access.

For normal use, call the caller-scoped `duck_timeline` SDK helper shown below.
It opens the current published checkout through the caller's connected
`AstridClient`, resolves managed media by digest, builds the snapshot, and
invokes `music.duck` as an action in the requested project. A detached draft is
not an input. The optional `clip` identifies one music clip; when omitted, the
helper accepts the timeline only when it has exactly one music clip. It
refuses an ambiguous bed, including multiple clips on the music track.
`voice_tracks` defaults to `["vo"]`. The analysis uses current timeline
placements and source spans, including each voice clip's placement, source
in-point, duration, speed, volume, and fades. The helper requires a
project-scoped client and timeline slug or ID. It writes the snapshot ZIP,
imports it with `client.media.import_file(project=..., path=...,
idempotency_key=...)`, and passes the returned managed digest as the action's
`snapshot` input.

The single public numeric control is `bed_lu` (default `8`), the target
voice-minus-music loudness gap. The implementation fixes the voiced-moment cap
at 4 LU, gain slew at 2 dB/s, Hann smoothing at 1 s, attenuation floor at
-12 dB, and voice-span merge gap at 1.2 s. The 4 LU cap limits music to
`VO_I - 4 LU` for a voiced 400 ms moment; it does not mean “at most 4 dB of
gain reduction.”

The analyzer evaluates voice energy per line, uses 400 ms K-weighted moments at
10 ms timeline steps, and derives a gain curve subject to the fixed cap, floor,
and slew-rate limits. The slew limit is measured per timeline second; the
source-time control step scales with playback speed. It applies forward and
backward rate limiting, then Hann smoothing. The report records requested and
achieved ducking, including excess caused by smoothing and rate limits. Gain is
authored in source clock and mapped through each clip's playback speed onto the
timeline.

The managed output ports are `music` (primary WAV), `duck` (the analysis
report), and `manifest` (the managed run manifest at
`artifacts/manifest.json`). The WAV retains the
source sample rate, channel count, integer PCM or IEEE float sample format, and
exact frame count. Its dither is deterministic, so repeating a run against the
same source and timeline evidence gives the same output bytes.

This is an analysis and media-generation action. Review the report and listen
to the result before deciding to replace a timeline clip. A replacement is a
separate, ordinary checkout edit and publish, shown in the pack guide. Refuse
`app.duck` metadata on music clips even when its value is an empty mapping;
ducking state is represented by the run report and provenance, not timeline
intent metadata.

## Connected SDK workflow

The caller must supply a project and connected client. In a task, use the task
project when available, otherwise the configured project slug. This one helper
call owns checkout, snapshot creation, action invocation, and waiting for
managed outputs:

```python
import os

from astrid.sdk import AstridClient
from astrid.packs.music.actions.duck.api import duck_timeline

project = os.environ.get("ASTRID_TASK_PROJECT") or os.environ.get("ASTRID_PROJECT_SLUG")
if not project:
    raise RuntimeError("set ASTRID_TASK_PROJECT or ASTRID_PROJECT_SLUG")

with AstridClient.open_from_launcher() as client:
    result = duck_timeline(client, project, "main-final", wait=True)
result.raise_for_error()
print(f"Review run {result.run_id} and its managed music/duck outputs before adoption.")
```

Supply `clip` when the timeline contains more than one music clip, and pass
`voice_tracks` only when the default voice track does not fit the edit. The
direct helper API is
`duck_timeline(client, project, timeline, *, clip=None, voice_tracks=None,
bed_lu=8, wait=True)`. Inspect the `duck` managed output before adopting
`music`. For direct `sdk.invoke("music.duck", kind="action", ...)` calls,
first import the snapshot ZIP through `client.media.import_file(...)` and pass
its returned managed digest as the `snapshot` input. The action has no timeline
input or ambient Runtime connection.

## Tagged reruns

When the selected timeline music contains a prior duck tag, the helper resolves
the original source by its content digest. It fails if that source object is
missing; it does not silently substitute the ducked file as a new source. The
helper still reads the current published timeline and remeasures current voice
placements, so changed voice timing is reflected in the new report and WAV.
Compare the new report with the tagged run before replacing media.
