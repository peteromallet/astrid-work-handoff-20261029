import { describe, expect, it, vi } from 'vitest';
import { defineExtension, type AstridExtension, type ExtensionId } from '@astrid/editor-sdk';
import { createDataKindItemsHost } from '@/tools/video-editor/data-kinds/dataKindItems.ts';
import { createExtensionLifecycleHost } from '@/tools/video-editor/runtime/extensionLifecycle.ts';
import { subscribeToDataKindProjectionCleanup } from './dataKindProjectionCleanup.ts';

const item = (schemaRef: string) => ({
  id: `item-${schemaRef}`,
  shape: 'interval' as const,
  domain: 'source_seconds' as const,
  extent: { start: 0, end: 1 },
  schemaRef,
  payload: { text: schemaRef },
  sourceArtifactRef: { assetId: 'media' },
  provenance: { adapterId: 'test', adapterVersion: '1' },
});

function extension(version: string, schemaRefs: readonly string[]): AstridExtension {
  return defineExtension({
    manifest: {
      id: 'com.test.transcript' as ExtensionId,
      version,
      apiVersion: 1,
      contributions: schemaRefs.map((schemaRef, index) => ({
        id: `kind-${index}` as never,
        kind: 'dataKind' as const,
        kindId: `kind-${index}`,
        schemaRef,
        shape: 'interval' as const,
        domain: 'source_seconds' as const,
      })),
    },
    activate: () => undefined,
  });
}

describe('data-kind projection lifecycle cleanup', () => {
  it('retains a still-declared schema on manifest replacement and clears old schemas on replacement/removal', () => {
    const lifecycle = createExtensionLifecycleHost();
    const items = createDataKindItemsHost({
      dataRef: { current: null },
      commitData: vi.fn(),
    });
    const old = extension('1.0.0', ['transcript/v1', 'obsolete/v1']);
    const replacement = extension('1.1.0', ['transcript/v1', 'added/v1']);
    items.replaceTransient('transcript/v1', [item('transcript/v1')]);
    items.replaceTransient('obsolete/v1', [item('obsolete/v1')]);

    const replacementCleanup = subscribeToDataKindProjectionCleanup(
      lifecycle,
      items,
      [old],
      [replacement],
    );
    lifecycle.synchronize([old], () => ({} as never));
    lifecycle.synchronize([replacement], () => ({} as never));
    expect(items.readTransient('transcript/v1')).toEqual([item('transcript/v1')]);
    expect(items.readTransient('obsolete/v1')).toEqual([]);
    replacementCleanup.dispose();
    items.replaceTransient('added/v1', [item('added/v1')]);

    const removalCleanup = subscribeToDataKindProjectionCleanup(
      lifecycle,
      items,
      [replacement],
      [],
    );
    lifecycle.synchronize([], () => ({} as never));
    expect(items.readTransient('transcript/v1')).toEqual([]);
    expect(items.readTransient('added/v1')).toEqual([]);
    removalCleanup.dispose();
    lifecycle.disposeAll();
  });
});
