/**
 * useShotSettingsValue - Builds the ShotSettingsContext value
 *
 * Extracts context value building from ShotEditor to reduce component size.
 * Takes the various domain values and returns the assembled context value.
 *
 */

import { useMemo } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { Shot, GenerationRow } from '@/domains/generation/types';
import type { Project } from '@/types/project';
import {
  ShotSettingsContextValue,
  GenerationModeState,
  GenerationHandlers,
  StructureVideoHandlers,
  JoinState,
  DimensionState,
} from '../../ShotSettingsContext';
import { ShotEditorState } from '../../state/types';
import { ShotEditorActions } from '../../state/useShotEditorState';
import { LoraManagerReturn } from './useLoraSync';
import type { UseStructureVideoReturn } from '../video/useStructureVideo';
import type { UseAudioReturn } from '../video/useAudio';

// Type for generation actions from useGenerationActions
// All drop handlers use the unified targetFrame parameter
interface GenerationActionsReturn {
  handleTimelineGenerationDrop: (
    generationId: string,
    imageUrl: string,
    thumbUrl: string | undefined,
    targetFrame?: number
  ) => Promise<void>;
  handleBatchGenerationDrop: (
    generationId: string,
    imageUrl: string,
    thumbUrl: string | undefined,
    targetFrame?: number
  ) => Promise<void>;
  handleDeleteImageFromShot: (generationId: string) => Promise<void>;
  handleBatchDeleteImages: (generationIds: string[]) => Promise<void>;
}

// Type for shot actions from useShotActions
interface ShotActionsReturn {
  handleShotChange: (shotId: string) => void;
  handleAddToShot: (shotId: string, generationId: string, position?: number) => Promise<void>;
  handleAddToShotWithoutPosition: (shotId: string, generationId: string) => Promise<boolean>;
  openUnpositionedGenerationsPane: () => void;
}

export interface UseShotSettingsValueProps {
  // Core identifiers
  selectedShot: Shot;
  selectedShotId: string;
  projectId: string;
  selectedProjectId: string;
  effectiveAspectRatio: string | undefined;
  projects: Project[];

  // UI state
  state: ShotEditorState;
  actions: ShotEditorActions;

  // LoRA
  loraManager: LoraManagerReturn;

  // Images
  allShotImages: GenerationRow[];
  timelineImages: GenerationRow[];
  unpositionedImages: GenerationRow[];
  contextImages: GenerationRow[];
  videoOutputs: GenerationRow[];
  simpleFilteredImages: GenerationRow[];

  // Structure video hook return
  structureVideo: UseStructureVideoReturn;

  // Structure video compound handlers
  structureVideoHandlers: StructureVideoHandlers;

  // Audio hook return
  audio: UseAudioReturn;

  // Generation actions
  generationActions: GenerationActionsReturn;
  handleImageReorder: (orderedShotGenerationIds: string[], draggedItemId?: string) => void;

  // Shot management
  shots: Shot[] | undefined;
  shotActions: ShotActionsReturn;

  // Generation mode state
  generationMode: GenerationModeState;

  // Generation handlers
  generationHandlers: GenerationHandlers;

  // Join state
  joinState: JoinState;

  // Dimension settings
  dimensions: DimensionState;

  // Query client
  queryClient: QueryClient;
}

/**
 * Hook that builds the ShotSettingsContext value from various domain inputs.
 * Memoizes the result to prevent unnecessary re-renders.
 */
export function useShotSettingsValue({
  // Core
  selectedShot,
  selectedShotId,
  projectId,
  selectedProjectId,
  effectiveAspectRatio,
  projects,
  // UI state
  state,
  actions,
  // LoRA
  loraManager,
  // Images
  allShotImages,
  timelineImages,
  unpositionedImages,
  contextImages,
  videoOutputs,
  simpleFilteredImages,
  // Structure video
  structureVideo,
  structureVideoHandlers,
  // Audio
  audio,
  // Generation actions
  generationActions,
  handleImageReorder,
  // Shot management
  shots,
  shotActions,
  // Generation mode
  generationMode,
  // Generation handlers
  generationHandlers,
  // Join state
  joinState,
  // Dimension settings
  dimensions,
  // Query client
  queryClient,
}: UseShotSettingsValueProps): ShotSettingsContextValue {
  // Build structure video domain for context
  const structureVideoForContext = useMemo(
    (): ShotSettingsContextValue['structureVideo'] => ({
      travelGuidance: structureVideo.travelGuidance,
      travelGuidanceByModel: structureVideo.travelGuidanceByModel,
      structureGuidance: structureVideo.structureGuidance,
      structureVideos: structureVideo.structureVideos,
      addStructureVideo: structureVideo.addStructureVideo,
      updateStructureVideo: structureVideo.updateStructureVideo,
      removeStructureVideo: structureVideo.removeStructureVideo,
      clearAllStructureVideos: structureVideo.clearAllStructureVideos,
      setStructureVideos: structureVideo.setStructureVideos,
      isLoading: structureVideo.isLoading,
      structureVideoPath: structureVideo.structureVideoPath,
      structureVideoMetadata: structureVideo.structureVideoMetadata,
      structureVideoTreatment: structureVideo.structureVideoTreatment,
      structureVideoMotionStrength: structureVideo.structureVideoMotionStrength,
      structureVideoType: structureVideo.structureVideoType,
      structureVideoResourceId: structureVideo.structureVideoResourceId,
      structureVideoUni3cEndPercent: structureVideo.structureVideoUni3cEndPercent,
      structureVideoDefaultsByModel: structureVideo.structureVideoDefaultsByModel,
      updateStructureGuidanceControls: structureVideo.updateStructureGuidanceControls,
    }),
    [structureVideo]
  );

  // Build audio domain for context
  const audioForContext = useMemo(
    (): ShotSettingsContextValue['audio'] => ({
      audioUrl: audio.audioUrl,
      audioMetadata: audio.audioMetadata,
      handleAudioChange: audio.handleAudioChange,
      isLoading: audio.isLoading,
    }),
    [audio]
  );

  // Build image handlers domain for context
  const imageHandlersForContext = useMemo(
    (): ShotSettingsContextValue['imageHandlers'] => ({
      onReorder: handleImageReorder,
      onGenerationDrop: async (
        generationId: string,
        imageUrl: string,
        thumbUrl: string | undefined,
        targetFrame?: number
      ) => {
        await generationActions.handleTimelineGenerationDrop(
          generationId,
          imageUrl,
          thumbUrl,
          targetFrame ?? 0
        );
      },
      onBatchGenerationDrop: async (
        generationId: string,
        imageUrl: string,
        thumbUrl: string | undefined,
        targetFrame?: number
      ) => {
        await generationActions.handleBatchGenerationDrop(
          generationId,
          imageUrl,
          thumbUrl,
          targetFrame
        );
      },
      onDelete: (id: string) => {
        generationActions.handleDeleteImageFromShot(id);
      },
      onBatchDelete: (ids: string[]) => {
        generationActions.handleBatchDeleteImages(ids);
      },
    }),
    [generationActions, handleImageReorder]
  );

  // Build shot management domain for context
  const shotManagementForContext = useMemo(
    (): ShotSettingsContextValue['shotManagement'] => ({
      allShots: shots || [],
      onShotChange: shotActions.handleShotChange,
      onAddToShot: shotActions.handleAddToShot,
      onAddToShotWithoutPosition: shotActions.handleAddToShotWithoutPosition,
      openUnpositionedGenerationsPane: shotActions.openUnpositionedGenerationsPane,
    }),
    [shots, shotActions]
  );

  // Build final context value
  return useMemo(
    (): ShotSettingsContextValue => ({
      // Core
      selectedShot,
      selectedShotId,
      projectId,
      selectedProjectId,
      effectiveAspectRatio,
      projects,
      // UI state
      state,
      actions,
      // LoRA
      loraManager,
      // Images
      allShotImages,
      timelineImages,
      unpositionedImages,
      contextImages,
      videoOutputs,
      simpleFilteredImages,
      // Structure video
      structureVideo: structureVideoForContext,
      structureVideoHandlers,
      // Audio
      audio: audioForContext,
      // Image handlers
      imageHandlers: imageHandlersForContext,
      // Shot management
      shotManagement: shotManagementForContext,
      // Generation mode
      generationMode,
      // Generation handlers
      generationHandlers,
      // Join state
      joinState,
      // Dimension settings
      dimensions,
      // Query client
      queryClient,
    }),
    [
      selectedShot,
      selectedShotId,
      projectId,
      selectedProjectId,
      effectiveAspectRatio,
      projects,
      state,
      actions,
      loraManager,
      allShotImages,
      timelineImages,
      unpositionedImages,
      contextImages,
      videoOutputs,
      simpleFilteredImages,
      structureVideoForContext,
      structureVideoHandlers,
      audioForContext,
      imageHandlersForContext,
      shotManagementForContext,
      generationMode,
      generationHandlers,
      joinState,
      dimensions,
      queryClient,
    ]
  );
}
