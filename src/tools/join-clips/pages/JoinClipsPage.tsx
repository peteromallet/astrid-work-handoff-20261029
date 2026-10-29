import React, { useEffect, useMemo } from 'react';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import { useProjectCrudContext, useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { useQueryClient } from '@tanstack/react-query';
import { useProjectGenerations, type GenerationsPaginatedResponse } from '@/shared/hooks/projects/useProjectGenerations';
import { MediaLightbox } from '@/domains/media-lightbox/MediaLightbox';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useLoraManager } from '@/domains/lora/hooks/useLoraManager';
import { Card } from '@/shared/components/ui/card';
import { PageFadeIn } from '@/shared/components/transitions/PageFadeIn';
import {
  type ValidationResult,
} from '../utils/validation';
import { useJoinClipsSettings } from '../hooks/useJoinClipsSettings';
import { useClipManager } from '../hooks/useClipManager';
import { useJoinClipsGenerate } from '../hooks/useJoinClipsGenerate';
import {
  JoinClipsSettingsForm,
  DEFAULT_JOIN_CLIPS_PHASE_CONFIG,
} from '@/shared/components/JoinClipsSettingsForm/JoinClipsSettingsForm';
import type { ClipPairInfo } from '@/shared/components/JoinClipsSettingsForm/types';
import {
  useEnsureKeepBridgingImages,
  useJoinClipPairs,
  useJoinValidationResult,
  useRefreshOnVisibility,
  useSyncJoinClipsLoras,
  type ClipManagerState,
  type JoinSettingsState,
} from './hooks/useJoinClipsPageHelpers';
import type { LoraManagerState } from '@/domains/lora/types/loraManager';
import { JoinClipsGrid } from './components/JoinClipsGrid';
import { JoinClipsResults } from './components/JoinClipsResults';

type JoinGenerateState = ReturnType<typeof useJoinClipsGenerate>;

interface JoinClipsPageLayoutProps {
  selectedProjectId: string;
  projectAspectRatio: string | undefined;
  isMobile: boolean;
  joinSettings: JoinSettingsState;
  settingsLoaded: boolean;
  loraManager: LoraManagerState;
  clipManager: ClipManagerState;
  validationResult: ValidationResult | null;
  clipPairs: ClipPairInfo[];
  generateState: JoinGenerateState;
  videosData: GenerationsPaginatedResponse | undefined;
  videosLoading: boolean;
  videosFetching: boolean;
}

interface JoinClipsSettingsFormAdapterInput {
  settings: JoinSettingsState['settings'];
  joinSettings: JoinSettingsState;
  clipManager: ClipManagerState;
  validationResult: ValidationResult | null;
  clipPairs: ClipPairInfo[];
  selectedProjectId: string;
  loraManager: LoraManagerState;
  generateState: JoinGenerateState;
}

function buildJoinClipsSettingsFormProps({
  settings,
  joinSettings,
  clipManager,
  validationResult,
  clipPairs,
  selectedProjectId,
  loraManager,
  generateState,
}: JoinClipsSettingsFormAdapterInput): React.ComponentProps<typeof JoinClipsSettingsForm> {
  return {
    clipSettings: {
      gapFrames: settings.gapFrameCount,
      setGapFrames: (value) => joinSettings.updateField('gapFrameCount', value),
      contextFrames: settings.contextFrameCount,
      setContextFrames: (value) => joinSettings.updateField('contextFrameCount', value),
      replaceMode: settings.replaceMode,
      setReplaceMode: (value) => joinSettings.updateField('replaceMode', value),
      keepBridgingImages: settings.keepBridgingImages,
      setKeepBridgingImages: (value) => joinSettings.updateField('keepBridgingImages', value),
      prompt: settings.prompt,
      setPrompt: (value) => joinSettings.updateField('prompt', value),
      negativePrompt: settings.negativePrompt,
      setNegativePrompt: (value) => joinSettings.updateField('negativePrompt', value),
      useIndividualPrompts: settings.useIndividualPrompts,
      setUseIndividualPrompts: (value) => joinSettings.updateField('useIndividualPrompts', value),
      clipCount: clipManager.clips.filter(clip => clip.url).length,
      enhancePrompt: settings.enhancePrompt,
      setEnhancePrompt: (value) => joinSettings.updateField('enhancePrompt', value),
      useInputVideoResolution: settings.useInputVideoResolution,
      setUseInputVideoResolution: (value) => joinSettings.updateField('useInputVideoResolution', value),
      showResolutionToggle: true,
      useInputVideoFps: settings.useInputVideoFps,
      setUseInputVideoFps: (value) => joinSettings.updateField('useInputVideoFps', value),
      showFpsToggle: true,
      noisedInputVideo: settings.noisedInputVideo,
      setNoisedInputVideo: (value) => joinSettings.updateField('noisedInputVideo', value),
      shortestClipFrames: validationResult?.shortestClipFrames,
      clipPairs,
    },
    motionConfig: {
      projectId: selectedProjectId,
      loraPersistenceKey: TOOL_IDS.JOIN_CLIPS,
      loraManager,
      motionMode: settings.motionMode as 'basic' | 'advanced',
      onMotionModeChange: (mode) => joinSettings.updateField('motionMode', mode),
      phaseConfig: settings.phaseConfig ?? DEFAULT_JOIN_CLIPS_PHASE_CONFIG,
      onPhaseConfigChange: (config) => joinSettings.updateField('phaseConfig', config),
      randomSeed: settings.randomSeed,
      onRandomSeedChange: (value) => joinSettings.updateField('randomSeed', value),
      selectedPhasePresetId: settings.selectedPhasePresetId,
      onPhasePresetSelect: (presetId, config) => {
        joinSettings.updateFields({
          selectedPhasePresetId: presetId,
          phaseConfig: config,
        });
      },
      onPhasePresetRemove: () => {
        joinSettings.updateField('selectedPhasePresetId', null);
      },
    },
    uiState: {
      onGenerate: generateState.handleGenerate,
      isGenerating: generateState.isGenerating,
      generateSuccess: generateState.showSuccessState,
      generateButtonText: generateState.generateButtonText,
      isGenerateDisabled: generateState.isGenerateDisabled,
      onRestoreDefaults: generateState.handleRestoreDefaults,
    },
  };
}

function JoinClipsPageLayout({
  selectedProjectId,
  projectAspectRatio,
  isMobile,
  joinSettings,
  settingsLoaded,
  loraManager,
  clipManager,
  validationResult,
  clipPairs,
  generateState,
  videosData,
  videosLoading,
  videosFetching,
}: JoinClipsPageLayoutProps) {
  const settings = joinSettings.settings;
  const settingsFormProps = useMemo(() => buildJoinClipsSettingsFormProps({
    settings,
    joinSettings,
    clipManager,
    validationResult,
    clipPairs,
    selectedProjectId,
    loraManager,
    generateState,
  }), [
    settings,
    joinSettings,
    clipManager,
    validationResult,
    clipPairs,
    selectedProjectId,
    loraManager,
    generateState,
  ]);

  return (
    <PageFadeIn>
      <div className="flex flex-col gap-y-6 pb-6 px-4 max-w-7xl mx-auto pt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-light tracking-tight text-foreground">Join Clips</h1>
        </div>

        <JoinClipsGrid
          joinSettings={joinSettings}
          clipManager={clipManager}
          settingsLoaded={settingsLoaded}
        />

        <Card className="p-6 sm:p-8 shadow-sm border">
          <JoinClipsSettingsForm {...settingsFormProps} />
        </Card>

        <JoinClipsResults
          videosData={videosData}
          videosLoading={videosLoading}
          videosFetching={videosFetching}
          projectAspectRatio={projectAspectRatio}
          isMobile={isMobile}
        />
      </div>

      {clipManager.lightboxClip && (
        <MediaLightbox
          media={{
            id: clipManager.lightboxClip.id,
            imageUrl: clipManager.lightboxClip.url,
            location: clipManager.lightboxClip.url,
            thumbUrl: clipManager.lightboxClip.posterUrl,
            type: 'video',
          }}
          onClose={() => clipManager.setLightboxClip(null)}
          navigation={{ showNavigation: false }}
          features={{ showDownload: true }}
        />
      )}
    </PageFadeIn>
  );
}

const JoinClipsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProjectSelectionContext();
  const { projects } = useProjectCrudContext();
  const isMobile = useIsMobile();

  const currentProject = projects.find(project => project.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;

  const joinSettings = useJoinClipsSettings(selectedProjectId);
  const settings = joinSettings.settings;
  const settingsLoaded = joinSettings.status !== 'idle' && joinSettings.status !== 'loading';

  const loraManager = useLoraManager({
    projectId: selectedProjectId || undefined,
    persistenceScope: 'project',
    enableProjectPersistence: true,
    persistenceKey: TOOL_IDS.JOIN_CLIPS,
  });

  useSyncJoinClipsLoras(settingsLoaded, loraManager.selectedLoras, joinSettings);
  useEnsureKeepBridgingImages(settings.keepBridgingImages, settingsLoaded, joinSettings);

  const clipManager = useClipManager({
    selectedProjectId,
    joinSettings,
    settingsLoaded,
    loopFirstClip: settings.loopFirstClip,
  });

  const validationResult = useJoinValidationResult(
    clipManager.clips,
    settings.contextFrameCount,
    settings.gapFrameCount,
    settings.replaceMode,
    settings.useInputVideoFps,
  );

  const clipPairs = useJoinClipPairs(clipManager.clips, settings.useInputVideoFps);

  const generateState = useJoinClipsGenerate({
    selectedProjectId,
    clips: clipManager.clips,
    transitionPrompts: clipManager.transitionPrompts,
    joinSettings,
    loraManager,
    projectAspectRatio,
    validationResult,
  });

  const generationsQuery = useProjectGenerations(
    selectedProjectId,
    1,
    100,
    !!selectedProjectId,
    {
      toolType: TOOL_IDS.JOIN_CLIPS,
      mediaType: 'video',
    },
    {
      disablePolling: true,
    }
  );

  const videosData = generationsQuery.data as GenerationsPaginatedResponse | undefined;
  const videosLoading = generationsQuery.isLoading;
  const videosFetching = generationsQuery.isFetching;

  useEffect(() => {
    if (generateState.videosViewJustEnabled && videosData?.items) {
      generateState.setVideosViewJustEnabled(false);
    }
  }, [generateState, videosData?.items]);

  useRefreshOnVisibility(selectedProjectId, queryClient);

  if (!selectedProjectId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select a project first.</p>
      </div>
    );
  }

  return (
    <JoinClipsPageLayout
      selectedProjectId={selectedProjectId}
      projectAspectRatio={projectAspectRatio}
      isMobile={isMobile}
      joinSettings={joinSettings}
      settingsLoaded={settingsLoaded}
      loraManager={loraManager}
      clipManager={clipManager}
      validationResult={validationResult}
      clipPairs={clipPairs}
      generateState={generateState}
      videosData={videosData}
      videosLoading={videosLoading}
      videosFetching={videosFetching}
    />
  );
};

export default JoinClipsPage;
