/**
 * `?sky=preview` shows a time-of-day control on the public homepage; `?sky=17:45` also starts pinned at that
 * time. Anything else leaves the page exactly as it is. The control drives the sky session's existing manual
 * hour (`setManualHours` / `setNow`), so the preview runs through the real sky pipeline.
 */
export const PUBLIC_ASTRID_SKY_PREVIEW_PARAM = 'sky';
export const SKY_PREVIEW_STEP_MINUTES = 5;

export interface PublicAstridSkyPreviewRequest {
  /** Hour of day (0 to under 24) to start pinned at, or null to start live. */
  hours: number | null;
}

export function parsePublicAstridSkyPreview(search: string): PublicAstridSkyPreviewRequest | null {
  const value = new URLSearchParams(search).get(PUBLIC_ASTRID_SKY_PREVIEW_PARAM)?.trim();
  if (!value) return null;
  if (value.toLowerCase() === 'preview') return { hours: null };
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours: hours + minutes / 60 };
}

export function formatSkyPreviewHours(hours: number): string {
  const total = Math.floor((((hours % 24) + 24) % 24) * 60 + 1e-6);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
