# Canonical Astrid execution and task admission

Status: post-cutover CPU boundary, 2026-09-10.

Astrid App is the client/editor and timeline consumer. Browser generation producers use the canonical task-creation client in `src/shared/lib/taskCreation/createTask.ts`, which admits a typed request through `src/integrations/astrid/client.ts`. Astrid Runtime owns task, run, receipt, event-history, and settlement authority. The Worker executes the admitted work through Runtime's `GenericPackHost`; Runtime settlement publishes output and provenance to CAS, and Astrid App reads the result through the canonical gallery or timeline readback path.

## Supported execution path

```text
UI producer
  -> Astrid App createTask
  -> Astrid Runtime admission (family, project, CAS/input refs, idempotency)
  -> Worker Runtime/GenericPackHost execution
  -> Runtime-owned settlement and receipts
  -> CAS/gallery/timeline readback
```

This path is the authority for supported image, video, character-animation, and related producers. Input identity, ordered inputs, output validation, idempotency, and publication are carried by the admitted Runtime task and its settlement fence.

## Removed legacy boundary

The Supabase `create-task` endpoint, the `ai-timeline-agent` function, legacy task rows, `materialized_inputs`, legacy `task_types` and the browser-side route derivation were removed with the cloud backend (removed 2026-10-18, tag `pre-cloud-removal`). There is no browser-side fallback to direct task insertion or legacy task lifecycle writes. The future online backend is designed in `docs/design/cloud-mode-*`.

## Worker and route boundary

The retained Worker route catalog and Stage1 substrate describe execution capability only. They are not an admission authority and do not justify a browser producer or a direct task-table write. Supported claim, progress, and settlement operations use the Runtime edge contract. The supported Worker has no direct database fallback for task lifecycle writes.

## Acceptance evidence

- Astrid App source boundary: commit `87a98d3`.
- Worker retry boundary: commit `50c6bf1`; supported launcher lineage remains `41df4b0`.
- Canonical producer regression suite: 39 tests passed.
- Strict island typecheck and targeted lint passed.
- Worker focused residual suite: 30 tests passed.

These are CPU boundary claims. They do not claim GPU/model/provider availability. Final CR2 closure remains a separate evidence and review step.
