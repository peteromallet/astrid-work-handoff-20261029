import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Shot } from '@/domains/generation/types';
import { VideoShotDisplay } from './VideoShotDisplay';

const mocks = vi.hoisted(() => ({
  shotControlsProps: null as null | Record<string, unknown>,
  triggerRipple: vi.fn(),
}));

vi.mock('@/shared/hooks/interaction/useClickRipple', () => ({
  useClickRipple: () => ({
    triggerRipple: mocks.triggerRipple,
    rippleStyles: undefined,
    isRippleActive: false,
  }),
}));

vi.mock('@/shared/state/panesStore', () => ({
  usePanesStore: (selector: (state: { isGenerationsPaneLocked: boolean }) => unknown) => selector({
    isGenerationsPaneLocked: false,
  }),
}));

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/shared/state/selectionStore', () => ({
  useShotAdditionSelectionOptional: () => null,
}));

vi.mock('../hooks/useVideoShotDisplayState', () => ({
  useVideoShotDisplayState: () => ({
    isVideoModalOpen: false,
    isSelectedForAddition: false,
    setVideoModalOpen: vi.fn(),
    setSelectedForAddition: vi.fn(),
  }),
}));

vi.mock('./VideoShotDisplayParts', () => ({
  ShotMetadata: ({ displayName }: { displayName: string }) => (
    <div data-testid="shot-metadata">{displayName}</div>
  ),
  ShotControls: (props: Record<string, unknown>) => {
    mocks.shotControlsProps = props;
    return <div data-testid="shot-controls">{String(props.isHidden)}</div>;
  },
  ShotPreview: () => <div data-testid="shot-preview">preview</div>,
}));

vi.mock('../VideoGenerationModal', () => ({
  VideoGenerationModal: () => null,
}));

vi.mock('@/shared/components/modals/ImageGenerationModal', () => ({
  ImageGenerationModal: () => null,
}));

describe('VideoShotDisplay', () => {
  beforeEach(() => {
    mocks.shotControlsProps = null;
  });

  it('renders hidden styling and forwards hidden controls into ShotControls', () => {
    const shot = { id: 'shot-1', name: 'Shot Alpha', images: [], settings: {} } as Shot;
    const onToggleHidden = vi.fn();
    const { container } = render(
      <VideoShotDisplay
        shot={shot}
        onSelectShot={vi.fn()}
        isHidden={true}
        onToggleHidden={onToggleHidden}
      />,
    );

    expect(container.firstElementChild).toHaveClass('opacity-50');
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    expect(screen.getByTestId('shot-controls')).toHaveTextContent('true');
    expect(mocks.shotControlsProps).toEqual(
      expect.objectContaining({
        isHidden: true,
        onToggleHidden,
      }),
    );
  });
});
