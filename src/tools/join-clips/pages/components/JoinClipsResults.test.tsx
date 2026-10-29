import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JoinClipsResults } from './JoinClipsResults';

const mocks = vi.hoisted(() => ({
  MediaGallery: vi.fn(),
  SkeletonGallery: vi.fn(),
  buildVideoResultsGalleryConfig: vi.fn(),
  getVideoGalleryItemsPerPage: vi.fn(),
}));

vi.mock('@/shared/components/MediaGallery', () => ({
  MediaGallery: (props: unknown) => {
    mocks.MediaGallery(props);
    return <div data-testid="media-gallery" />;
  },
}));

vi.mock('@/shared/components/ui/composed/skeleton-gallery', () => ({
  SkeletonGallery: (props: unknown) => {
    mocks.SkeletonGallery(props);
    return <div data-testid="skeleton-gallery" />;
  },
}));

vi.mock('@/shared/components/MediaGallery/videoGalleryDefaults', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/components/MediaGallery/videoGalleryDefaults')>();
  return {
    ...actual,
    buildVideoResultsGalleryConfig: (...args: unknown[]) => mocks.buildVideoResultsGalleryConfig(...args),
    getVideoGalleryItemsPerPage: (...args: unknown[]) => mocks.getVideoGalleryItemsPerPage(...args),
  };
});

describe('JoinClipsResults', () => {
  beforeEach(() => {
    mocks.MediaGallery.mockReset();
    mocks.SkeletonGallery.mockReset();
    mocks.buildVideoResultsGalleryConfig.mockReset();
    mocks.getVideoGalleryItemsPerPage.mockReset();

    mocks.buildVideoResultsGalleryConfig.mockReturnValue({ reducedSpacing: true });
    mocks.getVideoGalleryItemsPerPage.mockReturnValue(12);
  });

  it('renders the loading skeleton when loading without valid data', () => {
    render(
      <JoinClipsResults
        videosData={undefined}
        videosLoading
        videosFetching={false}
        projectAspectRatio="16:9"
        isMobile={false}
      />,
    );

    expect(screen.getByText('Loading Results...')).toBeInTheDocument();
    expect(screen.getByTestId('skeleton-gallery')).toBeInTheDocument();
    expect(mocks.SkeletonGallery).toHaveBeenCalledWith(expect.objectContaining({
      count: 6,
      projectAspectRatio: '16:9',
    }));
  });

  it('renders the media gallery with the expected pagination and config when results exist', () => {
    const items = [{ id: 'video-1' }, { id: 'video-2' }];

    render(
      <JoinClipsResults
        videosData={{ items } as never}
        videosLoading={false}
        videosFetching={false}
        projectAspectRatio="1:1"
        isMobile
      />,
    );

    expect(screen.getByText('Previous Results (2)')).toBeInTheDocument();
    expect(screen.getByTestId('media-gallery')).toBeInTheDocument();
    expect(mocks.getVideoGalleryItemsPerPage).toHaveBeenCalledWith(true);
    expect(mocks.buildVideoResultsGalleryConfig).toHaveBeenCalledWith(2, true, {
      hideBottomPagination: true,
      hideMediaTypeFilter: true,
    });
    expect(mocks.MediaGallery).toHaveBeenCalledWith(expect.objectContaining({
      images: items,
      pagination: { itemsPerPage: 12 },
      config: { reducedSpacing: true },
    }));
  });

  it('renders nothing when there are no results and nothing is loading', () => {
    const { container } = render(
      <JoinClipsResults
        videosData={{ items: [] } as never}
        videosLoading={false}
        videosFetching={false}
        projectAspectRatio={undefined}
        isMobile={false}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
