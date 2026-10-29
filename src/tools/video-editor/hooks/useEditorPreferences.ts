import { useCallback, useRef } from 'react';
import { useEditorSettings } from '@/tools/video-editor/settings/useEditorSettings.ts';

export type ClipTab = 'effects' | 'timing' | 'position' | 'audio' | 'text';
export type RightPanelLayoutSlot = 'compact' | 'dock';

export interface EditorPreferences {
  scaleWidth: number;
  activeClipTab: ClipTab;
  /** The selected host panel; null closes its surface without discarding its state. */
  selectedRightPanelId: string | null;
  /** Remember the selected extension independently of Inspector and Closed. */
  lastExtensionPanelId?: string | null;
  rightPanelTab?: 'inspector' | 'extensions';
  /** Legacy per-panel placement values; host:properties is the shared mode. */
  rightPanelLayoutSlotsByPanelId: Record<string, RightPanelLayoutSlot>;
  /** Data-kind lanes are optional and start hidden. */
  showDataLanes: boolean;
  /** Per-kind overrides; missing kinds follow the shared data-lane default. */
  showDataLanesByKind?: Record<string, boolean>;
  /** Read only when migrating older saved preferences. */
  showTranscriptLane?: boolean;
  assetPanel: {
    showAll: boolean;
    showHidden: boolean;
    hidden: string[];
  };
}

export const defaultPreferences: EditorPreferences = {
  scaleWidth: 160,
  activeClipTab: 'effects',
  selectedRightPanelId: 'host:properties',
  rightPanelLayoutSlotsByPanelId: {},
  showDataLanes: false,
  showDataLanesByKind: {},
  showTranscriptLane: true,
  lastExtensionPanelId: null,
  rightPanelTab: 'inspector',
  assetPanel: {
    showAll: false,
    showHidden: false,
    hidden: [],
  },
};

/**
 * Narrowest viewport (CSS px) where the Inspector dock starts open. Below it the dock either floats
 * over the preview and timeline (phone) or takes a third of a portrait tablet's width from a
 * timeline that has little to spare, so it starts closed there and the user opens it from the
 * panel-display control. Only the default: a saved selection, including closed, always wins.
 */
export const INSPECTOR_DEFAULT_OPEN_MIN_VIEWPORT_PX = 1024;

export function defaultPreferencesForViewport(viewportWidth: number): EditorPreferences {
  return viewportWidth >= INSPECTOR_DEFAULT_OPEN_MIN_VIEWPORT_PX
    ? defaultPreferences
    : { ...defaultPreferences, selectedRightPanelId: null };
}

/**
 * What is saved. The panel selection is absent until the user picks one, so a record written by an
 * unrelated change (zoom, a lane toggle) still takes the viewport default on the next load instead of
 * freezing whichever default was sampled on the first one.
 */
type StoredPreferences = Omit<EditorPreferences, 'selectedRightPanelId'> & { selectedRightPanelId?: string | null };

const { selectedRightPanelId: _defaultPanel, ...storedDefaults } = defaultPreferences;
const STORED_DEFAULTS: StoredPreferences = storedDefaults;

function normalizePreferences(value: StoredPreferences, defaults: EditorPreferences = defaultPreferences): EditorPreferences {
  // Older per-timeline records predate the panel fields. Fill only missing
  // fields so a saved user selection (including null/closed) survives reload.
  return {
    ...defaults,
    ...value,
    selectedRightPanelId: value.selectedRightPanelId === undefined
      ? defaults.selectedRightPanelId
      : value.selectedRightPanelId,
    rightPanelLayoutSlotsByPanelId: {
      ...defaultPreferences.rightPanelLayoutSlotsByPanelId,
      ...(value.rightPanelLayoutSlotsByPanelId ?? {}),
    },
    lastExtensionPanelId: value.lastExtensionPanelId ?? (value.selectedRightPanelId && value.selectedRightPanelId !== 'host:properties' ? value.selectedRightPanelId : null),
    rightPanelTab: value.rightPanelTab ?? (value.selectedRightPanelId && value.selectedRightPanelId !== 'host:properties' ? 'extensions' : 'inspector'),
    showDataLanes: value.showDataLanes ?? defaultPreferences.showDataLanes,
    showDataLanesByKind: {
      ...(value.showTranscriptLane !== undefined ? { 'astrid.transcript': value.showTranscriptLane } : {}),
      ...(value.showDataLanesByKind ?? {}),
    },
    // Retained as a read compatibility field for older consumers during migration.
    showTranscriptLane: value.showTranscriptLane ?? true,
    assetPanel: {
      ...defaultPreferences.assetPanel,
      ...value.assetPanel,
      hidden: [...(value.assetPanel?.hidden ?? defaultPreferences.assetPanel.hidden)],
    },
  };
}

export function useEditorPreferences(timelineId: string, viewportWidth: number, { persist = true }: { persist?: boolean } = {}) {
  // Sampled when this timeline's preferences are first read: later resizes never reopen or close a panel.
  const sampled = useRef<{ timelineId: string; defaults: EditorPreferences } | null>(null);
  if (sampled.current?.timelineId !== timelineId) {
    sampled.current = { timelineId, defaults: defaultPreferencesForViewport(viewportWidth) };
  }
  const initialDefaults = sampled.current.defaults;
  const [preferences, setPreferences] = useEditorSettings<StoredPreferences>(
    `video-editor:preferences:${timelineId}`,
    STORED_DEFAULTS,
    { persist },
  );
  /** The next record to save: every field filled in except the panel selection, which stays as stored. */
  const nextRecord = useCallback((current: StoredPreferences, patch: Partial<StoredPreferences> = {}): StoredPreferences => ({
    ...normalizePreferences(current, initialDefaults),
    selectedRightPanelId: current.selectedRightPanelId,
    ...patch,
  }), [initialDefaults]);

  const normalizedPreferences = normalizePreferences(preferences, initialDefaults);

  const scale = 5;
  const scaleWidth = normalizedPreferences.scaleWidth;

  const setScaleWidth = useCallback((updater: number | ((value: number) => number)) => {
    setPreferences((current) => {
      // Read the width from the normalized record: an older saved record may not carry the field at all.
      const width = normalizePreferences(current, initialDefaults).scaleWidth;
      return nextRecord(current, { scaleWidth: typeof updater === 'function' ? updater(width) : updater });
    });
  }, [initialDefaults, nextRecord, setPreferences]);

  const setActiveClipTab = useCallback((tab: ClipTab) => {
    setPreferences((current) => nextRecord(current, { activeClipTab: tab }));
  }, [nextRecord, setPreferences]);

  const setAssetPanelState = useCallback((patch: Partial<EditorPreferences['assetPanel']>) => {
    setPreferences((current) => nextRecord(current, {
      assetPanel: { ...normalizePreferences(current, initialDefaults).assetPanel, ...patch },
    }));
  }, [initialDefaults, nextRecord, setPreferences]);

  // The only writer of the panel selection: an explicit choice, including closed, is saved from here on.
  const setSelectedRightPanelId = useCallback((selectedRightPanelId: string | null) => {
    setPreferences((current) => nextRecord(current, {
      selectedRightPanelId,
      ...(selectedRightPanelId ? { rightPanelTab: selectedRightPanelId === 'host:properties' ? 'inspector' as const : 'extensions' as const } : {}),
      ...(selectedRightPanelId && selectedRightPanelId !== 'host:properties' ? { lastExtensionPanelId: selectedRightPanelId } : {}),
    }));
  }, [nextRecord, setPreferences]);

  const setRightPanelLayoutSlot = useCallback((panelId: string, slot: RightPanelLayoutSlot) => {
    setPreferences((current) => nextRecord(current, {
      rightPanelLayoutSlotsByPanelId: {
        ...normalizePreferences(current, initialDefaults).rightPanelLayoutSlotsByPanelId,
        [panelId]: slot,
      },
    }));
  }, [initialDefaults, nextRecord, setPreferences]);

  const setShowDataLanes = useCallback((showDataLanes: boolean) => {
    setPreferences((current) => nextRecord(current, { showDataLanes }));
  }, [nextRecord, setPreferences]);

  const setShowTranscriptLane = useCallback((showTranscriptLane: boolean) => {
    setPreferences((current) => nextRecord(current, {
      showTranscriptLane,
      showDataLanesByKind: {
        ...normalizePreferences(current, initialDefaults).showDataLanesByKind,
        'astrid.transcript': showTranscriptLane,
      },
    }));
  }, [initialDefaults, nextRecord, setPreferences]);

  const setDataKindLaneVisible = useCallback((kindId: string, visible: boolean) => {
    setPreferences((current) => nextRecord(current, {
      showDataLanesByKind: {
        ...normalizePreferences(current, initialDefaults).showDataLanesByKind,
        [kindId]: visible,
      },
    }));
  }, [initialDefaults, nextRecord, setPreferences]);

  return {
    setShowTranscriptLane,
    preferences: normalizedPreferences,
    scaleWidth,
    scale,
    setScaleWidth,
    setActiveClipTab,
    setAssetPanelState,
    setSelectedRightPanelId,
    setRightPanelLayoutSlot,
    setShowDataLanes,
    setDataKindLaneVisible,
  };
}
