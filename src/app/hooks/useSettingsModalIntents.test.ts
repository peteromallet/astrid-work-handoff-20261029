import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchAppEvent } from '@/shared/lib/typedEvents';
import { useSettingsEventIntent } from './useSettingsModalIntents';

describe('useSettingsModalIntents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles openSettings app event intents', () => {
    const onIntent = vi.fn();

    renderHook(() => useSettingsEventIntent(onIntent));

    act(() => {
      dispatchAppEvent('openSettings', { tab: 'extensions' });
      dispatchAppEvent('openSettings', {});
    });

    expect(onIntent).toHaveBeenNthCalledWith(1, { settingsTab: 'extensions' });
    expect(onIntent).toHaveBeenNthCalledWith(2, { settingsTab: undefined });
  });
});
