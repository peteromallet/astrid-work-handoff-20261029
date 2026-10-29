// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useToolSettings: vi.fn(),
}));

vi.mock('@/shared/hooks/settings/useToolSettings', () => ({
  useToolSettings: (...args: unknown[]) => mocks.useToolSettings(...args),
}));

import { useEditToolMediaPersistence } from './useEditToolMediaPersistence';

let toolSettingsState: {
  settings: Record<string, unknown> | undefined;
  update: ReturnType<typeof vi.fn>;
  isLoading: boolean;
};

describe('useEditToolMediaPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    toolSettingsState = {
      settings: undefined,
      update: vi.fn().mockResolvedValue(undefined),
      isLoading: false,
    };

    mocks.useToolSettings.mockImplementation(() => toolSettingsState);
  });

  it('starts with no selected media and does not restore one from the tool settings', () => {
    toolSettingsState.settings = { lastEditedMediaId: 'gen-1' };

    const { result } = renderHook(() =>
      useEditToolMediaPersistence({
        settingsToolId: 'edit-images-ui',
        projectId: 'project-1',
      }),
    );

    expect(result.current.selectedMedia).toBeNull();
    expect(result.current.showSkeleton).toBe(false);
    expect(toolSettingsState.update).not.toHaveBeenCalled();
  });

  it('selects media and clears the selection on an explicit close without writing settings', () => {
    const { result } = renderHook(() =>
      useEditToolMediaPersistence({
        settingsToolId: 'edit-images-ui',
        projectId: 'project-1',
      }),
    );

    act(() => {
      result.current.setSelectedMedia({ id: 'gen-2' } as never);
    });
    expect(result.current.selectedMedia?.id).toBe('gen-2');

    act(() => {
      result.current.handleEditorClose();
    });
    expect(result.current.selectedMedia).toBeNull();
    expect(toolSettingsState.update).not.toHaveBeenCalled();
  });

  it('reads the tool settings for the project and reports their loading state', () => {
    toolSettingsState.isLoading = true;

    const { result } = renderHook(() =>
      useEditToolMediaPersistence({
        settingsToolId: 'edit-video-ui',
        projectId: 'project-1',
      }),
    );

    expect(mocks.useToolSettings).toHaveBeenCalledWith('edit-video-ui', {
      projectId: 'project-1',
      enabled: true,
    });
    expect(result.current.isUISettingsLoading).toBe(true);
    expect(result.current.showSkeleton).toBe(true);
    expect(result.current.updateUISettings).toBe(toolSettingsState.update);
  });
});
