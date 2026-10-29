import type { AssetRegistryEntry, TimelineClip, TrackDefinition } from '@/tools/video-editor/types/index.ts';

type MediaKind = 'image' | 'video' | 'audio';

const GENERATED_LABEL = /^(Image|Video|Audio) \d+$/;
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f-]{10,}$/i;
const NAME_KEYS = ['original_name', 'original_filename', 'originalFilename', 'filename', 'name', 'title', 'prompt'] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function normalizeName(value: unknown, key: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\\/g, '/').trim().replace(/[?#].*$/, '').replace(/\s+/g, ' ');
  if (!normalized) return undefined;
  const humanName = key === 'filename' || key === 'original_filename' || key === 'original_name'
    ? normalized.split('/').at(-1) ?? normalized
    : normalized;
  const filenameStem = humanName.replace(/\.[^.]+$/, '');
  if (UUID_LIKE.test(filenameStem) || GENERATED_LABEL.test(humanName)) return undefined;
  return key === 'prompt' && humanName.length > 80
    ? `${humanName.slice(0, 79).trimEnd()}…`
    : humanName;
}

function getRegistryName(entry: AssetRegistryEntry | undefined): string | undefined {
  if (!entry) return undefined;
  const metadata = record(entry.metadata);
  const values = [entry as Record<string, unknown>, metadata, record(metadata?.provenance)];
  for (const key of NAME_KEYS) {
    for (const value of values) {
      const name = normalizeName(value?.[key], key === 'originalFilename' ? 'original_filename' : key);
      if (name) return name;
    }
  }

  const file = normalizeName(entry.file, 'filename');
  // Registry file locators frequently contain opaque media IDs. Only use a
  // basename as a display name when it looks like an actual named file.
  return file && /\.[a-z0-9]{1,8}$/i.test(file) ? file : undefined;
}

function getMediaKind(
  clip: TimelineClip,
  entry: AssetRegistryEntry | undefined,
  trackKinds: ReadonlyMap<string, TrackDefinition['kind']>,
): MediaKind | undefined {
  if (!clip.asset) return undefined;
  const type = entry?.type?.toLowerCase() ?? '';
  const source = `${entry?.file ?? ''} ${entry?.url ?? ''}`.toLowerCase();
  if (type.startsWith('video') || /\.(mp4|mov|webm|m4v|mkv)\b/.test(source)) return 'video';
  if (type.startsWith('audio') || /\.(mp3|wav|aac|m4a|ogg|flac)\b/.test(source)) return 'audio';
  if (type.startsWith('image') || /\.(png|jpe?g|gif|webp|avif|bmp)\b/.test(source)) return 'image';
  if (trackKinds.get(clip.track) === 'audio' || clip.clipType === 'audio') return 'audio';
  if (clip.clipType === 'video') return 'video';
  if (
    (trackKinds.get(clip.track) === 'visual' || clip.clipType === 'hold' || clip.clipType === 'media')
    && (!clip.clipType || clip.clipType === 'hold' || clip.clipType === 'media')
  ) return 'image';
  return undefined;
}

/**
 * Resolves the user-facing labels shared by timeline clips and the Inspector.
 * Explicit clip names and media provenance win; unnamed clips get a stable
 * kind ordinal in timeline order.
 */
export function deriveTimelineClipDisplayNames(
  clips: readonly TimelineClip[],
  registry: Readonly<Record<string, AssetRegistryEntry>>,
  tracks: readonly TrackDefinition[],
): Map<string, string> {
  const trackKinds = new Map(tracks.map((track) => [track.id, track.kind] as const));
  const orderedClips = clips
    .map((clip, index) => ({ clip, index }))
    .sort((left, right) => left.clip.at - right.clip.at || left.index - right.index);
  const ordinals: Record<MediaKind, number> = { image: 0, video: 0, audio: 0 };
  const kindNames: Record<MediaKind, string> = { image: 'Image', video: 'Video', audio: 'Audio' };
  const labels = new Map<string, string>();

  for (const { clip } of orderedClips) {
    const entry = clip.asset ? registry[clip.asset] : undefined;
    const kind = getMediaKind(clip, entry, trackKinds);
    if (!kind) {
      if (clip.label?.trim() && !GENERATED_LABEL.test(clip.label.trim())) {
        labels.set(clip.id, clip.label.trim());
      }
      continue;
    }

    ordinals[kind] += 1;
    const explicitLabel = clip.label?.trim();
    const useExplicitLabel = Boolean(
      explicitLabel
      && !GENERATED_LABEL.test(explicitLabel)
      && explicitLabel !== clip.asset
      && explicitLabel !== clip.id
      && !UUID_LIKE.test(explicitLabel),
    );
    labels.set(
      clip.id,
      (useExplicitLabel ? explicitLabel : undefined)
        ?? getRegistryName(entry)
        ?? `${kindNames[kind]} ${ordinals[kind]}`,
    );
  }

  return labels;
}

/**
 * The names a set of clips shows, and the names they would show with no `label` at all. A `label` is explicit
 * (set by a user or agent) only when the derivation used it and it is not just the name the clip gets anyway;
 * anything else, such as a saved copy of the filename, is derived and must not be saved as a label.
 */
export function deriveClipNameBasis(
  clips: readonly TimelineClip[],
  registry: Readonly<Record<string, AssetRegistryEntry>>,
  tracks: readonly TrackDefinition[],
): { shown: Map<string, string>; natural: Map<string, string> } {
  return {
    shown: deriveTimelineClipDisplayNames(clips, registry, tracks),
    natural: deriveTimelineClipDisplayNames(clips.map(({ label: _label, ...clip }) => clip), registry, tracks),
  };
}

export function isExplicitClipLabel(
  label: string | undefined,
  clipId: string,
  basis: { shown: ReadonlyMap<string, string>; natural: ReadonlyMap<string, string> },
): boolean {
  const stored = label?.trim();
  return stored !== undefined && stored === basis.shown.get(clipId) && stored !== basis.natural.get(clipId);
}
