import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ItemMetadataBar } from './ItemMetadataBar';

vi.mock('./InfoTooltip', () => ({
  InfoTooltip: () => <div data-testid="info-tooltip" />,
}));

vi.mock('@/shared/components/VariantBadge', () => ({
  VariantBadge: () => <div data-testid="variant-badge" />,
}));

describe('ItemMetadataBar', () => {
  it('renders the info and variant controls for non-video content', () => {
    render(
      <ItemMetadataBar
        {...({
          image: {
            id: 'img-1',
            derivedCount: 2,
            unviewedVariantCount: 1,
            hasUnviewedVariants: true,
          },
          isVideoContent: false,
          isMobile: false,
          taskData: { id: 'task-1' },
          inputImages: ['in.png'],
          shouldShowMetadata: true,
          shouldShowTaskDetails: true,
          setIsInfoOpen: vi.fn(),
          onMarkAllVariantsViewed: vi.fn(),
        } as never)}
      />,
    );

    expect(screen.getByTestId('info-tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('variant-badge')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('hides the variant badge for video content and positions the bar on mobile', () => {
    const { container } = render(
      <ItemMetadataBar
        {...({
          image: { id: 'img-2' },
          isVideoContent: true,
          isMobile: true,
          taskData: null,
          inputImages: [],
          shouldShowMetadata: false,
          shouldShowTaskDetails: false,
          setIsInfoOpen: vi.fn(),
          onMarkAllVariantsViewed: vi.fn(),
        } as never)}
      />,
    );

    expect(screen.getByTestId('info-tooltip')).toBeInTheDocument();
    expect(screen.queryByTestId('variant-badge')).not.toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain('top-12');
  });
});
