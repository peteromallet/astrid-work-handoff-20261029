import { describe, expect, it, vi } from 'vitest';
import { defineExtension } from '@astrid/editor-sdk';
import {
  buildExtensionLifecycleOperationalEvents,
  createHostOwnedExtensionOperationalEmitter,
  createPrivacySafeExtensionTelemetryHost,
  operationalCountBucket,
  REVIEWED_PRODUCTION_EXTENSION_IDS,
  sanitizeExtensionOperationalEvent,
  selectReviewedExtensions,
} from './extensionReleaseControls';
import { devLocalExtensions } from '@/tools/video-editor/dev/localExtensions';

const TRANSCRIPT_LANE_EXTENSION_ID = 'haus.astrid.transcript-lane';

const extension = (id: string) => defineExtension({
  manifest: { id: id as never, version: '1.0.0', apiVersion: 1, license: 'MIT', label: id },
});

const operationalPolicy = {
  releaseRevision: 'rc1',
  extensionVersions: new Map([
    ['haus.astrid.transcript-lane', new Set(['1.0.0'])],
    ['haus.astrid.example', new Set(['1.0.0'])],
  ]),
};

describe('extension release controls', () => {
  it('admits the actual generated catalog including Transcript', () => {
    const localIds = devLocalExtensions.map((item) => item.manifest.id as string);
    expect(localIds).toContain('haus.astrid.threejs-live-editor');
    expect(localIds).toContain(TRANSCRIPT_LANE_EXTENSION_ID);
    expect(selectReviewedExtensions(devLocalExtensions)).toEqual(devLocalExtensions);
    expect(new Set(REVIEWED_PRODUCTION_EXTENSION_IDS).size).toBe(REVIEWED_PRODUCTION_EXTENSION_IDS.length);
  });

  it('rejects unreviewed extensions while admitting shipped extensions', () => {
    const all = [
      extension('haus.astrid.threejs-live-editor'),
      extension('haus.astrid.unreviewed-local-example'),
      extension(TRANSCRIPT_LANE_EXTENSION_ID),
    ];
    expect(selectReviewedExtensions(all).map((item) => item.manifest.id)).toEqual([
      'haus.astrid.threejs-live-editor', TRANSCRIPT_LANE_EXTENSION_ID,
    ]);
  });

  it('accepts only host-owned manifest identities, versions, revisions, and error classes', () => {
    expect(sanitizeExtensionOperationalEvent({
      event: 'bridge.request',
      outcome: 'failure',
      releaseRevision: 'rc1',
      extensionId: 'haus.astrid.transcript-lane',
      extensionVersion: '1.0.0',
      errorClass: 'bridge.timeout',
      durationMs: 125,
      countBucket: '101-1000',
      browserFamily: 'chrome',
    }, operationalPolicy)).not.toBeNull();
    expect(sanitizeExtensionOperationalEvent({
      event: 'render.outcome',
      outcome: 'failure',
      releaseRevision: 'rc1',
      transcriptText: 'secret creative content',
    }, operationalPolicy)).toBeNull();
    expect(sanitizeExtensionOperationalEvent({
      event: 'extension.activation',
      outcome: 'failure',
      releaseRevision: 'rc1',
      extensionId: 'haus.astrid.example',
      extensionVersion: '9.9.9',
      errorClass: 'activation.error',
    }, operationalPolicy)).toBeNull();
    expect(sanitizeExtensionOperationalEvent({
      event: 'extension.activation',
      outcome: 'failure',
      releaseRevision: 'rc1',
      extensionId: 'haus.astrid.example',
      extensionVersion: '1.0.0',
      errorClass: 'attacker.free_form',
    }, operationalPolicy)).toBeNull();
    expect(sanitizeExtensionOperationalEvent({
      event: 'host.activation',
      outcome: 'success',
      releaseRevision: 'different-release',
    }, operationalPolicy)).toBeNull();
    expect(sanitizeExtensionOperationalEvent({
      event: 'render.outcome',
      outcome: 'success',
      releaseRevision: 'rc1',
      durationMs: 86_400_001,
    }, operationalPolicy)).toBeNull();
  });

  it('drops extension-authored metrics and forwards only host-owned events', () => {
    const sink = vi.fn();
    const telemetry = createPrivacySafeExtensionTelemetryHost();
    telemetry.log('caption text', { projectId: 'private' });
    telemetry.error(new Error('contains a path'));
    telemetry.log({ event: 'host.activation', outcome: 'success', releaseRevision: 'rc1' });
    expect(sink).not.toHaveBeenCalled();

    createHostOwnedExtensionOperationalEmitter(operationalPolicy, sink).emit({
      event: 'host.activation',
      outcome: 'success',
    });
    expect(sink).toHaveBeenCalledOnce();
    expect(sink).toHaveBeenCalledWith({
      event: 'host.activation', outcome: 'success', releaseRevision: 'rc1',
    });
  });

  it('contains hostile payloads and a failing analytics sink', () => {
    const payload = Object.defineProperty({}, 'event', {
      enumerable: true,
      get: () => { throw new Error('hostile getter'); },
    });
    expect(sanitizeExtensionOperationalEvent(payload, operationalPolicy)).toBeNull();

    const emitter = createHostOwnedExtensionOperationalEmitter(operationalPolicy, () => {
      throw new Error('analytics unavailable');
    });
    expect(() => emitter.emit({
      event: 'host.activation',
      outcome: 'success',
    })).not.toThrow();
  });

  it('buckets operational counts at fixed host-owned boundaries', () => {
    expect([0, 1, 10, 11, 100, 101, 1_000, 1_001, 10_000, 10_001].map(
      operationalCountBucket,
    )).toEqual([
      '0', '1-10', '1-10', '11-100', '11-100',
      '101-1000', '101-1000', '1001-10000', '1001-10000', '10001+',
    ]);
  });

  it('forwards bounded host emitters for persistence, render/export, and lane density', () => {
    const sink = vi.fn();
    const emitter = createHostOwnedExtensionOperationalEmitter(operationalPolicy, sink);
    emitter.emit({
      event: 'persistence.conflict',
      outcome: 'failure',
      errorClass: 'persistence.version_conflict',
    });
    emitter.emit({
      event: 'render.outcome',
      outcome: 'failure',
      errorClass: 'render.export_error',
      durationMs: 42,
    });
    emitter.emit({
      event: 'lane.density',
      outcome: 'success',
      countBucket: '101-1000',
    });
    expect(sink.mock.calls.map(([event]) => event)).toEqual([
      expect.objectContaining({ event: 'persistence.conflict', releaseRevision: 'rc1' }),
      expect.objectContaining({ event: 'render.outcome', errorClass: 'render.export_error' }),
      expect.objectContaining({ event: 'lane.density', countBucket: '101-1000' }),
    ]);
  });

  it('emits lifecycle transitions once and disposal on removal', () => {
    const active = [{
      extensionId: 'haus.astrid.example',
      extensionVersion: '1.0.0',
      activationKey: 'haus.astrid.example:1',
      state: 'active' as const,
    }];
    expect(buildExtensionLifecycleOperationalEvents([], active, 'rc1')).toEqual([{
      event: 'extension.activation',
      outcome: 'success',
      releaseRevision: 'rc1',
      extensionId: 'haus.astrid.example',
      extensionVersion: '1.0.0',
    }]);
    expect(buildExtensionLifecycleOperationalEvents(active, active, 'rc1')).toEqual([]);
    expect(buildExtensionLifecycleOperationalEvents(active, [{
      ...active[0],
      activationKey: 'haus.astrid.example:2',
    }], 'rc1')).toEqual([
      expect.objectContaining({ event: 'extension.disposal', outcome: 'success' }),
      expect.objectContaining({ event: 'extension.activation', outcome: 'success' }),
    ]);
    expect(buildExtensionLifecycleOperationalEvents(active, [{
      ...active[0],
      state: 'failed',
    }], 'rc1')).toEqual([
      expect.objectContaining({ event: 'extension.disposal', outcome: 'success' }),
      expect.objectContaining({
        event: 'extension.activation', outcome: 'failure', errorClass: 'activation.error',
      }),
    ]);
    expect(buildExtensionLifecycleOperationalEvents(active, [], 'rc1')).toEqual([{
      event: 'extension.disposal',
      outcome: 'success',
      releaseRevision: 'rc1',
      extensionId: 'haus.astrid.example',
      extensionVersion: '1.0.0',
    }]);
    expect(buildExtensionLifecycleOperationalEvents(active, [{
      ...active[0],
      state: 'inactive',
    }], 'rc1')).toEqual([expect.objectContaining({
      event: 'extension.disposal',
      extensionId: 'haus.astrid.example',
    })]);
    expect(buildExtensionLifecycleOperationalEvents([{
      ...active[0],
      state: 'failed',
    }], [], 'rc1')).toEqual([]);
  });
});
