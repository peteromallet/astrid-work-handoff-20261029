import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GenerationsPaneControls } from './GenerationsPaneControls';
import { SHOT_FILTER } from '@/shared/constants/filterConstants';

const SHOTS = [
  { id: 'shot-1', name: 'Opening' },
  { id: 'shot-2', name: 'Finale' },
] as React.ComponentProps<typeof GenerationsPaneControls>['filters']['shots'];

describe('GenerationsPaneControls', () => {
  function buildProps(overrides: Partial<React.ComponentProps<typeof GenerationsPaneControls>> = {}) {
    return {
      filters: {
        shots: [],
        selectedShotFilter: SHOT_FILTER.ALL,
        onSelectedShotFilterChange: vi.fn(),
        excludePositioned: false,
        onExcludePositionedChange: vi.fn(),
        isMobile: false,
        shotFilterContentRef: { current: null },
        mediaTypeFilterContentRef: { current: null },
        shotFilterOpen: false,
        onShotFilterOpenChange: vi.fn(),
        mediaTypeFilter: 'all',
        onMediaTypeFilterChange: vi.fn(),
        mediaTypeFilterOpen: false,
        onMediaTypeFilterOpenChange: vi.fn(),
        searchTerm: '',
        onSearchTermChange: vi.fn(),
        isSearchOpen: false,
        onSearchOpenChange: vi.fn(),
        searchInputRef: { current: null },
        starredOnly: false,
        onStarredOnlyChange: vi.fn(),
        currentShotId: null,
        isSpecialFilterSelected: false,
      },
      pagination: {
        totalCount: 3,
        totalIsExact: true,
        perPage: 18,
        page: 1,
        onPageChange: vi.fn(),
      },
      interaction: {
        isInteractionDisabled: false,
      },
      ...overrides,
    } as React.ComponentProps<typeof GenerationsPaneControls>;
  }

  it('offers All, Images, Videos and Audio with All selected by default', () => {
    render(<GenerationsPaneControls {...buildProps()} />);
    const group = screen.getByRole('radiogroup', { name: 'Media type' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['All', 'Images', 'Videos', 'Audio']);
    expect(within(group).getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
  });

  it('passes video through the media type handler', () => {
    const props = buildProps();
    render(<GenerationsPaneControls {...props} />);
    const group = screen.getByRole('radiogroup', { name: 'Media type' });
    fireEvent.click(within(group).getByRole('radio', { name: 'Videos' }));
    expect(props.filters.onMediaTypeFilterChange).toHaveBeenCalledWith('video');
  });

  it('hides the scope menu when there are no shots and no current shot', () => {
    render(<GenerationsPaneControls {...buildProps()} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('All shots')).not.toBeInTheDocument();
  });

  it('shows the scope menu with labels, not raw values', () => {
    render(
      <GenerationsPaneControls
        {...buildProps({
          filters: { ...buildProps().filters, shots: SHOTS, selectedShotFilter: SHOT_FILTER.NO_SHOT },
        })}
      />,
    );
    expect(screen.getByText('Not in a shot')).toBeInTheDocument();
    expect(screen.queryByText('no-shot')).not.toBeInTheDocument();
  });

  it('shows "Page 2 of 3" when the total is exact', () => {
    render(<GenerationsPaneControls {...buildProps({ pagination: { totalCount: 19, totalIsExact: true, perPage: 6, page: 2, onPageChange: vi.fn() } })} />);
    expect(screen.getByText('Page 2 of 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 2 of 4' })).toBeInTheDocument();
  });

  it('shows "Page 2" with no total when the total is an estimate', () => {
    render(<GenerationsPaneControls {...buildProps({ pagination: { totalCount: 19, totalIsExact: false, perPage: 6, page: 2, onPageChange: vi.fn() } })} />);
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 2' })).toBeInTheDocument();
    expect(screen.queryByText(/ of /)).not.toBeInTheDocument();
  });

  it('shows the same exact total on pages 1, 2 and 3', () => {
    const labels = [1, 2, 3].map((page) => {
      const { unmount } = render(
        <GenerationsPaneControls
          {...buildProps({ pagination: { totalCount: 15, totalIsExact: true, perPage: 6, page, onPageChange: vi.fn() } })}
        />,
      );
      const label = screen.getByRole('button', { name: /^Page \d+ of/ }).getAttribute('aria-label');
      unmount();
      return label;
    });
    expect(labels).toEqual(['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3']);
  });

  it('renders nothing in the pager on a single page', () => {
    render(
      <GenerationsPaneControls
        {...buildProps({ pagination: { totalCount: 5, totalIsExact: true, perPage: 18, page: 1, onPageChange: vi.fn() } })}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Previous page' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Page 1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/item/)).not.toBeInTheDocument();
  });

  it('renders nothing in the pager when there are no items', () => {
    render(
      <GenerationsPaneControls
        {...buildProps({ pagination: { totalCount: 0, totalIsExact: true, perPage: 18, page: 1, onPageChange: vi.fn() } })}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Previous page' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
    expect(screen.queryByText(/No items/)).not.toBeInTheDocument();
  });

  it('keeps next enabled on an estimated total when a page follows', () => {
    render(<GenerationsPaneControls {...buildProps({ pagination: { totalCount: 19, totalIsExact: false, perPage: 6, page: 2, onPageChange: vi.fn() } })} />);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
  });

  it('disables previous on page 1 and next on the last exact page', () => {
    const { unmount } = render(<GenerationsPaneControls {...buildProps({ pagination: { totalCount: 19, totalIsExact: true, perPage: 6, page: 1, onPageChange: vi.fn() } })} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
    unmount();
    render(<GenerationsPaneControls {...buildProps({ pagination: { totalCount: 19, totalIsExact: true, perPage: 6, page: 4, onPageChange: vi.fn() } })} />);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('opens the page menu and jumps to the chosen page', () => {
    const onPageChange = vi.fn();
    render(
      <GenerationsPaneControls
        {...buildProps({
          pagination: { totalCount: 19, totalIsExact: true, perPage: 18, page: 2, onPageChange },
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Page 2 of 2' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Page 1' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('reports the star as pressed when starred only is on', () => {
    render(
      <GenerationsPaneControls
        {...buildProps({ filters: { ...buildProps().filters, starredOnly: true } })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Starred only' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('gives the starred-on button the orange-300 class', () => {
    render(
      <GenerationsPaneControls
        {...buildProps({ filters: { ...buildProps().filters, starredOnly: true } })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Starred only' })).toHaveClass('text-orange-300');
  });

  it('toggles search and starred filters via callbacks', () => {
    const onSearchOpenChange = vi.fn();
    const onStarredOnlyChange = vi.fn();
    render(
      <GenerationsPaneControls
        {...buildProps({
          filters: { ...buildProps().filters, onSearchOpenChange, onStarredOnlyChange },
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Search prompts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Starred only' }));

    expect(onSearchOpenChange).toHaveBeenCalledWith(true);
    expect(onStarredOnlyChange).toHaveBeenCalledWith(true);
  });
});
