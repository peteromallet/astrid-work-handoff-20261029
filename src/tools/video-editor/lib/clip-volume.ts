import { ASTRID_EFFECT_CATALOG } from '@/tools/video-editor/runtime/astrid-element-catalog.ts';
import { getAdmittedElementSelection } from '@/tools/video-editor/runtime/admitted-elements.ts';
import type { ParameterSchema, ResolvedTimelineClip } from '@/tools/video-editor/types/index.ts';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

type VolumeSpec = { default?: number; max?: number };

const specOf = (defaults: Record<string, unknown> | undefined, parameters: ParameterSchema | undefined): VolumeSpec => {
  const max = parameters?.find((parameter) => parameter.name === 'volume')?.max;
  return {
    ...(finite(defaults?.volume) ? { default: defaults.volume } : {}),
    ...(finite(max) ? { max } : {}),
  };
};

const CATALOG_SPECS = new Map<string, VolumeSpec>(
  ASTRID_EFFECT_CATALOG.map((element) => [element.id, specOf(element.defaults, element.parameterSchema)]),
);

/** The element's declared volume default and max: runtime-admitted manifests first, then the built-in catalog. */
const elementVolumeSpec = (clip: Pick<ResolvedTimelineClip, 'elementRef' | 'clipType'>): VolumeSpec => {
  const id = clip.elementRef?.id ?? clip.clipType;
  if (id === undefined) return {};
  const packId = clip.elementRef?.packId;
  const admitted = getAdmittedElementSelection().elements.find(({ descriptor }) => (
    descriptor.id === id && (packId === undefined || descriptor.packId === packId)
  ));
  return admitted
    ? specOf(admitted.descriptor.defaults, admitted.descriptor.parameters)
    : CATALOG_SPECS.get(id) ?? {};
};

/**
 * The one definition of a clip's sound level, shared by everything in the
 * editor that plays, draws, analyses or displays it (and mirrored by the
 * render, e.g. Astrid's am-footage `footageVolume`):
 *   1. the explicit `clip.volume` (finite, >= 0);
 *   2. else the element's declared default (its manifest `defaults.volume`,
 *      or the legacy `volume` param that carries it);
 *   3. else 1, a plain media clip at full level;
 * capped at the `max` the element's `volume` parameter declares.
 *
 * This is a read-time rule. Writers must leave an unset `clip.volume` unset;
 * only an explicit user change writes one.
 */
export const getEffectiveClipVolume = (
  clip: Pick<ResolvedTimelineClip, 'volume' | 'elementRef' | 'clipType' | 'params'>,
): number => {
  const spec = elementVolumeSpec(clip);
  const paramVolume = clip.params?.volume;
  const value = finite(clip.volume) && clip.volume >= 0
    ? clip.volume
    : finite(paramVolume) ? paramVolume : spec.default ?? 1;
  return spec.max === undefined ? value : Math.min(value, spec.max);
};
