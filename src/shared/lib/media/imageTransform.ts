export interface ImageTransform {
  translateX: number;
  translateY: number;
  scale: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

export const DEFAULT_IMAGE_TRANSFORM: ImageTransform = {
  translateX: 0,
  translateY: 0,
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
};

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function decodeImageTransform(payload: unknown): ImageTransform | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  return {
    translateX: toFiniteNumber(record.translateX, DEFAULT_IMAGE_TRANSFORM.translateX),
    translateY: toFiniteNumber(record.translateY, DEFAULT_IMAGE_TRANSFORM.translateY),
    scale: toFiniteNumber(record.scale, DEFAULT_IMAGE_TRANSFORM.scale),
    rotation: toFiniteNumber(record.rotation, DEFAULT_IMAGE_TRANSFORM.rotation),
    flipH: toBoolean(record.flipH, DEFAULT_IMAGE_TRANSFORM.flipH),
    flipV: toBoolean(record.flipV, DEFAULT_IMAGE_TRANSFORM.flipV),
  };
}

export function hasImageTransformChanges(transform: ImageTransform): boolean {
  return transform.translateX !== DEFAULT_IMAGE_TRANSFORM.translateX
    || transform.translateY !== DEFAULT_IMAGE_TRANSFORM.translateY
    || transform.scale !== DEFAULT_IMAGE_TRANSFORM.scale
    || transform.rotation !== DEFAULT_IMAGE_TRANSFORM.rotation
    || transform.flipH !== DEFAULT_IMAGE_TRANSFORM.flipH
    || transform.flipV !== DEFAULT_IMAGE_TRANSFORM.flipV;
}

export function describeImageTransform(transform: ImageTransform): string {
  const parts: string[] = [];

  if (transform.flipH) parts.push('Flipped Horizontal');
  if (transform.flipV) parts.push('Flipped Vertical');
  if (transform.rotation !== 0) parts.push(`Rotated ${transform.rotation}\u00B0`);
  if (transform.scale !== 1) parts.push(`Zoom ${Math.round(transform.scale * 100)}%`);
  if (transform.translateX !== 0 || transform.translateY !== 0) {
    parts.push('Repositioned');
  }

  return parts.length > 0 ? parts.join(' + ') : 'Transformed';
}
