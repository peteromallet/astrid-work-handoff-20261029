type GenerationModeRaw = 'batch' | 'timeline' | 'by-pair' | undefined;
export type GenerationModeNormalized = 'batch' | 'timeline' | 'by-pair';

function normalizeGenerationMode(mode: GenerationModeRaw): GenerationModeNormalized {
  if (mode === 'batch' || mode === 'by-pair' || mode === 'timeline') return mode;
  return 'timeline';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

interface SettingsSources {
  defaults?: Record<string, unknown>;
  user?: Record<string, unknown>;
  project?: Record<string, unknown>;
  shot?: Record<string, unknown>;
}

function resolveSettingField<T>(
  field: string,
  sources: SettingsSources
): T | undefined {
  if (sources.shot?.[field] !== undefined) return sources.shot[field] as T;
  if (sources.project?.[field] !== undefined) return sources.project[field] as T;
  if (sources.user?.[field] !== undefined) return sources.user[field] as T;
  if (sources.defaults?.[field] !== undefined) return sources.defaults[field] as T;
  return undefined;
}

export function resolveGenerationMode(sources: SettingsSources): GenerationModeNormalized {
  const raw = resolveSettingField<GenerationModeRaw>('generationMode', sources);
  return normalizeGenerationMode(raw);
}

export function extractToolSettings(
  settings: Record<string, unknown> | null | undefined,
  toolId: string
): Record<string, unknown> {
  const root = asRecord(settings);
  if (!root) {
    return {};
  }

  return asRecord(root[toolId]) ?? {};
}
