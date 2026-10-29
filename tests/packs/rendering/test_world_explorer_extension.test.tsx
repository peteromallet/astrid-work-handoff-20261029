// @vitest-environment jsdom
import { isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ExtensionContext, PanelRenderProps } from '@astrid/editor-sdk';
import threejsLiveEditorExtension, {
  WORLD_EXPLORER_PANEL_RENDER_ID,
} from '../../../astrid/packs/rendering/ui/threejs-live-editor/extension';

function fakeContext(options: { ui?: boolean; clipTypeDispose?: () => void; rendererDispose?: () => void } = {}) {
  const clipTypeRegistration = { dispose: vi.fn(options.clipTypeDispose ?? (() => {})) };
  const rendererRegistration = { dispose: vi.fn(options.rendererDispose ?? (() => {})) };
  const registerRenderer = vi.fn(() => rendererRegistration);
  const ctx = {
    clipTypes: { registerClipType: vi.fn(() => clipTypeRegistration) },
    services: {
      diagnostics: { report: vi.fn() },
      i18n: { t: (key: string) => key },
    },
    chrome: { toast: vi.fn() },
    commands: {
      registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    },
    ...(options.ui === false ? {} : { ui: { registerRenderer } }),
  } as unknown as ExtensionContext;
  return { ctx, clipTypeRegistration, rendererRegistration, registerRenderer };
}

describe('World Explorer extension contribution', () => {
  it('contributes a World Explorer panel bound to the registered renderer id', () => {
    expect(threejsLiveEditorExtension.manifest.contributions).toContainEqual(expect.objectContaining({
      kind: 'panel',
      label: 'World Explorer',
      render: WORLD_EXPLORER_PANEL_RENDER_ID,
    }));
  });

  it('registers the panel renderer under that id and returns a valid React element', () => {
    const { ctx, registerRenderer } = fakeContext();
    threejsLiveEditorExtension.activate(ctx);

    expect(registerRenderer).toHaveBeenCalledTimes(1);
    const [id, render] = registerRenderer.mock.calls[0] as unknown as [string, (props: PanelRenderProps) => unknown];
    expect(id).toBe(WORLD_EXPLORER_PANEL_RENDER_ID);

    const element = render({} as PanelRenderProps);
    expect(isValidElement(element)).toBe(true);
  });

  it('disposes the renderer registration even when the clip type dispose throws', () => {
    const { ctx, clipTypeRegistration, rendererRegistration } = fakeContext({
      clipTypeDispose: () => { throw new Error('clip type dispose failed'); },
    });
    const handle = threejsLiveEditorExtension.activate(ctx);

    expect(() => handle.dispose()).toThrow('clip type dispose failed');
    expect(clipTypeRegistration.dispose).toHaveBeenCalledTimes(1);
    expect(rendererRegistration.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes the renderer registration on a normal dispose', () => {
    const { ctx, rendererRegistration } = fakeContext();
    const handle = threejsLiveEditorExtension.activate(ctx);
    handle.dispose();
    expect(rendererRegistration.dispose).toHaveBeenCalledTimes(1);
  });

  it('activates without ctx.ui and does not throw on activation or dispose', () => {
    const { ctx } = fakeContext({ ui: false });
    let handle: ReturnType<typeof threejsLiveEditorExtension.activate> | undefined;
    expect(() => { handle = threejsLiveEditorExtension.activate(ctx); }).not.toThrow();
    expect(() => handle?.dispose()).not.toThrow();
  });
});
