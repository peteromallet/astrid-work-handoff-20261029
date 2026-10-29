# Visual seam picture and continuity lanes

The immutable parent composition's `config.app.visualSeamContract` carries
authored seam policy. Publish changes through `publish_parent_composition`
with `expected_head`; never rewrite pinned child revisions in storage.

Picture presence and full-frame coverage answer different questions. Any clip
on a visual output lane can establish child picture presence, including custom
renderers, except known auxiliary/effect types and effect, animation or
transition element references. Source/audio lanes and inactive clips do not
supply child picture. Empty-child and child-picture-gap diagnostics check the
union of those picture spans; custom renderer pixels are never inspected.

Only opaque full-frame clips participate in continuity gap/overlap findings.
The rule mirrors the App's `coversFrame`: a visual non-source track, media,
video or image with an asset (or a clip on an explicit `pictureTracks` lane),
clip and track opacity at least 1, and no width/height smaller than the output
resolution. Missing dimensions mean full-frame media. Custom elements of
unknown geometry do not qualify without the explicit picture-track opt-in.
The normalized `coversFrame` flag retains this decision, using the same
parent-first track definitions as render materialization, for nested clips too.

`continuityTracks` selects which full-frame lanes receive gap/overlap checks;
when absent, lanes are inferred only from full-frame picture clips. An
occurrence participates on its parent lane only when it contains a full-frame
picture. Declared transition overlaps and exact authored pauses remain exempt.
Opaque overlay elements neither activate a warning nor appear as opaque risk
at a picture cut. Clip-local effects inherit their picture owner's coverage;
known disclosed timing cues remain available independently.

Negative starts, invalid occurrences and empty/gapped child picture diagnostics
remain. Owner-overhang diagnostics apply only to full-frame picture: clipping
an overlay at its occurrence edge is a composition choice. Reports advise and
never prevent publication or rendering; invalid closure/timing data still
raises normally.

The App and Runtime both run the single set of timelines and expected findings
in `conformance/fixtures/visual-seam-cases-v1.json`. Runtime pytest reads it
locally; App Vitest reads it from `ASTRID_RUNTIME_CHECKOUT`, the existing
cross-repository test convention. No fixture is copied into the App.
