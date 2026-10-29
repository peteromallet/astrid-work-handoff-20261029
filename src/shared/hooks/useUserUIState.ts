import { useCallback, useMemo, useRef, useState } from 'react';

interface UISettings {
  defaultTool: {
    toolId: string;
  };
  paneLocks: {
    shots: boolean;
    tasks: boolean;
    gens: boolean;
    editor: boolean;
  };
  settingsModal: {
    activeTab: string;
  };
  videoTravelWidescreen: {
    enabled: boolean;
  };
  imageDeletion?: {
    skipConfirmation: boolean;
  };
  privacyDefaults: {
    resourcesPublic: boolean;
    generationsPublic: boolean;
  };
  theme: {
    darkMode: boolean; // Defaults to true (dark mode) for new users
  };
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function decodePaneLocks(
  value: unknown,
  fallback: UISettings['paneLocks'],
): UISettings['paneLocks'] {
  const record = toRecord(value);
  return {
    shots: readBoolean(record?.shots, fallback.shots),
    tasks: readBoolean(record?.tasks, fallback.tasks),
    gens: readBoolean(record?.gens, fallback.gens),
    editor: readBoolean(record?.editor, fallback.editor),
  };
}

function decodeDefaultTool(
  value: unknown,
  fallback: UISettings['defaultTool'],
): UISettings['defaultTool'] {
  const record = toRecord(value);
  return {
    toolId: readString(record?.toolId, fallback.toolId),
  };
}

function decodeSettingsModal(
  value: unknown,
  fallback: UISettings['settingsModal'],
): UISettings['settingsModal'] {
  const record = toRecord(value);
  return {
    activeTab: readString(record?.activeTab, fallback.activeTab),
  };
}

function decodeVideoTravelWidescreen(
  value: unknown,
  fallback: UISettings['videoTravelWidescreen'],
): UISettings['videoTravelWidescreen'] {
  const record = toRecord(value);
  return {
    enabled: readBoolean(record?.enabled, fallback.enabled),
  };
}

function decodeImageDeletion(
  value: unknown,
  fallback: NonNullable<UISettings['imageDeletion']>,
): NonNullable<UISettings['imageDeletion']> {
  const record = toRecord(value);
  return {
    skipConfirmation: readBoolean(record?.skipConfirmation, fallback.skipConfirmation),
  };
}

function decodePrivacyDefaults(
  value: unknown,
  fallback: UISettings['privacyDefaults'],
): UISettings['privacyDefaults'] {
  const record = toRecord(value);
  return {
    resourcesPublic: readBoolean(record?.resourcesPublic, fallback.resourcesPublic),
    generationsPublic: readBoolean(record?.generationsPublic, fallback.generationsPublic),
  };
}

function decodeTheme(
  value: unknown,
  fallback: UISettings['theme'],
): UISettings['theme'] {
  const record = toRecord(value);
  return {
    darkMode: readBoolean(record?.darkMode, fallback.darkMode),
  };
}

function normalizeUserUISetting<K extends keyof UISettings>(
  key: K,
  value: unknown,
  fallback: UISettings[K],
): UISettings[K] {
  switch (key) {
    case 'defaultTool':
      return decodeDefaultTool(value, fallback as UISettings['defaultTool']) as UISettings[K];
    case 'paneLocks':
      return decodePaneLocks(value, fallback as UISettings['paneLocks']) as UISettings[K];
    case 'settingsModal':
      return decodeSettingsModal(value, fallback as UISettings['settingsModal']) as UISettings[K];
    case 'videoTravelWidescreen':
      return decodeVideoTravelWidescreen(
        value,
        fallback as UISettings['videoTravelWidescreen'],
      ) as UISettings[K];
    case 'imageDeletion':
      return decodeImageDeletion(
        value,
        fallback as NonNullable<UISettings['imageDeletion']>,
      ) as UISettings[K];
    case 'privacyDefaults':
      return decodePrivacyDefaults(
        value,
        fallback as UISettings['privacyDefaults'],
      ) as UISettings[K];
    case 'theme':
      return decodeTheme(value, fallback as UISettings['theme']) as UISettings[K];
    default:
      return fallback;
  }
}

function mergeSettingRecords(currentValue: unknown, patch: unknown): Record<string, unknown> {
  return {
    ...(toRecord(currentValue) ?? {}),
    ...(toRecord(patch) ?? {}),
  };
}


/** UI preferences stay in this mounted Astrid session. */
export function useUserUIState<K extends keyof UISettings>(
  key: K,
  fallback: UISettings[K],
) {
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const [value, setValue] = useState(fallback);
  const update = useCallback((patch: Partial<UISettings[K]>) => {
    setValue((current) => normalizeUserUISetting(
      key,
      mergeSettingRecords(current, patch),
      fallbackRef.current,
    ));
  }, [key]);

  return useMemo(() => ({ value, update, isLoading: false }), [value, update]);
}
