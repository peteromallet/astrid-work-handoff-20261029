import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { mockUpdateSettings } = vi.hoisted(() => ({
  mockUpdateSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/hooks/settings/useToolSettings', () => ({
  useToolSettings: vi.fn(() => ({
    settings: undefined,
    update: mockUpdateSettings,
    isUpdating: false,
  })),
}));

// Mock LoraHeaderActions as a simple component
vi.mock('@/shared/components/LoraHeaderActions', () => ({
  LoraHeaderActions: () => null,
}));

import { useLoraManager } from '@/domains/lora/hooks/useLoraManager';
import type { ActiveLora } from '@/domains/lora/types/lora';

const createActiveLora = (id: string, name: string = 'Test LoRA', strength = 1): ActiveLora => ({
  id,
  name,
  path: `https://hf.co/${id}/model.safetensors`,
  strength,
});

describe('useLoraManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useLoraManager());

    expect(result.current.selectedLoras).toEqual([]);
    expect(typeof result.current.handleRemoveLora).toBe('function');
    expect(typeof result.current.handleLoraStrengthChange).toBe('function');
    expect(typeof result.current.markAsUserSet).toBe('function');
    expect(result.current.hasEverSetLoras).toBe(false);
    expect(result.current.shouldApplyDefaults).toBe(true);
  });

  it('dedupes LoRAs with the same id', () => {
    const { result } = renderHook(() => useLoraManager());

    act(() => {
      result.current.setSelectedLoras([createActiveLora('lora-1'), createActiveLora('lora-1')]);
    });

    expect(result.current.selectedLoras).toHaveLength(1);
  });

  it('handleRemoveLora removes a LoRA', () => {
    const { result } = renderHook(() => useLoraManager());

    act(() => {
      result.current.setSelectedLoras([createActiveLora('lora-1')]);
    });

    expect(result.current.selectedLoras).toHaveLength(1);

    act(() => {
      result.current.handleRemoveLora('lora-1');
    });

    expect(result.current.selectedLoras).toHaveLength(0);
  });

  it('handleLoraStrengthChange updates strength', () => {
    const { result } = renderHook(() => useLoraManager());

    act(() => {
      result.current.setSelectedLoras([createActiveLora('lora-1')]);
    });

    act(() => {
      result.current.handleLoraStrengthChange('lora-1', 0.5);
    });

    expect(result.current.selectedLoras[0].strength).toBe(0.5);
  });

  it('does not fire onExplicitLoraEdit for non-manual strength changes', () => {
    const onExplicitLoraEdit = vi.fn();
    const { result } = renderHook(() =>
      useLoraManager({ onExplicitLoraEdit }),
    );

    act(() => {
      result.current.setSelectedLoras([createActiveLora('lora-1')]);
    });

    onExplicitLoraEdit.mockClear();

    act(() => {
      result.current.handleLoraStrengthChange('lora-1', 0.5, false);
    });

    expect(onExplicitLoraEdit).not.toHaveBeenCalled();
  });

  it('fires onExplicitLoraEdit for default manual strength changes', () => {
    const onExplicitLoraEdit = vi.fn();
    const { result } = renderHook(() =>
      useLoraManager({ onExplicitLoraEdit }),
    );

    act(() => {
      result.current.setSelectedLoras([createActiveLora('lora-1')]);
    });

    onExplicitLoraEdit.mockClear();

    act(() => {
      result.current.handleLoraStrengthChange('lora-1', 0.5);
    });

    expect(onExplicitLoraEdit).toHaveBeenCalledWith({
      kind: 'strength',
      lora: expect.objectContaining({
        id: 'lora-1',
        strength: 0.5,
      }),
      current: [
        expect.objectContaining({
          id: 'lora-1',
          strength: 0.5,
        }),
      ],
    });
  });

  it('markAsUserSet sets hasEverSetLoras', () => {
    const { result } = renderHook(() => useLoraManager());

    expect(result.current.hasEverSetLoras).toBe(false);

    act(() => {
      result.current.markAsUserSet();
    });

    expect(result.current.hasEverSetLoras).toBe(true);
  });

  it('shouldApplyDefaults becomes false once a LoRA is selected', () => {
    const { result } = renderHook(() => useLoraManager());

    expect(result.current.shouldApplyDefaults).toBe(true);

    act(() => {
      result.current.setSelectedLoras([createActiveLora('lora-1')]);
    });

    expect(result.current.shouldApplyDefaults).toBe(false);
  });

  it('setSelectedLoras replaces all LoRAs', () => {
    const { result } = renderHook(() => useLoraManager());

    act(() => {
      result.current.setSelectedLoras([
        { id: 'lora-a', name: 'A', path: 'a.safetensors', strength: 0.8 },
        { id: 'lora-b', name: 'B', path: 'b.safetensors', strength: 0.6 },
      ]);
    });

    expect(result.current.selectedLoras).toHaveLength(2);
  });

  it('enables trigger words when option set', () => {
    const onPromptUpdate = vi.fn();
    const { result } = renderHook(() =>
      useLoraManager({
        enableTriggerWords: true,
        onPromptUpdate,
        currentPrompt: 'existing prompt',
      })
    );

    expect(result.current.handleAddTriggerWord).toBeDefined();

    act(() => {
      result.current.handleAddTriggerWord?.('my_trigger');
    });

    expect(onPromptUpdate).toHaveBeenCalledWith('existing prompt, my_trigger');
  });

  it('handleAddTriggerWord starts new prompt when empty', () => {
    const onPromptUpdate = vi.fn();
    const { result } = renderHook(() =>
      useLoraManager({
        enableTriggerWords: true,
        onPromptUpdate,
        currentPrompt: '',
      })
    );

    act(() => {
      result.current.handleAddTriggerWord?.('my_trigger');
    });

    expect(onPromptUpdate).toHaveBeenCalledWith('my_trigger');
  });

  it('does not include project persistence when not enabled', () => {
    const { result } = renderHook(() => useLoraManager());

    expect(result.current.handleSaveProjectLoras).toBeUndefined();
    expect(result.current.handleLoadProjectLoras).toBeUndefined();
    expect(result.current.hasSavedLoras).toBeUndefined();
  });

  it('includes project persistence when enabled', () => {
    const { result } = renderHook(() =>
      useLoraManager({
        enableProjectPersistence: true,
        projectId: 'proj-1',
      })
    );

    expect(typeof result.current.handleSaveProjectLoras).toBe('function');
    expect(typeof result.current.handleLoadProjectLoras).toBe('function');
  });

});
