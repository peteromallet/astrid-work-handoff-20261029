/**
 * Wire-shape helpers and journey state for the vitest router (`fakeRuntimeRouter.ts`) and the vitest
 * consumers that build on it. The UI-facing seed lives in `fakeRuntimeSeed.mjs`.
 *
 * Plain ESM JavaScript (no TypeScript). Wire shapes here follow the Runtime v1 routes: polling
 * summaries key identity as `task_id`, admission responses as `id`, gallery rows carry
 * `primary`/`variant_count`, detail carries `variants`.
 */

import {
  FIXTURE_PROJECT,
  createGalleryFixtures,
  createTimelineFixtures,
  fixtureUlid,
} from './fakeRuntimeSeed.mjs';

/** Families this fake admits; everything else maps to capability_unavailable. */
export const AVAILABLE_FAMILIES = ['image_generation', 'render_export', 'rendering.render'];

export function makeAdmittedTaskReadModel({ taskId, family = 'image_generation', capability = 'astrid.qwen_image' }) {
  const now = '2026-08-22T12:00:00Z';
  return {
    id: taskId,
    project_id: fixtureUlid('projsect'),
    capability,
    spec: {
      schema_version: 1,
      family,
      source_task_type: 'qwen_image',
      params: {},
      output_policy: { create_generation: true },
    },
    spec_hash: 'f'.repeat(64),
    input_manifest: [],
    status: 'queued',
    priority: 0,
    available_at: now,
    max_attempts: 3,
    run_id: null,
    run_ordinal: null,
    winning_attempt_id: null,
    cancel_request_id: null,
    cancel_requested_at: null,
    event_head_seq: 1,
    created_at: now,
    updated_at: now,
    finished_at: null,
    dependencies: [],
  };
}

/** Polling-summary projection of one task (the `_task_summary` wire shape). */
export function taskSummaryFromReadModel(readModel) {
  return {
    task_id: readModel.id,
    project_id: readModel.project_id,
    capability: readModel.capability,
    status: readModel.status,
    spec: readModel.spec,
    priority: readModel.priority,
    max_attempts: readModel.max_attempts,
    created_at: readModel.created_at,
    updated_at: readModel.updated_at,
    finished_at: readModel.finished_at ?? null,
    winning_attempt_id: readModel.winning_attempt_id ?? null,
  };
}

/** Bounded current-attempt extra (fence 409s and running-task reads). */
export function makeAttemptWireShape({ attemptNo = 1, status = 'running', statusVersion = 2 }) {
  return {
    attempt_id: fixtureUlid('attemptid'),
    attempt_no: attemptNo,
    status,
    status_version: statusVersion,
    lease_id: fixtureUlid('leaseiden'),
    lease_expires_at: '2026-08-22T12:05:00Z',
    heartbeat_counter: 0,
    last_heartbeat_at: null,
  };
}

/**
 * Mutable journey state shared by the vitest router and (via delegation) the
 * node stub. Tests mutate it directly to drive poll/cancel scenarios.
 */
export function createJourneyState({ assetSrcBaseUrl } = {}) {
  const timeline = createTimelineFixtures({ assetSrcBaseUrl });
  const gallery = createGalleryFixtures();
  return {
    project: FIXTURE_PROJECT,
    timelineSummary: timeline.timelineSummary,
    registry: structuredClone(timeline.registry),
    config: structuredClone(timeline.config),
    configVersion: 1,
    /** task_id → polling summary. */
    tasks: new Map(),
    /** IdempotencyKey → serialized admit body (receipt replay/mismatch). */
    receipts: new Map(),
    /** Admission sequence for deterministic task ULIDs. */
    admissions: 0,
    galleryPageRows: gallery.pageRows,
    galleryDetails: gallery.details,
    /** media_id → {mime, bytes}. */
    media: new Map(gallery.media.map((entry) => [entry.media_id, { mime: entry.mime, bytes: entry.bytes }])),
  };
}
