// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Shot } from '@/domains/generation/types';
import { ShotsPanelContent } from './ShotsPanelContent';

const mocks = vi.hoisted(() => ({
  addImageToShot: vi.fn(),
  toggleHidden: vi.fn(),
  refetchShots: vi.fn(),
  getGenerationDropData: vi.fn(),
  getMultiGenerationDropData: vi.fn(),
  isValidDropTarget: vi.fn(() => false),
}));

vi.mock('@/shared/contexts/ShotsContext', () => ({
  useShots: () => ({
    shots: [
      {
        id: 'shot-1',
        name: 'Shot Alpha',
        images: [],
        settings: {},
        position: 1,
      } as Shot,
    ],
    isLoading: false,
    refetchShots: mocks.refetchShots,
  }),
}));

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProjectSelectionContext: () => ({ selectedProjectId: 'project-1' }),
}));

vi.mock('@/shared/hooks/shots/useShotGenerationMutations', () => ({
  useAddImageToShot: () => ({ mutateAsync: mocks.addImageToShot }),
}));

vi.mock('@/tools/travel-between-images/hooks/useHiddenShots', () => ({
  useHiddenShots: () => ({ hiddenIds: new Set<string>(), toggle: mocks.toggleHidden }),
}));

vi.mock('@/shared/lib/dnd/dragDrop', () => ({
  setShotDragData: vi.fn(),
  createDragPreview: vi.fn(),
  getGenerationDropData: (...args: unknown[]) => mocks.getGenerationDropData(...args),
  getMultiGenerationDropData: (...args: unknown[]) => mocks.getMultiGenerationDropData(...args),
  isValidDropTarget: (...args: unknown[]) => mocks.isValidDropTarget(...args),
}));

vi.mock('@/tools/travel-between-images/components/VideoGenerationModal', () => ({
  VideoGenerationModal: () => null,
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/shared/dev/useRenderBudget', () => ({
  useRenderBudget: vi.fn(),
}));

describe('ShotsPanelContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isValidDropTarget.mockReturnValue(false);
  });

  it('lists the shot with hide, open and drop affordances but no shot-editing controls', () => {
    render(<ShotsPanelContent projectId="project-1" />);

    expect(screen.getByText('Shot Alpha')).toBeInTheDocument();
    expect(screen.getByTitle('Hide')).toBeInTheDocument();

    expect(screen.queryByTitle('Rename')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicate shot' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicate with videos' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
    expect(screen.queryByText('New shot')).not.toBeInTheDocument();
  });

  it('toggles the hidden state without opening the shot', () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <ShotsPanelContent projectId="project-1" />
      </div>,
    );

    fireEvent.click(screen.getByTitle('Hide'));

    expect(mocks.toggleHidden).toHaveBeenCalledWith('shot-1');
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('places a dropped generation into the shot', async () => {
    mocks.isValidDropTarget.mockReturnValue(true);
    mocks.getMultiGenerationDropData.mockReturnValue(null);
    mocks.getGenerationDropData.mockReturnValue({
      generationId: 'gen-1',
      imageUrl: 'https://example.test/gen-1.png',
      thumbUrl: 'https://example.test/gen-1-thumb.png',
    });
    mocks.addImageToShot.mockResolvedValue(undefined);

    render(<ShotsPanelContent projectId="project-1" />);

    fireEvent.drop(screen.getByText('Shot Alpha'));

    await waitFor(() => {
      expect(mocks.addImageToShot).toHaveBeenCalledWith({
        shot_id: 'shot-1',
        generation_id: 'gen-1',
        project_id: 'project-1',
        imageUrl: 'https://example.test/gen-1.png',
        thumbUrl: 'https://example.test/gen-1-thumb.png',
      });
    });
    expect(mocks.refetchShots).toHaveBeenCalled();
  });
});
