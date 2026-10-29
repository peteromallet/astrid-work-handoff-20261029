/**
 * submitSegmentTask - Shared segment task submission logic
 *
 * Provides shared submission logic for segment slot generation.
 *
 * Both callers follow the same pattern:
 *   1. Validate inputs
 *   2. Add incoming task placeholder (for optimistic UI)
 *   3. Optionally enhance prompt via edge function
 *   4. Build task params
 *   5. Create the task
 *   6. Cleanup (refetch, remove placeholder)
 */

import { QueryClient } from '@tanstack/react-query';
import type { SegmentSettings } from '@/shared/components/SegmentSettingsForm/segmentSettingsUtils';
import {
  buildTravelGuidanceFromControls,
  type TravelGuidanceMode,
} from '@/shared/lib/tasks/travelGuidance';
import type {
  StructureVideoConfig,
  TravelGuidance,
} from '@/shared/lib/tasks/travelBetweenImages';
import type { RunTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';
import { travelGenerationUnsupportedError } from '@/shared/lib/taskCreation/travelGeneration';

// ============================================================================
// Structure Video Config Builder for segment slot generation.
// ============================================================================

interface StructureVideoInputs {
  structureVideoUrl?: string;
  structureVideoType?: TravelGuidanceMode | null;
  modelName?: string;
  structureVideoFrameRange?: {
    segmentStart: number;
    segmentEnd: number;
    videoTotalFrames: number;
    videoFps: number;
  };
  structureVideoDefaults?: {
    motionStrength: number;
    treatment: 'adjust' | 'clip';
    uni3cEndPercent: number;
    cannyIntensity?: number;
    depthContrast?: number;
  } | null;
}

/**
 * Build a StructureVideoConfig from structure video props + effective settings.
 * Returns null when required fields are missing.
 */
export function buildStructureVideoForTask(
  inputs: StructureVideoInputs,
  getSettingsForTaskCreation: () => Pick<
    SegmentSettings,
    | 'guidanceTreatment'
    | 'guidanceMode'
    | 'guidanceStrength'
    | 'guidanceUni3cEndPercent'
    | 'guidanceCannyIntensity'
    | 'guidanceDepthContrast'
  >,
): { travelGuidance: TravelGuidance; structureVideos: StructureVideoConfig[] } | null {
  const { structureVideoUrl, structureVideoType, structureVideoFrameRange, structureVideoDefaults, modelName } = inputs;
  if (!structureVideoUrl || !structureVideoType || !structureVideoFrameRange) {
    return null;
  }

  const effectiveSettings = getSettingsForTaskCreation();
  const structureVideo: StructureVideoConfig = {
    path: structureVideoUrl,
    start_frame: structureVideoFrameRange.segmentStart,
    end_frame: structureVideoFrameRange.segmentEnd,
    treatment: effectiveSettings.guidanceTreatment ?? structureVideoDefaults?.treatment ?? 'adjust',
  };
  const travelGuidance = buildTravelGuidanceFromControls({
    modelName,
    structureVideos: [structureVideo],
    controls: {
      mode: effectiveSettings.guidanceMode ?? structureVideoType,
      strength: effectiveSettings.guidanceStrength ?? structureVideoDefaults?.motionStrength ?? 1.2,
      uni3cEndPercent: effectiveSettings.guidanceUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1,
      cannyIntensity: effectiveSettings.guidanceCannyIntensity ?? structureVideoDefaults?.cannyIntensity,
      depthContrast: effectiveSettings.guidanceDepthContrast ?? structureVideoDefaults?.depthContrast,
    },
    defaultVideoTreatment: structureVideo.treatment,
  });
  if (!travelGuidance) {
    return null;
  }
  return {
    travelGuidance,
    structureVideos: [structureVideo],
  };
}

// ============================================================================
// Segment Task Submission
// ============================================================================

/** Image context for the segment task */
interface SegmentTaskImageContext {
  startImageUrl?: string;
  endImageUrl?: string;
  startImageGenerationId?: string;
  endImageGenerationId?: string;
  startImageVariantId?: string;
  endImageVariantId?: string;
}

/** Task creation context */
interface SegmentTaskContext {
  projectId: string;
  shotId?: string;
  segmentIndex: number;
  pairShotGenerationId?: string;
  projectResolution?: string;
  modelName?: string;
  generationTypeMode?: 'i2v' | 'vace';
  structureInput: { travelGuidance: TravelGuidance; structureVideos: StructureVideoConfig[] } | null;
}

/** Submission configuration */
interface SubmitSegmentTaskInput {
  /** Label for the incoming task placeholder (e.g. "Segment 3") */
  taskLabel: string;
  /** Component name used in error context. */
  errorContext: string;
  /** Get effective settings from the form hook */
  getSettings: () => SegmentSettings;
  /** Current enhance prompt ref value */
  shouldEnhance: boolean;
  /** Default num frames for enhancement */
  defaultNumFrames: number;
  /** Image context */
  images: SegmentTaskImageContext;
  /** Task context */
  task: SegmentTaskContext;
  /** Task placeholder runner (from useTaskPlaceholder) */
  run: RunTaskPlaceholder;
  /** React Query client for invalidation (for metadata save) */
  queryClient: QueryClient;
  /** Optional callback when generation starts (for optimistic UI) */
  onGenerateStarted?: () => void;
  /** Optional reporting hook for non-fatal side-effect failures. */
  onNonFatalError?: (step: SegmentSubmissionNonFatalStep, error: unknown) => void;
}

type SegmentSubmissionNonFatalStep =
  | 'enhance_prompt'
  | 'metadata_fetch'
  | 'metadata_update'
  | 'unsupported_capability';

/**
 * Submit a segment task, handling both enhanced and standard prompt paths.
 * Uses the task placeholder runner for lifecycle management.
 * Returns immediately — task creation runs in the background (fire-and-forget).
 */
export function submitSegmentTask(input: SubmitSegmentTaskInput): void {
  const unsupported = travelGenerationUnsupportedError();
  input.onNonFatalError?.('unsupported_capability', unsupported);
  // The caller's form treats a resolved onSubmit as success. Propagate the
  // unsupported result after reporting it so no false "Task Created" state is
  // shown when no task was admitted.
  throw unsupported;
}
