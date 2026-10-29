import { createElement, useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineExtension, type AstridExtension, type ContributionId, type ExtensionId, type PanelRenderProps } from '@astrid/editor-sdk';
import { ExtensionPanelHost, getPanelKey } from './ExtensionPanelHost';
import { normalizeExtensionRuntime, type VideoEditorPanelDescriptor } from './extensionSurface';
import { createRendererRegistry } from './extensionRendererRegistry';
import { createExtensionUiService, resolveRegisteredRenderers } from './extensionRenderSurface';
import { ASTRID_EDITOR_EXTENSION_CATALOG } from '@astrid/packs/rendering/editor/catalog';
import { createDataKindRegistry } from '@/tools/video-editor/data-kinds/DataKindRegistry.ts';
import { createDataKindRegistrationService } from '@/tools/video-editor/runtime/dataKindRegistrationService.ts';
import { useEditorRuntimeAssembly } from '@/tools/video-editor/contexts/editorRuntimeAssembly';

vi.mock('@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx', () => ({
  useOptionalVideoEditorRuntime: () => null,
}));

afterEach(cleanup);

describe('registered panel lifecycle', () => {
  it('keeps the last panel and its draft visible during renderer re-registration, then removes an undeclared panel', () => {
    const extensionId = 'com.test.reconnecting' as ExtensionId;
    const unmount = vi.fn();
    function Transcript({ revision }: { revision: string }) {
      const [draft, setDraft] = useState('Last good transcript');
      useEffect(() => () => unmount(), []);
      return <label>{revision}<textarea aria-label="Transcript draft" value={draft} onChange={(event) => setDraft(event.target.value)} /></label>;
    }
    const extension = (renderId: string, declared = true) => defineExtension({
      manifest: {
        id: extensionId, version: '1.0.0', apiVersion: 1,
        contributions: declared ? [{ id: 'transcript' as ContributionId, kind: 'panel', placement: 'asset-panel', render: renderId }] : [],
      },
      activate: () => {},
    });
    let assembly!: ReturnType<typeof useEditorRuntimeAssembly>;
    function Host({ extensions }: { extensions: readonly AstridExtension[] }) {
      assembly = useEditorRuntimeAssembly({ extensions, commandRegistryCallbacks: {} });
      const panels = assembly.resolvedExtensionsConfig.registry.panels;
      return <ExtensionPanelHost panels={panels} visiblePanelKeys={new Set(panels.map(getPanelKey))} />;
    }
    const first = extension('first-renderer');
    const view = render(<Host extensions={[first]} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    act(() => { assembly.rendererRegistryRef.current.register(extensionId, 'first-renderer', () => <Transcript revision="First bundle" />); });
    const draft = screen.getByRole('textbox', { name: 'Transcript draft' });
    fireEvent.change(draft, { target: { value: 'Unsent correction' } });

    // A replacement manifest can arrive before its renderer, including a new
    // render ID. Neither that commit nor unregisterAll may blank the panel.
    const replacement = extension('replacement-renderer');
    view.rerender(<Host extensions={[replacement]} />);
    expect(screen.getByRole('textbox')).toBe(draft);
    act(() => { assembly.rendererRegistryRef.current.unregisterAll(extensionId); });
    expect(draft).toBeVisible();
    expect(draft).toHaveValue('Unsent correction');
    expect(unmount).not.toHaveBeenCalled();
    act(() => { assembly.rendererRegistryRef.current.register(extensionId, 'replacement-renderer', () => <Transcript revision="Reconnected bundle" />); });
    expect(screen.getByText('Reconnected bundle')).toBeVisible();
    expect(screen.getByRole('textbox')).toBe(draft);
    expect(draft).toHaveValue('Unsent correction');

    // A real contribution removal still ends its lifetime and its fallback.
    view.rerender(<Host extensions={[extension('replacement-renderer', false)]} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(unmount).toHaveBeenCalledTimes(1);
    act(() => { assembly.rendererRegistryRef.current.unregisterAll(extensionId); });
    view.rerender(<Host extensions={[replacement]} />);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('loads the actual rendering-pack transcript entry through its scoped renderer registration', async () => {
    const transcriptEntry = ASTRID_EDITOR_EXTENSION_CATALOG.find((entry) =>
      entry.packId === 'rendering' && entry.entryPath === 'ui/transcript/extension.tsx');
    expect(transcriptEntry).toBeDefined();
    const transcriptExtension = transcriptEntry!.extension;
    const registry = createRendererRegistry();
    const ui = createExtensionUiService({
      extension: transcriptExtension,
      diagnosticsService: { report: vi.fn(), diagnostics: [] },
      rendererRegistry: registry,
    });
    const runtime = normalizeExtensionRuntime([transcriptExtension]);
    expect(resolveRegisteredRenderers(runtime, registry.getSnapshot()).registry.panels).toEqual([]);
    const diagnostics = { report: vi.fn(), diagnostics: [] };
    const dataKindRegistry = createDataKindRegistry();
    const dataKinds = createDataKindRegistrationService({
      extension: transcriptExtension,
      dataKindRegistry,
      diagnosticsService: diagnostics,
    });
    const registration = await transcriptExtension.activate({ ui, dataKinds } as never);
    expect(dataKindRegistry.resolve('astrid.transcript')?.ownerExtensionId).toBe('haus.astrid.transcript-lane');
    const panels = resolveRegisteredRenderers(runtime, registry.getSnapshot()).registry.panels;
    expect(panels[0]).toMatchObject({
      extensionId: 'haus.astrid.transcript-lane', id: 'transcript-lane-panel',
      renderId: 'haus.astrid.transcript-lane.panel',
    });
    const view = render(<ExtensionPanelHost panels={panels} visiblePanelKeys={new Set(panels.map(getPanelKey))} />);
    expect(screen.getByTestId('astrid-transcript-panel')).toBeVisible();
    if (registration) registration.dispose();
    expect(dataKindRegistry.resolve('astrid.transcript')).toBeUndefined();
    const removed = resolveRegisteredRenderers(runtime, registry.getSnapshot()).registry.panels;
    view.rerender(<ExtensionPanelHost panels={removed} visiblePanelKeys={new Set()} />);
    expect(screen.queryByTestId('astrid-transcript-panel')).toBeNull();
  });

  it('resolves identical render/contribution IDs independently for each extension owner', () => {
    const registry = createRendererRegistry();
    const extensions = ['com.test.first', 'com.test.second'].map((id) => defineExtension({
      manifest: {
        id: id as ExtensionId, version: '1.0.0', apiVersion: 1, label: id,
        contributions: [{ id: 'shared' as ContributionId, kind: 'panel', render: 'shared-renderer' }],
      },
      activate: () => {},
    }));
    const runtime = normalizeExtensionRuntime(extensions);
    registry.register('com.test.first', 'shared-renderer', () => 'first');
    registry.register('com.test.second', 'shared-renderer', () => 'second');
    const panels = resolveRegisteredRenderers(runtime, registry.getSnapshot()).registry.panels;
    expect(panels.map(getPanelKey)).toEqual(['com.test.first:shared', 'com.test.second:shared']);
    expect(panels.map((panel) => panel.render({ instanceId: getPanelKey(panel), visible: true }))).toEqual(['first', 'second']);
    registry.unregisterAll('com.test.first');
    expect(resolveRegisteredRenderers(runtime, registry.getSnapshot()).registry.panels.map(getPanelKey)).toEqual(['com.test.second:shared']);
  });

  it('retains drafts through switches, isolates hosts, suspends subscriptions and cleans up on removal/unmount', () => {
    const observe = vi.fn();
    const dispose = vi.fn();
    const unmount = vi.fn();
    function StatefulPanel({ instanceId, visible }: PanelRenderProps) {
      const [draft, setDraft] = useState('');
      useEffect(() => () => { unmount(instanceId); }, [instanceId]);
      useEffect(() => {
        if (!visible) return;
        observe(instanceId);
        return () => { dispose(instanceId); };
      }, [instanceId, visible]);
      return <input aria-label={instanceId} value={draft} onChange={(event) => setDraft(event.target.value)} />;
    }
    const panels: VideoEditorPanelDescriptor[] = ['first', 'second'].map((id) => ({
      id, extensionId: 'com.test.panels', placement: 'asset-panel',
      render: (props) => createElement(StatefulPanel, props),
    }));
    const show = (visible: string, retained = panels) => <ExtensionPanelHost panels={retained} visiblePanelKeys={new Set([`com.test.panels:${visible}`])} />;
    const firstHost = render(show('first'));
    const secondHost = render(show('first'));
    const firstInput = firstHost.container.querySelector('input')!;
    const secondInput = secondHost.container.querySelector('input')!;
    expect(firstInput.getAttribute('aria-label')).not.toBe(secondInput.getAttribute('aria-label'));
    fireEvent.change(firstInput, { target: { value: 'retained correction draft' } });
    firstHost.rerender(show('second'));
    expect(firstInput).not.toBeVisible();
    expect(unmount).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledWith(firstInput.getAttribute('aria-label'));
    firstHost.rerender(show('first'));
    expect(firstHost.container.querySelector('input')).toBe(firstInput);
    expect(firstInput.value).toBe('retained correction draft');
    expect(secondInput.value).toBe('');
    firstHost.rerender(show('second', panels.slice(1)));
    expect(unmount).toHaveBeenCalledWith(firstInput.getAttribute('aria-label'));
    firstHost.unmount();
    secondHost.unmount();
    expect(unmount).toHaveBeenCalledTimes(4);
    expect(observe.mock.calls).toHaveLength(dispose.mock.calls.length);
  });
});

describe('per-extension video binding', () => {
  it('gives each extension its own adapter and leaves the host adapter untouched', () => {
    const seen: Record<string, unknown> = {};
    const panel = (extensionId: string): VideoEditorPanelDescriptor => ({
      id: `${extensionId}-panel`, extensionId, placement: 'asset-panel',
      render: ({ video }: PanelRenderProps) => { seen[extensionId] = video; return null; },
    });
    const video = { view: {}, seek: vi.fn() } as never;
    const bindVideo = vi.fn((adapter: object, extensionId: string) => ({ ...adapter, bound: extensionId }) as never);
    const panels = [panel('ext.a'), panel('ext.b')];
    render(<ExtensionPanelHost panels={panels} visiblePanelKeys={new Set(panels.map(getPanelKey))} video={video} bindVideo={bindVideo} />);
    expect(seen['ext.a']).toMatchObject({ bound: 'ext.a' });
    expect(seen['ext.b']).toMatchObject({ bound: 'ext.b' });
    expect(video).not.toHaveProperty('bound');
    expect(bindVideo).toHaveBeenCalledTimes(2);
  });
});
