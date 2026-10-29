// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShotEditorView } from './ShotEditorView.tsx';
import fixture from '@/tools/video-editor/data/shotComposition.fixture.json';
import { createShotCompositionAdapter, type ShotCompositionPublishRequest } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import { StaleWriteError } from '@/tools/video-editor/data/shotComposition.ts';
import { updateCanonicalShotName, updateCanonicalShotSettings } from '@/tools/video-editor/data/shotCompositionEditor.ts';
import type { Shot } from '@/domains/generation/types';

const capture = vi.hoisted(() => ({ persistence: null as any, onName: null as any, errors: vi.fn() }));
vi.mock('../components/ShotEditor', () => ({ ShotSettingsEditor: (props: any) => { capture.onName = props.onUpdateShotName; return null; } }));
vi.mock('../providers', () => ({
  VideoTravelSettingsProvider: (props: any) => { capture.persistence = props.shotSettingsPersistence; return props.children; },
  useVideoTravelSettingsMutations: () => ({ settings: {}, status: 'loading' }),
}));
vi.mock('../components/ShotTimelinePreview.tsx', () => ({ ShotTimelinePreview: () => null }));
vi.mock('../components/VideoTravelFloatingOverlay', () => ({ VideoTravelFloatingOverlay: () => null }));
vi.mock('@/shared/state/selectionStore', () => ({ useCurrentShot: () => ({ setCurrentShotId: vi.fn() }) }));
vi.mock('@/shared/hooks/mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/shared/hooks/shots/useShotNavigation', () => ({ useShotNavigation: () => ({ navigateToPreviousShot: vi.fn(), navigateToNextShot: vi.fn() }) }));
vi.mock('@/shared/hooks/shots/useShotImages', () => ({ usePrimeShotImagesCache: () => undefined }));
vi.mock('@/shared/hooks/invalidation/useGenerationInvalidation', () => ({ useEnqueueGenerationsInvalidation: () => vi.fn() }));
vi.mock('@/shared/hooks/projects/useProjectVideoCountsCache', () => ({ useProjectVideoCountsCache: () => ({ getFinalVideoCount: vi.fn(), getHasStructureVideo: vi.fn() }) }));
vi.mock('@/shared/hooks/projects/useProjectGenerationModesCache', () => ({ useProjectGenerationModesCache: () => ({ updateShotMode: vi.fn() }) }));
vi.mock('@/shared/hooks/gallery/useVideoGalleryPreloader', () => ({ useVideoGalleryPreloader: () => undefined }));
vi.mock('../hooks/useStickyHeader', () => ({ useStickyHeader: () => ({}) }));
vi.mock('../hooks/navigation/useNavigationState', () => ({ useNavigationState: () => ({ sortedShots: [], hasPrevious: false, hasNext: false }) }));
vi.mock('../hooks/useOperationTracking', () => ({ useOperationTracking: () => ({ setIsDraggingInTimeline: vi.fn(), signalShotOperation: vi.fn() }) }));
vi.mock('@/shared/state/panesStore', () => ({ usePanesStore: (select: any) => select({}) }));
vi.mock('@/shared/lib/errorHandling/runtimeError.ts', () => ({ normalizeAndPresentError: capture.errors }));

afterEach(() => { cleanup(); capture.errors.mockClear(); capture.persistence = null; capture.onName = null; });

async function setup() {
  let current = structuredClone(fixture);
  const publish = vi.fn(async (request: ShotCompositionPublishRequest) => {
    if (request.expectedHeadRevisionId !== current.primary_timeline.head.revision_id) throw new StaleWriteError('fixture competing immutable head');
    current = request.graph as typeof current;
    return current;
  });
  const adapter = createShotCompositionAdapter({ load: async () => current, publish });
  const base = await adapter.load({ projectId: 'project-001', parentDocumentId: 'document-primary' });
  const occurrence = base.occurrences.find((value) => value.occurrenceId === 'occ-1')!;
  render(<MemoryRouter initialEntries={['/tools/travel-between-images?project=project-001&timeline=document-primary']}>
    <ShotEditorView shotToEdit={{ id: 'shot-alpha', name: 'Original', images: [] } as unknown as Shot}
      selectedProjectId="project-001" isNewlyCreatedShot={false} shotFromState={undefined} shots={[]}
      availableLoras={[]} canonicalComposition={base} canonicalShotComposition={adapter}
      canonicalOccurrence={occurrence} />
  </MemoryRouter>);
  return { base, publish, read: () => current, compete: (graph: typeof current) => { current = graph; } };
}

describe('current App shot editing base', () => {
  it.each(['name', 'settings'] as const)('rejects a competing %s edit instead of silently adopting its new head', async (field) => {
    const state = await setup();
    if (field === 'settings') await capture.persistence.load('shot-alpha');
    const competing = field === 'name'
      ? await updateCanonicalShotName(state.base.contract, 'occ-1', 'Competing name')
      : await updateCanonicalShotSettings(state.base.contract, 'occ-1', { prompt: 'Competing prompt' });
    state.compete(competing as typeof fixture);
    if (field === 'name') {
      capture.onName('My older name');
      await waitFor(() => expect(capture.errors).toHaveBeenCalled());
      expect(capture.errors.mock.calls[0]?.[0]).toBeInstanceOf(StaleWriteError);
    } else {
      await expect(capture.persistence.save('shot-alpha', { prompt: 'My older prompt' })).rejects.toBeInstanceOf(StaleWriteError);
    }
    expect(state.publish).toHaveBeenCalledWith(expect.objectContaining({ expectedHeadRevisionId: state.base.headRevisionId }));
    expect(state.read()).toEqual(competing);
  });

  it('keeps the immutable editing head for an independent competing field too', async () => {
    const state = await setup();
    await capture.persistence.load('shot-alpha');
    const competing = await updateCanonicalShotName(state.base.contract, 'occ-1', 'Independent name');
    state.compete(competing as typeof fixture);
    await expect(capture.persistence.save('shot-alpha', { prompt: 'My prompt' })).rejects.toBeInstanceOf(StaleWriteError);
    expect(state.read()).toEqual(competing);
  });
  it.each(['name', 'settings'] as const)('publishes an uncontended %s edit from its captured head', async (field) => {
    const state = await setup();
    if (field === 'name') {
      capture.onName('My name');
      await waitFor(() => expect(state.publish).toHaveBeenCalledOnce());
      expect(capture.errors).not.toHaveBeenCalled();
    } else {
      await capture.persistence.load('shot-alpha');
      await capture.persistence.save('shot-alpha', { prompt: 'First prompt' });
      const ownHead = state.read().primary_timeline.head.revision_id;
      await capture.persistence.save('shot-alpha', { prompt: 'Second prompt' });
      expect(state.publish.mock.calls[1]?.[0].expectedHeadRevisionId).toBe(ownHead);
    }
    expect(state.publish.mock.calls[0]?.[0].expectedHeadRevisionId).toBe(state.base.headRevisionId);
    expect(state.read().primary_timeline.head.revision_id).not.toBe(state.base.headRevisionId);
  });

  it('offers no shot rename when the shot is not a canonical document occurrence', () => {
    render(<MemoryRouter initialEntries={['/tools/travel-between-images']}>
      <ShotEditorView shotToEdit={{ id: 'shot-alpha', name: 'Original', images: [] } as unknown as Shot}
        selectedProjectId="project-001" isNewlyCreatedShot={false} shotFromState={undefined} shots={[]}
        availableLoras={[]} />
    </MemoryRouter>);

    expect(capture.onName).toBeUndefined();
  });
});
