# Transcript-editor trial merge: Runtime findings

Date: 2026-10-16. Source: a three-repo trial merge (Astrid, Runtime, App) on 15 Oct 2026, plus editor efficiency work in the App.
Re-verified against Runtime HEAD `9780b59`. Paths are repo-relative.

## Open

| # | Finding | Evidence | Fix direction |
|---|---|---|---|
| 1 | Every response carries `Cache-Control: no-store`, including sha256-addressed objects that never change. The App's proxies override it with `private, max-age=31536000, immutable`, so any other client gets no caching. Without the override, audio and media were refetched on every use (a contributor to silent or late audio under load) | `runtime_protocol/server.py:171` (`_send`, all JSON) and `:191` (`_send_file`). The digest object GET (`~:650-690`, ETag `"sha256:<digest>"`, `X-Content-Digest`) goes through `_send_file` (`:688`). Nothing in the repo sets `immutable` or `max-age` | Send `private, max-age=31536000, immutable` for `/v1/objects/sha256:<digest>` GET/HEAD (200/206/304) and keep `no-store` elsewhere; then drop the proxy overrides |
| 2 | The contract exists as hand-synced copies across three repos (Runtime packages, Astrid's vendored Python client, the App's `generated.ts`). Runtime `4aa5215` moved the schema digest and Astrid's pin was stale, also on the contributor's own branch, so that branch could not have run end to end | Digest from `generators/generate.py:51` `contract_digest()` is written into `runtime_protocol/contract_metadata.py:5`, `packages/python/astrid_runtime_client/{contract_metadata.py:5,generated.py:16}`, `packages/typescript/src/{contract-metadata.ts:5,generated.ts}`. Parity tests are in-repo only (`tests/test_client_parity.py:49,92-94`, `tests/test_typescript_generator.py:31,36`, `tests/test_generated_client.py:116`); none references Astrid or the App | A cross-repo gate: Astrid and the App assert their copies equal the Runtime digest at the pinned Runtime commit; publish the clients as a versioned artifact |
| 3 | Nothing ties the Runtime's routes to the OpenAPI or to the relay's allowlist. Routing is a hand-written `if` chain; the paired relay (in the App, `config/vite/pairedRoutePolicy.ts`) keeps its own method-aware table. New routes 404 in paired/hosted mode while local mode works. This happened to the transcript `documents` routes (fixed in the App by `f53e239cb`, not in this repo) | `runtime_protocol/server.py` `_route()` (`:233` onward); document routes in `contract/openapi/workspace-v1.yaml:126-146`, dispatched at `server.py:464`. The existing route-removal guard is `tests/test_zero_shim_boundary.py:37` | Generate the route table (or a route list) from the OpenAPI and test dispatch and relay against it |
| 4 | List pages are capped (default 50, max 200 rows: `runtime_protocol/service.py:59-60`, `_page_args` `:373-382`, OpenAPI `Limit` `workspace-v1.yaml:846`), but responses have no byte cap. Rows grow with the realm, and the Astrid CLI's `runs list --json` exceeded its 4 MiB canonical-JSON cap and failed. Request bodies are capped at 64 MiB (`server.py:30`) | `server.py:175-183` writes whatever bytes are produced | A response byte budget, or smaller default pages for heavy rows (runs, tasks) |
| 5 | Validation limits are written twice and differ: Runtime allows 10,000 segments, 256-byte ids, non-empty text (max 16,384 bytes), 100,000 words, 1 MiB document. The App's zod schema allows 100,000 segments, 1024-char ids and empty text | Runtime constants `service.py:100-106`, enforced `:4292-4372`. App: `src/tools/video-editor/data/typed/projectTranscript.ts` | Publish the limits in `contract/schemas/document.json` and have clients derive them |
| 6 | No batched variants read. The App issues one `GET /v1/generations/<id>/variants?limit=200` per generation (about 60 sequential calls per editor load on a busy realm) | `contract/openapi/workspace-v1.yaml` has only per-generation list and single get (variants route list `server.py:838`) | A batched or project-level variants endpoint |
| 7 | Possibly stale `updated_at`: the App's variant cache refreshes only when the generation's `updated_at` changes. A new variant bumps it; star, viewed and thumbnail-attach changes may not (observed through the App's behaviour, not read in `service.py`) | Unverified in this repo | Bump `updated_at` on any variant-visible change, or expose a variants revision |
| 8 | A long-lived local Runtime can drift from the checkout that talks to it: a live Runtime returned 404 for `/composition-revisions` and rejected the CLI with "worker credential scopes are incompatible ... restart" until restarted. The Runtime port also changes on every restart, and the process dies with the session that launched it | Operational; no supervision | Version handshake that names the fix ("restart the Runtime"); supervised stacks |

## Checked and dropped

| Claim | Result |
|---|---|
| "The Runtime test `spec_json` is stale" | No such test at HEAD. `tests/test_runtime_compact.py:65` uses `spec_digest`; remaining `spec_json` references are legacy-schema migration fixtures (`tests/test_runtime_upgrade.py`). Related tests pass: `test_compact_poll_codec_replays_exact_catalog_and_task_spec` and the two zero-shim/CLI tests (3 passed) |
| "`test_canonical_aliases` fails" | That test lives in Astrid (`tests/test_canonical_aliases.py`), not here; see the Astrid findings |
| "List endpoints are unbounded" | Not in the Runtime: all list routes cap at 200. The unbounded default is the Astrid CLI's `--json` path (finding 4 above is the remaining gap) |
| The B1 relay allowlist | Lives in the App, not here (finding 3) |

## Context

- Commit `4aa5215` ("Add validated project transcript documents") touched the OpenAPI, `contract/schemas/document.json`, `generators/generate.py`, the four digest copies, `service.py` (+132) and `tests/test_transcript_documents.py`. It is an ancestor of HEAD. Astrid fixed its pin in its revendor (`283ceb40`) and `8f0620ed`.
- Delivery branches that sit 12 to 43 commits behind main make each delivery a three-repo integration; findings 2 and 3 surface only at merge.
