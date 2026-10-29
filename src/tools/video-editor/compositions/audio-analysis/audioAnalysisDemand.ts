import type { ResolvedTimelineClip } from '@/tools/video-editor/types/index.ts';

type AudioAnalysisEffectDescriptor = {
  id: string;
  kind: string;
  packId?: string;
  revision: string;
  schema?: object;
};

type AudioAnalysisDynamicEntry = {
  clipType: string;
  schemaJson?: object;
};

type AudioAnalysisExtensionRecord = {
  clipTypeId?: string;
  id?: string;
  schema?: readonly { type?: string }[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const declaresAudioBinding = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(declaresAudioBinding);
  if (!isRecord(value)) return false;
  if (value.type === 'audio-binding') return true;
  return Object.values(value).some(declaresAudioBinding);
};

const containsAudioBindingValue = (value: unknown, keyHint = ''): boolean => {
  if (Array.isArray(value)) return value.some((entry) => containsAudioBindingValue(entry, keyHint));
  if (!isRecord(value)) return false;
  const source = value.source;
  if (source === 'bass' || source === 'mid' || source === 'treble' || source === 'amplitude') return true;
  // Unknown source values under an audio/binding parameter can be produced by
  // dynamic expressions, so retain the provider when their meaning is opaque.
  if (Object.prototype.hasOwnProperty.call(value, 'source') && /audio|binding/i.test(keyHint)) return true;
  if (Object.keys(value).some((key) => /\$?(dynamic|expression|binding)/i.test(key))) return true;
  return Object.entries(value).some(([key, entry]) => containsAudioBindingValue(entry, key));
};

/**
 * Decide whether a resolved visual timeline may consume audio analysis.
 * Opaque dynamic effects are kept enabled because their runtime code cannot
 * be inspected safely here; ordinary clips and known non-audio schemas stay off.
 */
export function timelineNeedsAudioAnalysis(
  clips: readonly ResolvedTimelineClip[],
  descriptors: readonly AudioAnalysisEffectDescriptor[],
  dynamicEntries: readonly AudioAnalysisDynamicEntry[],
  extensionRecords: readonly AudioAnalysisExtensionRecord[],
): boolean {
  return clips.some((clip) => {
    if (clip.clipType === 'audio-reactive-colour') return true;
    if (containsAudioBindingValue(clip.params)) return true;

    const elementRef = clip.elementRef;
    if (elementRef?.kind === 'effect') {
      const descriptor = descriptors.find((candidate) => (
        candidate.id === elementRef.id
        && candidate.kind === elementRef.kind
        && candidate.packId === elementRef.packId
        && candidate.revision === elementRef.revision
      ));
      // A missing or schema-less admitted effect is opaque; favor correctness.
      if (!descriptor?.schema || declaresAudioBinding(descriptor.schema)) return true;
    } else if (elementRef && !descriptors.some((candidate) => (
      candidate.id === elementRef.id
      && candidate.kind === elementRef.kind
      && candidate.packId === elementRef.packId
      && candidate.revision === elementRef.revision
    ))) {
      return true;
    }

    const dynamicEntry = dynamicEntries.find((entry) => entry.clipType === clip.clipType);
    if (dynamicEntry && (!dynamicEntry.schemaJson || declaresAudioBinding(dynamicEntry.schemaJson))) return true;

    const extensionRecord = extensionRecords.find((record) => (
      record.clipTypeId === clip.clipType || record.id === clip.clipType
    ));
    if (extensionRecord) {
      if (!extensionRecord.schema || extensionRecord.schema.some((parameter) => parameter.type === 'audio-binding')) {
        return true;
      }
    }

    return false;
  });
}
