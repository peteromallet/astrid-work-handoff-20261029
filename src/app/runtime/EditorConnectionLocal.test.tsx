// @vitest-environment-options {"url":"https://astrid.haus/tools/video-editor?project=p1"}
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setRuntimeOrigin } from '@/integrations/runtime/connection.ts';
import { RuntimeConnectionGate, RuntimeConnectionProvider } from '@/integrations/runtime/RuntimeConnectionProvider.tsx';
import { EditorConnectionPanel } from './RuntimeDocumentBoundary.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('editor gate: the local (same-origin) path', () => {
  it('never touches navigator.permissions, never fetches, and shows no step', () => {
    setRuntimeOrigin({});
    const query = vi.fn();
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(
      <RuntimeConnectionProvider>
        <RuntimeConnectionGate panel={(connection, exit) => <EditorConnectionPanel connection={connection} exit={exit} />}>
          <div data-testid="editor" />
        </RuntimeConnectionGate>
      </RuntimeConnectionProvider>,
    );
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(screen.queryByTestId('runtime-not-connected')).not.toBeInTheDocument();
    expect(query).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
