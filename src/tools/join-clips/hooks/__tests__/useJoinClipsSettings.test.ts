import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { joinClipsSettings, type JoinClipsSettings } from '@/shared/lib/joinClips/defaults';
import { queryKeys } from '@/shared/lib/queryKeys';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';

vi.mock('@/shared/hooks/settings/useToolSettings', async () => {
  const actual = await vi.importActual<typeof import('@/shared/hooks/settings/useToolSettings')>(
    '@/shared/hooks/settings/useToolSettings'
  );

  return {
    ...actual,
    useToolSettings: vi.fn(),
  };
});

import {
  extractSettingsFromCache,
  useToolSettings,
} from '@/shared/hooks/settings/useToolSettings';
import { useJoinClipsSettings } from '../useJoinClipsSettings';

type ToolSettingsResult = {
  settings: JoinClipsSettings | undefined;
  isLoading: boolean;
  error: Error | null;
  update: ReturnType<typeof vi.fn>;
  isUpdating: boolean;
  hasShotSettings: boolean;
};

const mockUseToolSettings = vi.mocked(useToolSettings);

// Join clips settings have no backend write: `save` reconciles the settings cache.
function cachedPrompt(queryClient: QueryClient, projectId: string): string | undefined {
  return extractSettingsFromCache<JoinClipsSettings>(
    queryClient.getQueryData(queryKeys.settings.tool(TOOL_IDS.JOIN_CLIPS, projectId, undefined)),
  )?.prompt;
}

function makeSettings(overrides: Partial<JoinClipsSettings> = {}): JoinClipsSettings {
  return {
    ...structuredClone(joinClipsSettings.defaults),
    ...overrides,
  };
}

function createToolSettingsResult(overrides: Partial<ToolSettingsResult> = {}): ToolSettingsResult {
  return {
    settings: makeSettings(),
    isLoading: false,
    error: null,
    update: vi.fn().mockResolvedValue(undefined),
    isUpdating: false,
    hasShotSettings: true,
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  return { wrapper, queryClient };
}

describe('useJoinClipsSettings', () => {
  let toolSettingsByProjectId: Map<string, ToolSettingsResult>;
  let disabledToolSettings: ToolSettingsResult;
  let loadingToolSettings: ToolSettingsResult;

  beforeEach(() => {
    vi.clearAllMocks();
    toolSettingsByProjectId = new Map();
    disabledToolSettings = createToolSettingsResult({
      settings: undefined,
      isLoading: false,
      hasShotSettings: false,
    });
    loadingToolSettings = createToolSettingsResult({
      settings: undefined,
      isLoading: true,
      hasShotSettings: false,
    });

    mockUseToolSettings.mockImplementation((_toolId, context) => {
      if (!context?.enabled || !context.projectId) {
        return disabledToolSettings;
      }

      return toolSettingsByProjectId.get(context.projectId) ?? loadingToolSettings;
    });
  });

  it('exposes the existing public API and keeps nullish entities inert', async () => {
    const { wrapper, queryClient } = createWrapper();
    const { result, rerender } = renderHook(
      ({ projectId }: { projectId: string | null | undefined }) => useJoinClipsSettings(projectId),
      {
        initialProps: { projectId: null },
        wrapper,
      }
    );

    expect(result.current).toMatchObject({
      settings: joinClipsSettings.defaults,
      status: 'idle',
      entityId: null,
      isDirty: false,
      error: null,
      hasShotSettings: false,
      hasPersistedData: false,
    });
    expect(result.current).toEqual(
      expect.objectContaining({
        updateField: expect.any(Function),
        updateFields: expect.any(Function),
        updateTextField: expect.any(Function),
        updateTextFields: expect.any(Function),
        save: expect.any(Function),
        saveImmediate: expect.any(Function),
        revert: expect.any(Function),
        reset: expect.any(Function),
        initializeFrom: expect.any(Function),
      })
    );

    await act(async () => {
      result.current.updateField('prompt', 'ignored');
      result.current.updateFields({ prompt: 'ignored again' });
      result.current.updateTextField('prompt', 'ignored text');
      result.current.updateTextFields({ prompt: 'ignored batch' });
      result.current.initializeFrom({ prompt: 'still ignored' });
      result.current.revert();
      result.current.reset(makeSettings({ prompt: 'noop reset' }));
      await result.current.save();
      await result.current.saveImmediate(makeSettings({ prompt: 'noop immediate save' }));
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.settings).toEqual(joinClipsSettings.defaults);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);

    toolSettingsByProjectId.set(
      'proj-transition',
      createToolSettingsResult({
        settings: makeSettings({ prompt: 'authoritative prompt' }),
        isLoading: true,
      })
    );

    rerender({ projectId: 'proj-transition' });
    expect(result.current.status).toBe('loading');
    expect(result.current.entityId).toBe('proj-transition');

    toolSettingsByProjectId.set(
      'proj-transition',
      createToolSettingsResult({
        settings: makeSettings({ prompt: 'authoritative prompt' }),
        isLoading: false,
      })
    );
    rerender({ projectId: 'proj-transition' });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
      expect(result.current.settings.prompt).toBe('authoritative prompt');
    });

    rerender({ projectId: undefined });
    expect(result.current.status).toBe('idle');
    expect(result.current.entityId).toBeNull();
  });

  it('keeps status loading until authoritative settings reconcile, then debounces persistence through the public API', async () => {
    toolSettingsByProjectId.set(
      'proj-debounce',
      createToolSettingsResult({
        settings: makeSettings({ prompt: 'server prompt', negativePrompt: 'server negative' }),
        isLoading: true,
      })
    );
    const { wrapper, queryClient } = createWrapper();
    const { result, rerender } = renderHook(() => useJoinClipsSettings('proj-debounce'), {
      wrapper,
    });

    expect(result.current.status).toBe('loading');

    toolSettingsByProjectId.set(
      'proj-debounce',
      createToolSettingsResult({
        settings: makeSettings({ prompt: 'server prompt', negativePrompt: 'server negative' }),
        isLoading: false,
      })
    );
    rerender();

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
      expect(result.current.settings.prompt).toBe('server prompt');
    });

    act(() => {
      result.current.updateField('prompt', 'edited prompt');
    });

    expect(result.current.settings.prompt).toBe('edited prompt');
    expect(result.current.isDirty).toBe(true);
    expect(cachedPrompt(queryClient, 'proj-debounce')).toBeUndefined();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(cachedPrompt(queryClient, 'proj-debounce')).toBeUndefined();

    await waitFor(() => {
      expect(cachedPrompt(queryClient, 'proj-debounce')).toBe('edited prompt');
    }, { timeout: 1000 });
  });

  it('supports initializeFrom as a no-op plus revert and reset(newDefaults) without leaving dirty state behind', async () => {
    toolSettingsByProjectId.set(
      'proj-reset',
      createToolSettingsResult({
        settings: makeSettings({ prompt: 'persisted prompt', contextFrameCount: 24 }),
      })
    );
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useJoinClipsSettings('proj-reset'), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
      expect(result.current.settings.prompt).toBe('persisted prompt');
    });

    act(() => {
      result.current.updateFields({ prompt: 'local edit', contextFrameCount: 99 });
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.initializeFrom({ prompt: 'ignored initializer', contextFrameCount: 100 });
    });
    expect(result.current.settings.prompt).toBe('local edit');
    expect(result.current.settings.contextFrameCount).toBe(99);

    act(() => {
      result.current.revert();
    });
    expect(result.current.settings.prompt).toBe('persisted prompt');
    expect(result.current.settings.contextFrameCount).toBe(24);
    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.reset(makeSettings({ prompt: 'reset prompt', gapFrameCount: 42 }));
    });
    expect(result.current.settings.prompt).toBe('reset prompt');
    expect(result.current.settings.gapFrameCount).toBe(42);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.hasPersistedData).toBe(true);
  });

  it('saveImmediate(dataToSave) syncs the cache and invalidates the authoritative query', async () => {
    toolSettingsByProjectId.set(
      'proj-save-immediate',
      createToolSettingsResult({
        settings: makeSettings({ prompt: 'cached prompt', negativePrompt: 'cached negative' }),
      })
    );
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(
      queryKeys.settings.tool(TOOL_IDS.JOIN_CLIPS, 'proj-save-immediate', undefined),
      {
        settings: makeSettings({ prompt: 'cached prompt', negativePrompt: 'cached negative' }),
        hasShotSettings: false,
      }
    );

    const { result } = renderHook(() => useJoinClipsSettings('proj-save-immediate'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    const nextSettings = makeSettings({
      prompt: 'saved immediately',
      negativePrompt: 'new negative',
    });

    await act(async () => {
      await result.current.saveImmediate(nextSettings);
    });

    expect(
      queryClient.getQueryData(queryKeys.settings.tool(TOOL_IDS.JOIN_CLIPS, 'proj-save-immediate', undefined))
    ).toEqual({
      settings: nextSettings,
      hasShotSettings: false,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.settings.tool(TOOL_IDS.JOIN_CLIPS, 'proj-save-immediate', undefined),
    });
    expect(result.current.isDirty).toBe(false);
  });

  it('flushes pending changes when the project changes, on unmount, and on beforeunload for real entities only', async () => {
    toolSettingsByProjectId.set(
      'proj-flush-a',
      createToolSettingsResult({ settings: makeSettings({ prompt: 'project a' }) })
    );
    toolSettingsByProjectId.set(
      'proj-flush-b',
      createToolSettingsResult({ settings: makeSettings({ prompt: 'project b' }) })
    );
    const { wrapper, queryClient } = createWrapper();
    const { result, rerender, unmount } = renderHook(
      ({ projectId }: { projectId: string | null }) => useJoinClipsSettings(projectId),
      {
        initialProps: { projectId: 'proj-flush-a' },
        wrapper,
      }
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    act(() => {
      result.current.updateField('prompt', 'dirty before switch');
    });

    rerender({ projectId: 'proj-flush-b' });

    await waitFor(() => {
      expect(cachedPrompt(queryClient, 'proj-flush-a')).toBe('dirty before switch');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    act(() => {
      result.current.updateField('prompt', 'dirty before unload');
    });

    await act(async () => {
      window.dispatchEvent(new Event('beforeunload'));
      await Promise.resolve();
    });

        expect(cachedPrompt(queryClient, 'proj-flush-b')).toBe('dirty before unload');

    act(() => {
      result.current.updateField('prompt', 'dirty before unmount');
    });
    unmount();

    await waitFor(() => {
      expect(cachedPrompt(queryClient, 'proj-flush-b')).toBe('dirty before unmount');
    });

    const cacheAfterRealEntities = JSON.stringify(queryClient.getQueryCache().getAll().map((query) => [query.queryKey, query.state.data]));
    const disabledHook = renderHook(() => useJoinClipsSettings(null), { wrapper });

    await act(async () => {
      window.dispatchEvent(new Event('beforeunload'));
      await Promise.resolve();
    });
    disabledHook.unmount();

    expect(
      JSON.stringify(queryClient.getQueryCache().getAll().map((query) => [query.queryKey, query.state.data])),
    ).toBe(cacheAfterRealEntities);
  });
});
