import { useState, useCallback, useEffect, useRef } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { toOperationResultError } from '@/shared/lib/operationResult';
import { DragEndEvent, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { subscribeJoinClipsIntents } from '@/shared/lib/joinClips/intentStore';
import type { VideoClip, TransitionPrompt } from '../clipTypes';
import type { useJoinClipsSettings } from './useJoinClipsSettings';
import {
  getCachedClipsCount,
  setCachedClipsCount,
  preloadPosterImages,
  tryConsumePendingJoinClips,
  applyPendingClipActions,
  buildInitialClipsFromSettings,
  padClipsWithEmptySlots,
  createEmptyClip,
  buildClipsToSave,
  buildPromptsToSave,
  getClipsNeedingDuration,
  tryLoadClipDuration,
  normalizeClipSlots,
  reorderClipsAndPrompts,
  clearClipVideo,
} from '../lib/clipManagerService';
interface UseClipManagerParams {
  selectedProjectId: string | null;
  joinSettings: ReturnType<typeof useJoinClipsSettings>;
  settingsLoaded: boolean;
  loopFirstClip: boolean;
}
export function useClipManager({
  selectedProjectId,
  joinSettings,
  settingsLoaded,
  loopFirstClip,
}: UseClipManagerParams) {
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [lightboxClip, setLightboxClip] = useState<VideoClip | null>(null);
  const [transitionPrompts, setTransitionPrompts] = useState<TransitionPrompt[]>([]);
  const [isLoadingPersistedMedia, setIsLoadingPersistedMedia] = useState(false);
  const [initialHydrationComplete, setInitialHydrationComplete] = useState(false);
  const [pendingIntentVersion, setPendingIntentVersion] = useState(0);
  const [cachedClipsCount, setCachedClipsCountState] = useState(() =>
    getCachedClipsCount(selectedProjectId),
  );
  const hasLoadedFromSettings = useRef(false);
  const loadedForProjectRef = useRef<string | null>(null);
  const activeProjectIdRef = useRef<string | null>(selectedProjectId);
  const hydrationRequestVersionRef = useRef(0);
  const durationHydrationVersionRef = useRef(0);
  const pendingConsumeVersionRef = useRef(0);
  const preloadedPostersRef = useRef<Set<string>>(new Set());
  const videoRefs = useRef<{ [clipId: string]: HTMLVideoElement | null }>({});
  useEffect(() => {
    activeProjectIdRef.current = selectedProjectId;
    if (selectedProjectId && selectedProjectId !== loadedForProjectRef.current) {
      hydrationRequestVersionRef.current += 1;
      durationHydrationVersionRef.current += 1;
      pendingConsumeVersionRef.current += 1;
      hasLoadedFromSettings.current = false;
      loadedForProjectRef.current = selectedProjectId;
      setInitialHydrationComplete(false);
      setClips([]);
      setTransitionPrompts([]);
      setIsLoadingPersistedMedia(false);
      preloadedPostersRef.current.clear();
      setCachedClipsCountState(getCachedClipsCount(selectedProjectId));
    }
  }, [selectedProjectId]);
  useEffect(() => {
    if (!selectedProjectId) return;
    const unsubscribe = subscribeJoinClipsIntents((scope) => {
      const scopeProjectId = scope.projectId ?? null;
      if (scopeProjectId && scopeProjectId !== selectedProjectId) {
        return;
      }
      setPendingIntentVersion((prev) => prev + 1);
    });
    return unsubscribe;
  }, [selectedProjectId]);
  useEffect(() => {
    if (!settingsLoaded || !selectedProjectId || !initialHydrationComplete) return;
    const projectIdAtRequestStart = selectedProjectId;
    const requestVersion = pendingConsumeVersionRef.current + 1;
    pendingConsumeVersionRef.current = requestVersion;
    let cancelled = false;
    void tryConsumePendingJoinClips({ projectId: projectIdAtRequestStart }).then(result => {
      if (cancelled) {
        return;
      }
      const isCurrentRequest = (
        pendingConsumeVersionRef.current === requestVersion
        && activeProjectIdRef.current === projectIdAtRequestStart
      );
      if (!isCurrentRequest) {
        return;
      }
      if (!result.ok) {
        normalizeAndPresentError(toOperationResultError(result), {
          context: 'JoinClipsPage.pendingClipsConsume',
          showToast: false,
        });
        return;
      }
      const actions = result.value;
      if (actions.length > 0) {
        setClips(prev => applyPendingClipActions(prev, actions));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [settingsLoaded, selectedProjectId, initialHydrationComplete, pendingIntentVersion]);
  useEffect(() => {
    if (!selectedProjectId || !settingsLoaded || hasLoadedFromSettings.current) return;
    const projectIdAtHydrationStart = selectedProjectId;
    const requestVersion = hydrationRequestVersionRef.current + 1;
    hydrationRequestVersionRef.current = requestVersion;
    hasLoadedFromSettings.current = true;
    setInitialHydrationComplete(false);
    const isCurrentHydrationRequest = () => (
      hydrationRequestVersionRef.current === requestVersion
      && activeProjectIdRef.current === projectIdAtHydrationStart
    );
    const {
      clips: initialClips,
      transitionPrompts: initialPrompts,
      posterUrlsToPreload,
    } = buildInitialClipsFromSettings(joinSettings.settings);
    if (initialPrompts.length > 0) {
      setTransitionPrompts(initialPrompts);
    }
    if (initialClips.length > 0) {
      const clipsToSet = padClipsWithEmptySlots(initialClips);
      if (posterUrlsToPreload.length > 0) {
        setIsLoadingPersistedMedia(true);
        void preloadPosterImages(posterUrlsToPreload, preloadedPostersRef.current).then(() => {
          if (!isCurrentHydrationRequest()) {
            return;
          }
          setClips(clipsToSet);
          setIsLoadingPersistedMedia(false);
          setInitialHydrationComplete(true);
        });
      } else {
        if (!isCurrentHydrationRequest()) {
          return;
        }
        setClips(clipsToSet);
        setInitialHydrationComplete(true);
      }
    } else {
      if (!isCurrentHydrationRequest()) {
        return;
      }
      setClips([createEmptyClip(), createEmptyClip()]);
      setInitialHydrationComplete(true);
    }
  }, [selectedProjectId, joinSettings.settings, settingsLoaded]);
  useEffect(() => {
    if (!settingsLoaded || !initialHydrationComplete) return;
    const clipsToSave = buildClipsToSave(clips);
    setCachedClipsCount(selectedProjectId, clipsToSave.length);
    const promptsToSave = buildPromptsToSave(clips, transitionPrompts);
    const currentClipsJson = JSON.stringify(joinSettings.settings.clips || []);
    const newClipsJson = JSON.stringify(clipsToSave);
    const currentPromptsJson = JSON.stringify(joinSettings.settings.transitionPrompts || []);
    const newPromptsJson = JSON.stringify(promptsToSave);
    if (currentClipsJson !== newClipsJson || currentPromptsJson !== newPromptsJson) {
      joinSettings.updateFields({
        clips: clipsToSave,
        transitionPrompts: promptsToSave,
      });
    }
  }, [clips, transitionPrompts, settingsLoaded, joinSettings, selectedProjectId, initialHydrationComplete]);
  useEffect(() => {
    const clipsNeedingDuration = getClipsNeedingDuration(clips);
    if (clipsNeedingDuration.length === 0) return;
    const projectIdAtRequestStart = activeProjectIdRef.current;
    const requestVersion = durationHydrationVersionRef.current + 1;
    durationHydrationVersionRef.current = requestVersion;
    let cancelled = false;
    const isCurrentRequest = () => (
      !cancelled
      && durationHydrationVersionRef.current === requestVersion
      && activeProjectIdRef.current === projectIdAtRequestStart
    );
    setClips(prev =>
      prev.map(clip =>
        clipsNeedingDuration.some(c => c.id === clip.id)
          ? { ...clip, metadataLoading: true }
          : clip,
        ),
    );
    clipsNeedingDuration.forEach(async clip => {
      const result = await tryLoadClipDuration(clip);
      if (!isCurrentRequest()) {
        return;
      }
      if (!result.ok) {
        normalizeAndPresentError(toOperationResultError(result), {
          context: 'JoinClipsPage.durationMetadata',
          showToast: false,
          logData: { clipId: clip.id },
        });
      }
      setClips(prev =>
        prev.map(c =>
          c.id === clip.id
            ? {
                ...c,
                ...(result.ok
                  ? {
                    durationSeconds: result.value.durationSeconds,
                    durationLoadFailed: false,
                  }
                  : {
                    durationLoadFailed: true,
                  }),
                metadataLoading: false,
              }
            : c,
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [clips]);
  useEffect(() => {
    const result = normalizeClipSlots(clips);
    if (!result) return;
    setClips(result.clips);
    if (result.removedClipIds.length > 0) {
      setTransitionPrompts(prev =>
        prev.filter(p => !result.removedClipIds.includes(p.id)),
      );
    }
  }, [clips]);
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    clips.forEach(clip => {
      const video = videoRefs.current[clip.id];
      if (video) {
        const preventPlay = () => video.pause();
        video.addEventListener('play', preventPlay);
        video.pause();
        cleanups.push(() => {
          video.removeEventListener('play', preventPlay);
        });
      }
    });
    return () => {
      cleanups.forEach(cleanup => cleanup());
    };
  }, [clips]);
  const handleRemoveClip = useCallback((clipId: string) => {
    setClips(prev => {
      if (prev.length <= 2) return prev;
      return prev.filter(c => c.id !== clipId);
    });
    setTransitionPrompts(prev => prev.filter(p => p.id !== clipId));
  }, []);
  const handleClearVideo = useCallback(
    (clipId: string) => {
      const clipIndex = clips.findIndex(c => c.id === clipId);
      if (clipIndex === 0 && loopFirstClip) {
        joinSettings.updateField('loopFirstClip', false);
      }
      setClips(prev =>
        prev.map(clip => (clip.id === clipId ? clearClipVideo(clip) : clip)),
      );
      const videoElement = videoRefs.current[clipId];
      if (videoElement) {
        videoElement.pause();
        videoElement.src = '';
        videoElement.load();
      }
      setTransitionPrompts(prev => prev.filter(p => p.id !== clipId));
    },
    [clips, loopFirstClip, joinSettings],
  );
  const handlePromptChange = useCallback((clipId: string, prompt: string) => {
    setTransitionPrompts(prev => {
      const existing = prev.find(p => p.id === clipId);
      if (existing) {
        return prev.map(p => (p.id === clipId ? { ...p, prompt } : p));
      } else {
        return [...prev, { id: clipId, prompt }];
      }
    });
  }, []);
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const reordered = reorderClipsAndPrompts(
        clips,
        transitionPrompts,
        active.id,
        over.id,
      );
      setClips(reordered.clips);
      setTransitionPrompts(reordered.transitionPrompts);
    },
    [clips, transitionPrompts],
  );
  return {
    clips,
    setClips,
    transitionPrompts,
    lightboxClip,
    setLightboxClip,
    isLoadingPersistedMedia,
    cachedClipsCount,
    videoRefs,
    handleRemoveClip,
    handleClearVideo,
    handlePromptChange,
    sensors,
    handleDragEnd,
  };
}
