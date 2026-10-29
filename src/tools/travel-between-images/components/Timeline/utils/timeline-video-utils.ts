/**
 * Extract pair_shot_generation_id from a generation row.
 * Checks the FK column first, then falls back to params for legacy data.
 */
const getPairShotGenerationId = (
  generation: {
    pair_shot_generation_id?: string | null;
    params?: Record<string, unknown> | null;
  }
): string | null => {
  // Check FK column first (new format)
  if (generation.pair_shot_generation_id) {
    return generation.pair_shot_generation_id;
  }

  // Fallback to params (legacy format)
  const params = generation.params;
  if (!params) return null;

  const individualParams = params.individual_segment_params as Record<string, unknown> | undefined;
  return (
    (individualParams?.pair_shot_generation_id as string) ||
    (params.pair_shot_generation_id as string) ||
    null
  );
};

/**
 * Find trailing video info from a list of video outputs.
 * A trailing video is one where pair_shot_generation_id matches the last image's shot_generation_id.
 *
 * @param videoOutputs - Array of generation rows (video outputs)
 * @param lastImageShotGenId - The shot_generation_id of the last image on the timeline
 * @returns Object with hasTrailing boolean and optional videoUrl
 */
export const findTrailingVideoInfo = (
  videoOutputs: Array<{
    type?: string | null;
    location?: string | null;
    pair_shot_generation_id?: string | null;
    params?: Record<string, unknown> | null;
  }>,
  lastImageShotGenId: string | null
): { hasTrailing: boolean; videoUrl: string | null } => {
  if (!videoOutputs || videoOutputs.length === 0 || !lastImageShotGenId) {
    return { hasTrailing: false, videoUrl: null };
  }

  const trailingVideo = videoOutputs.find(gen => {
    // Must be a video with a location (completed)
    if (!gen.type?.includes('video') || !gen.location) return false;
    // Check if pair_shot_generation_id matches the last image
    const pairId = getPairShotGenerationId(gen);
    return pairId === lastImageShotGenId;
  });

  return {
    hasTrailing: !!trailingVideo,
    videoUrl: trailingVideo?.location || null,
  };
};
