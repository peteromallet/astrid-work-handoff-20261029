import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Shot } from '@/domains/generation/types';
import { ShotListDisplay } from './ShotListDisplay';

const mocks = vi.hoisted(() => ({
  videoShotDisplayProps: [] as Array<Record<string, unknown>>,
  setShotDragData: vi.fn(),
}));

vi.mock('./hooks/useShotListDisplayController', () => ({
  useShotListDisplayController: ({ shots }: { shots?: Shot[] }) => ({
    shotsLoading: false,
    shotsError: null,
    shots,
    currentProject: { aspectRatio: '16:9' },
    effectiveProjectId: 'project-1',
    pendingNewShot: {
      isNewShotProcessing: false,
      isNewShotDropTarget: false,
      newShotDropType: 'none',
      handleNewShotDragEnter: vi.fn(),
      handleNewShotDragOver: vi.fn(),
      handleNewShotDragLeave: vi.fn(),
      handleNewShotDrop: vi.fn(),
      pendingSkeletonShot: null,
      newlyCreatedShotId: null,
      newlyCreatedShotExpectedImages: 0,
      newlyCreatedShotBaselineNonVideoCount: 0,
      clearNewlyCreatedShot: vi.fn(),
    },
  }),
}));

vi.mock('./hooks/useSortableShotDropFeedback', () => ({
  useSortableShotDropFeedback: () => ({
    isDropTarget: false,
    isOverWithoutPositionZone: false,
    withoutPositionDropState: 'idle',
    withPositionDropState: 'idle',
    pendingSkeletonCount: 0,
    withoutPositionZoneRef: { current: null },
    handleDragEnter: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDrop: vi.fn(),
    handleWithoutPositionDrop: vi.fn(),
    handleWithoutPositionDragEnter: vi.fn(),
    handleWithoutPositionDragOver: vi.fn(),
    handleWithoutPositionDragLeave: vi.fn(),
  }),
}));

vi.mock('./VideoShotDisplay', () => ({
  VideoShotDisplay: (props: Record<string, unknown>) => {
    mocks.videoShotDisplayProps.push(props);
    return (
      <button
        type="button"
        data-testid={`shot-${(props.shot as Shot).id}`}
        onClick={() => (props.onToggleHidden as undefined | (() => void))?.()}
      >
        {String(props.isHidden)}
      </button>
    );
  },
}));

vi.mock('./components/ShotListDisplayStates', () => ({
  NewShotDropZoneCard: () => null,
  PendingSkeletonShotCard: () => null,
  ShotListEmptyState: () => <div>empty</div>,
  ShotListErrorState: () => <div>error</div>,
  ShotListLoadingState: () => <div>loading</div>,
}));

vi.mock('@/shared/lib/dnd/dragDrop', () => ({
  createDragPreview: () => null,
  setShotDragData: (...args: unknown[]) => mocks.setShotDragData(...args),
}));

vi.mock('@/shared/lib/media/mediaTypeHelpers', () => ({
  getGenerationId: () => 'generation-1',
}));

vi.mock('@/shared/lib/typeGuards', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/typeGuards')>('@/shared/lib/typeGuards');
  return {
    ...actual,
    isVideoGeneration: () => false,
  };
});

describe('ShotListDisplay', () => {
  beforeEach(() => {
    mocks.videoShotDisplayProps = [];
    mocks.setShotDragData.mockReset();
  });

  it('threads hidden-shot state and toggle callbacks through list items into video cards', () => {
    const hiddenShot = { id: 'shot-hidden', name: 'Hidden shot', images: [] } as Shot;
    const visibleShot = { id: 'shot-visible', name: 'Visible shot', images: [] } as Shot;
    const onToggleHidden = vi.fn();

    render(
      <ShotListDisplay
        shots={[hiddenShot, visibleShot]}
        onSelectShot={vi.fn()}
        isHidden={(shot) => shot.id === hiddenShot.id}
        onToggleHidden={onToggleHidden}
      />,
    );

    expect(mocks.videoShotDisplayProps).toHaveLength(2);
    expect(mocks.videoShotDisplayProps[0]).toEqual(
      expect.objectContaining({
        shot: hiddenShot,
        isHidden: true,
        onToggleHidden: expect.any(Function),
      }),
    );
    expect(mocks.videoShotDisplayProps[1]).toEqual(
      expect.objectContaining({
        shot: visibleShot,
        isHidden: false,
        onToggleHidden: expect.any(Function),
      }),
    );

    fireEvent.click(screen.getByTestId('shot-shot-hidden'));
    expect(onToggleHidden).toHaveBeenCalledWith(hiddenShot);
  });
});
