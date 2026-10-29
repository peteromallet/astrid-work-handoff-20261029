/**
 * Segment Prompt Metadata
 *
 * Reads pair prompts from shotGenerations metadata.
 */

import type { ShotGeneration } from '@/shared/hooks/timeline/useTimelineCore.types';
import { readSegmentOverrides } from '@/shared/lib/settingsMigration';

// ============================================================================
// Pure function: extract pair prompts
// ============================================================================

/**
 * Extract pair prompts from sorted positioned generations.
 * Each pair is represented by its first item (index in the sorted array).
 */
export function extractPairPrompts(
  shotGenerations: ShotGeneration[]
): Record<number, { prompt: string; negativePrompt: string }> {
  const pairPrompts: Record<number, { prompt: string; negativePrompt: string }> = {};
  const sortedPositionedGenerations = shotGenerations
    .filter(sg => sg.timeline_frame >= 0)
    .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

  for (let i = 0; i < sortedPositionedGenerations.length - 1; i++) {
    const firstItem = sortedPositionedGenerations[i];
    const overrides = readSegmentOverrides(firstItem.metadata as Record<string, unknown> | null);
    const prompt = overrides.prompt || "";
    const negativePrompt = overrides.negativePrompt || "";
    if (prompt || negativePrompt) {
      pairPrompts[i] = { prompt, negativePrompt };
    }
  }

  return pairPrompts;
}
