# Astrid public boundary bundle

`bundle.json` identifies the versioned producer bundle for Astrid’s public CLI
surface and diagnostic projection. Consumers select the bundle through the
immutable Astrid commit; the bundle version is metadata, not a Runtime
admission check. Bundle paths are relative to the repository root, and every
listed file is covered by the producer’s `artifacts.json` integrity manifest.

The bundle includes the existing `cli-surface.json`, the diagnostic schema,
and shared command-effect, diagnostic, and redaction fixtures. Producer
conformance exercises actual CLI and gateway output against those artifacts.
Dynamic timestamps and elapsed durations may be normalized only after schema
and semantic validation. Cross-field checks still require captured counts and
bytes to stay within declared limits, and elapsed time to stay within the
deadline.

Diagnostics are observations only: they execute no suggested actions. Each
suggested command carries its declared effects and required authorization;
effectful actions require authorization, and redacted placeholders are inert.
Unobserved facts retain null values and timestamps with an unavailable reason;
other healthy observations do not make them known. Shared diagnostics redact
private paths and sensitive transport material.

`command-effects.json` defines the eleven commands permitted in diagnostic
suggestions, including commands owned by Runtime and Hivemind. The generated
CLI surface remains the command parser export; the suggestion table is not a
complete inventory of the App's historical C1 command composition.

The C2 wire identity remains intact for existing consumers. The App's current
freeze gates stay in place until its separately pinned bundle migration.

Compatible additions increment the minor version; fixes increment the patch
version. Incompatible public contract changes require a protocol major.
