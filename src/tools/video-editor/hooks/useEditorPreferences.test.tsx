// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSettingsStore } from '@/shared/settings/instance';
import { installTestSettingsStore, type FakeAppStateApi } from '@/test/settingsStoreHarness';
import {
  defaultPreferences,
  defaultPreferencesForViewport,
  INSPECTOR_DEFAULT_OPEN_MIN_VIEWPORT_PX,
  useEditorPreferences,
} from './useEditorPreferences';

describe('useEditorPreferences right panel state', () => {
  let fake: FakeAppStateApi;

  /** Writes everything pending to the fake Runtime, then reads what a timeline's record holds. */
  const flush = () => getSettingsStore().flush();
  /** What the Runtime holds for a timeline's preferences, as JSON (an undefined field is not kept). */
  const savedFor = (timelineId: string): Record<string, unknown> => JSON.parse(JSON.stringify(
    fake.record(`ui.timeline.${timelineId}`).content?.['timeline.preferences'] ?? {},
  ));

  beforeEach(() => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => values.clear(),
    };
    vi.stubGlobal('localStorage', storage);
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
    localStorage.clear();
    fake = installTestSettingsStore().fake;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps preferences in memory only when persistence is off (the tour demo): nothing read, nothing written', () => {
    localStorage.setItem('video-editor:preferences:demo', JSON.stringify({ scaleWidth: 222 }));
    const setItem = vi.spyOn(localStorage, 'setItem');

    const { result } = renderHook(() => useEditorPreferences('demo', 1280, { persist: false }));
    expect(result.current.scaleWidth).toBe(defaultPreferences.scaleWidth);

    act(() => result.current.setScaleWidth(300));
    act(() => vi.advanceTimersByTime(500));

    expect(result.current.scaleWidth).toBe(300);
    expect(setItem).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('video-editor:preferences:demo') ?? '{}')).toEqual({ scaleWidth: 222 });
  });

  it('migrates older timeline records and persists panel, slot, and lane choices', async () => {
    localStorage.setItem('video-editor:preferences:legacy', JSON.stringify({
      scaleWidth: 190,
      activeClipTab: 'timing',
      assetPanel: { showAll: true, showHidden: false, hidden: [] },
    }));

    const { result } = renderHook(() => useEditorPreferences('legacy', 1280));
    expect(result.current.preferences.selectedRightPanelId).toBe('host:properties');
    expect(result.current.preferences.rightPanelLayoutSlotsByPanelId).toEqual({});
    expect(result.current.preferences.showDataLanes).toBe(false);
    expect(result.current.preferences.showTranscriptLane).toBe(true);

    act(() => {
      result.current.setSelectedRightPanelId('haus.astrid.transcript-lane:transcript-lane-panel');
      result.current.setRightPanelLayoutSlot('haus.astrid.transcript-lane:transcript-lane-panel', 'compact');
      result.current.setShowDataLanes(true);
    });
    act(() => vi.advanceTimersByTime(250));

    await flush();
    const saved = savedFor('legacy');
    expect(saved.selectedRightPanelId).toBe('haus.astrid.transcript-lane:transcript-lane-panel');
    expect(saved.rightPanelLayoutSlotsByPanelId).toEqual({
      'haus.astrid.transcript-lane:transcript-lane-panel': 'compact',
    });
    expect(saved.showDataLanes).toBe(true);
    expect(saved.scaleWidth).toBe(190);
  });

  it('keeps two timeline hosts isolated and persists an explicit closed panel', () => {
    const first = renderHook(() => useEditorPreferences('first', 1280));
    const second = renderHook(() => useEditorPreferences('second', 1280));

    act(() => {
      first.result.current.setSelectedRightPanelId(null);
      first.result.current.setRightPanelLayoutSlot('haus.astrid.transcript-lane:transcript-lane-panel', 'compact');
      first.result.current.setShowDataLanes(true);
    });

    expect(first.result.current.preferences.selectedRightPanelId).toBeNull();
    expect(second.result.current.preferences.selectedRightPanelId).toBe('host:properties');
    expect(second.result.current.preferences.showDataLanes).toBe(false);
    expect(second.result.current.preferences.rightPanelLayoutSlotsByPanelId).toEqual({});
  });
  it.each([
    { name: 'phone', width: 420, open: false },
    { name: 'portrait tablet', width: 834, open: false },
    { name: 'just under the threshold', width: INSPECTOR_DEFAULT_OPEN_MIN_VIEWPORT_PX - 1, open: false },
    { name: 'landscape tablet', width: 1180, open: true },
    { name: 'desktop', width: 1600, open: true },
  ])('with nothing saved, $name ($width px) starts with the Inspector dock open: $open', ({ width, open }) => {
    const { result } = renderHook(() => useEditorPreferences(`default-${width}`, width));
    expect(result.current.preferences.selectedRightPanelId).toBe(open ? 'host:properties' : null);
    expect(defaultPreferencesForViewport(width).selectedRightPanelId).toBe(open ? 'host:properties' : null);
  });

  it('lets a saved choice win over the viewport default, and never flips on resize', () => {
    localStorage.setItem('video-editor:preferences:saved-open', JSON.stringify({ ...defaultPreferences, selectedRightPanelId: 'host:properties' }));
    localStorage.setItem('video-editor:preferences:saved-closed', JSON.stringify({ ...defaultPreferences, selectedRightPanelId: null }));
    expect(renderHook(() => useEditorPreferences('saved-open', 420)).result.current.preferences.selectedRightPanelId).toBe('host:properties');
    expect(renderHook(() => useEditorPreferences('saved-closed', 1600)).result.current.preferences.selectedRightPanelId).toBeNull();

    let width = 420;
    const { result, rerender } = renderHook(() => useEditorPreferences('resized', width));
    expect(result.current.preferences.selectedRightPanelId).toBeNull();
    width = 1600;
    rerender();
    expect(result.current.preferences.selectedRightPanelId).toBeNull();
  });

  it('never turns the viewport default into a saved choice: a narrow first open still opens the dock on a wide one', async () => {
    const narrow = renderHook(() => useEditorPreferences('narrow-first', 420));
    expect(narrow.result.current.preferences.selectedRightPanelId).toBeNull();
    act(() => vi.advanceTimersByTime(1_000));
    await flush();
    // Mounting (and the default it shows) writes nothing: only an explicit set does.
    expect(fake.puts()).toEqual([]);
    expect(fake.record('ui.timeline.narrow-first').content).toBeNull();
    narrow.unmount();

    const wide = renderHook(() => useEditorPreferences('narrow-first', 1600));
    expect(wide.result.current.preferences.selectedRightPanelId).toBe('host:properties');
  });

  it('keeps the panel selection out of the record when an unrelated setting is saved, so the default is re-derived', async () => {
    const narrow = renderHook(() => useEditorPreferences('zoomed-narrow', 420));
    act(() => narrow.result.current.setScaleWidth(240));
    act(() => narrow.result.current.setShowDataLanes(true));
    act(() => vi.advanceTimersByTime(1_000));
    await flush();
    const saved = savedFor('zoomed-narrow');
    expect(saved.scaleWidth).toBe(240);
    expect(saved.showDataLanes).toBe(true);
    expect('selectedRightPanelId' in saved).toBe(false);
    narrow.unmount();

    const wide = renderHook(() => useEditorPreferences('zoomed-narrow', 1600));
    expect(wide.result.current.scaleWidth).toBe(240);
    expect(wide.result.current.preferences.selectedRightPanelId).toBe('host:properties');
  });

  it('saves an explicit panel choice, including closed, and that choice wins on every later load', async () => {
    const wide = renderHook(() => useEditorPreferences('explicit-closed', 1600));
    act(() => wide.result.current.setSelectedRightPanelId(null));
    act(() => vi.advanceTimersByTime(1_000));
    await flush();
    expect(savedFor('explicit-closed').selectedRightPanelId).toBeNull();
    wide.unmount();

    expect(renderHook(() => useEditorPreferences('explicit-closed', 1600)).result.current.preferences.selectedRightPanelId).toBeNull();
  });

  it('zooms from the default width when the saved record predates the scaleWidth field', () => {
    localStorage.setItem('video-editor:preferences:no-scale', JSON.stringify({ selectedRightPanelId: 'host:properties' }));
    const { result } = renderHook(() => useEditorPreferences('no-scale', 1280));
    expect(result.current.scaleWidth).toBe(defaultPreferences.scaleWidth);
    act(() => result.current.setScaleWidth((value) => value * 1.4));
    expect(result.current.scaleWidth).toBe(defaultPreferences.scaleWidth * 1.4);
  });

  it('fills a legacy record that lacks the panel field from the viewport default', () => {
    localStorage.setItem('video-editor:preferences:legacy-phone', JSON.stringify({ scaleWidth: 190 }));
    const { result } = renderHook(() => useEditorPreferences('legacy-phone', 420));
    expect(result.current.preferences.selectedRightPanelId).toBeNull();
    expect(result.current.preferences.scaleWidth).toBe(190);
  });

  it('defaults an absent transcript lane preference on, preserves explicit off and keeps it independent', () => {
    localStorage.setItem('video-editor:preferences:migration', JSON.stringify({ ...defaultPreferences, showTranscriptLane: undefined, showDataLanes: false, selectedRightPanelId: null, rightPanelTab: undefined }));
    const { result } = renderHook(() => useEditorPreferences('migration', 1280));
    expect(result.current.preferences.selectedRightPanelId).toBeNull();
    expect(result.current.preferences.showTranscriptLane).toBe(true);
    act(() => result.current.setShowTranscriptLane(false));
    expect(result.current.preferences.showDataLanes).toBe(false);
    expect(result.current.preferences.showTranscriptLane).toBe(false);
    act(() => result.current.setShowTranscriptLane(true));
    act(() => { result.current.setSelectedRightPanelId('astrid:transcript'); result.current.setRightPanelLayoutSlot('astrid:transcript', 'compact'); });
    act(() => result.current.setSelectedRightPanelId('host:properties'));
    act(() => result.current.setSelectedRightPanelId(null));
    expect(result.current.preferences.lastExtensionPanelId).toBe('astrid:transcript');
    expect(result.current.preferences.rightPanelTab).toBe('inspector');
    expect(result.current.preferences.rightPanelLayoutSlotsByPanelId['astrid:transcript']).toBe('compact');
    act(() => result.current.setShowTranscriptLane(false));
    expect(result.current.preferences.showDataLanes).toBe(false);
    expect(result.current.preferences.showTranscriptLane).toBe(false);
  });

  it('migrates legacy transcript visibility into per-kind visibility and supports new kinds', () => {
    localStorage.setItem('video-editor:preferences:per-kind', JSON.stringify({ ...defaultPreferences,
      showTranscriptLane: false, showDataLanes: true }));
    const { result } = renderHook(() => useEditorPreferences('per-kind', 1280));
    expect(result.current.preferences.showDataLanesByKind?.['astrid.transcript']).toBe(false);
    act(() => result.current.setDataKindLaneVisible('astrid.marker', false));
    expect(result.current.preferences.showDataLanesByKind?.['astrid.marker']).toBe(false);
    expect(result.current.preferences.showDataLanesByKind?.['astrid.transcript']).toBe(false);
  });

});
