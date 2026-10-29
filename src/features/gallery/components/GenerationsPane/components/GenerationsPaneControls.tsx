import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { Button } from '@/shared/components/ui/button';
import { ShotFilter } from '@/shared/components/selectors/ShotFilter';
import { MediaTypeFilter } from '@/shared/components/selectors/MediaTypeFilter';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { ChevronDown, ChevronLeft, ChevronRight, Search, Star, X } from 'lucide-react';

type ShotFilterProps = React.ComponentProps<typeof ShotFilter>;
type MediaTypeFilterProps = React.ComponentProps<typeof MediaTypeFilter>;
type MediaTypeValue = MediaTypeFilterProps['value'];

const MEDIA_TYPE_OPTIONS: ReadonlyArray<{ value: MediaTypeValue; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
];

interface GenerationsPaneFiltersModel {
  shots: ShotFilterProps['shots'];
  selectedShotFilter: ShotFilterProps['selectedShotId'];
  onSelectedShotFilterChange: NonNullable<ShotFilterProps['onShotChange']>;
  excludePositioned: ShotFilterProps['excludePositioned'];
  onExcludePositionedChange: NonNullable<ShotFilterProps['onExcludePositionedChange']>;
  isMobile: boolean;
  shotFilterContentRef: React.MutableRefObject<HTMLDivElement>;
  mediaTypeFilterContentRef: React.RefObject<HTMLDivElement>;
  shotFilterOpen: boolean;
  onShotFilterOpenChange: (open: boolean) => void;
  mediaTypeFilter: MediaTypeValue;
  onMediaTypeFilterChange: NonNullable<MediaTypeFilterProps['onChange']>;
  mediaTypeFilterOpen: boolean;
  onMediaTypeFilterOpenChange: (open: boolean) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  isSearchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  searchInputRef: React.MutableRefObject<HTMLInputElement>;
  starredOnly: boolean;
  onStarredOnlyChange: (value: boolean) => void;
  currentShotId: string | null;
  isSpecialFilterSelected: boolean;
}

interface GenerationsPanePaginationModel {
  /** Exact total when totalIsExact is true; otherwise a look-ahead estimate that must never be shown as a total. */
  totalCount: number;
  totalIsExact: boolean;
  perPage: number;
  page: number;
  onPageChange: (nextPage: number) => void;
}

interface GenerationsPaneInteractionModel {
  isInteractionDisabled: boolean;
}

interface GenerationsPaneControlsProps {
  filters: GenerationsPaneFiltersModel;
  pagination: GenerationsPanePaginationModel;
  interaction: GenerationsPaneInteractionModel;
}

const GHOST_TEXT_BUTTON =
  'h-7 min-w-0 max-w-full px-2 rounded-md text-[12px] font-normal text-zinc-300 hover:bg-white/5 hover:text-zinc-100 whitespace-nowrap';
const ICON_BUTTON = 'h-7 w-7 p-0 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/5 disabled:opacity-40';
const MENU_CONTENT = 'min-w-[7rem] max-h-64 overflow-y-auto bg-zinc-900 border-zinc-700 text-zinc-200';
const MENU_ITEM = 'text-xs text-zinc-300 focus:bg-white/10 focus:text-zinc-50';

export function GenerationsPaneControls({
  filters,
  pagination,
  interaction,
}: GenerationsPaneControlsProps): React.ReactElement {
  const { page, perPage, totalCount, totalIsExact } = pagination;
  const totalPages = Math.ceil(totalCount / perPage);
  const currentShotId = filters.currentShotId;
  const hasScope = filters.shots.length > 0 || Boolean(currentShotId);
  const disabledDimming = interaction.isInteractionDisabled && 'pointer-events-none opacity-70';
  const mediaTypeLabel = MEDIA_TYPE_OPTIONS.find((o) => o.value === filters.mediaTypeFilter)?.label ?? 'All';

  const pageLabel = totalIsExact ? `Page ${page} of ${totalPages}` : `Page ${page}`;
  const narrowPageLabel = totalIsExact ? `${page} / ${totalPages}` : `${page}`;

  const typeMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(GHOST_TEXT_BUTTON, 'gap-1 inline-flex items-center')}
        aria-label="Media type"
      >
        {mediaTypeLabel}
        <ChevronDown className="h-3 w-3 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={MENU_CONTENT}>
        <DropdownMenuRadioGroup
          value={filters.mediaTypeFilter}
          onValueChange={(value) => filters.onMediaTypeFilterChange(value as MediaTypeValue)}
        >
          {MEDIA_TYPE_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className={MENU_ITEM}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="@container flex items-center justify-between gap-3 px-3 py-2">
      <div
        className={cn(
          'flex min-w-0 items-center gap-1.5 overflow-hidden max-w-[calc(50%-3.5rem)] transition-all duration-200',
          disabledDimming,
        )}
      >
        <div className="hidden @[620px]:block shrink-0">
          <SegmentedControl
            variant="pane"
            size="default"
            className="h-7"
            value={filters.mediaTypeFilter}
            onValueChange={(value) => filters.onMediaTypeFilterChange(value as MediaTypeValue)}
            aria-label="Media type"
          >
            {MEDIA_TYPE_OPTIONS.map((option) => (
              <SegmentedControlItem key={option.value} value={option.value}>
                {option.label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
        <div className="@[620px]:hidden shrink-0">{typeMenu}</div>

        {hasScope && (
          <ShotFilter
            className="flex items-center min-w-0"
            shots={filters.shots}
            currentShotId={currentShotId}
            selectedShotId={filters.selectedShotFilter}
            onShotChange={filters.onSelectedShotFilterChange}
            excludePositioned={filters.excludePositioned}
            onExcludePositionedChange={filters.onExcludePositionedChange}
            darkSurface
            ghostTrigger
            checkboxId="exclude-positioned-generations-pane"
            triggerWidth="w-auto min-w-0"
            isMobile={filters.isMobile}
            contentRef={filters.shotFilterContentRef}
            showPositionFilter
            positionFilterInMenu
            open={filters.shotFilterOpen}
            onOpenChange={(open) => {
              if (interaction.isInteractionDisabled && open) {
                filters.onShotFilterOpenChange(false);
                return;
              }
              filters.onShotFilterOpenChange(open);
            }}
          />
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Starred only"
              aria-pressed={filters.starredOnly}
              onClick={() => filters.onStarredOnlyChange(!filters.starredOnly)}
              className={cn(
                'h-7 w-7 p-0 rounded-md',
                filters.starredOnly
                  ? 'text-orange-300 bg-white/[0.06] hover:bg-white/10'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
              )}
            >
              <Star className="h-[15px] w-[15px]" fill={filters.starredOnly ? 'currentColor' : 'none'} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Starred only</TooltipContent>
        </Tooltip>

        {!filters.isSearchOpen ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              filters.onSearchOpenChange(true);
              setTimeout(() => filters.searchInputRef.current?.focus(), 0);
            }}
            className={cn(ICON_BUTTON, 'disabled:opacity-100 hover:bg-white/5')}
            aria-label="Search prompts"
          >
            <Search className="h-[15px] w-[15px]" />
          </Button>
        ) : (
          <div className="flex h-7 w-44 min-w-0 items-center gap-1 rounded-md bg-white/[0.04] px-2 ring-1 ring-inset ring-white/10">
            <Search className="h-[13px] w-[13px] shrink-0 text-zinc-400" />
            <input
              ref={(node) => {
                if (node) filters.searchInputRef.current = node;
              }}
              type="text"
              placeholder="Search prompts"
              value={filters.searchTerm}
              onChange={(e) => filters.onSearchTermChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                e.preventDefault();
                e.stopPropagation();
                if (filters.searchTerm) {
                  filters.onSearchTermChange('');
                } else {
                  filters.onSearchOpenChange(false);
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-[12px] text-zinc-100 placeholder-zinc-500 outline-none"
            />
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                if (filters.searchTerm) {
                  filters.onSearchTermChange('');
                  filters.searchInputRef.current?.focus();
                } else {
                  filters.onSearchOpenChange(false);
                }
              }}
              className="shrink-0 rounded p-0.5 text-zinc-400 hover:text-zinc-200"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      <div
        className={cn(
          'flex min-w-0 shrink-0 items-center justify-end gap-1 max-w-[calc(50%-3.5rem)] transition-all duration-200',
          disabledDimming,
        )}
      >
        {totalCount > 0 && totalPages > 1 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => pagination.onPageChange(Math.max(1, page - 1))}
              className={ICON_BUTTON}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(GHOST_TEXT_BUTTON, 'tabular-nums')}
                title={pageLabel}
                aria-label={pageLabel}
              >
                <span className="hidden @[420px]:inline">{pageLabel}</span>
                <span className="@[420px]:hidden">{narrowPageLabel}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={MENU_CONTENT}>
                <DropdownMenuRadioGroup
                  value={String(page)}
                  onValueChange={(value) => pagination.onPageChange(Number(value))}
                >
                  {Array.from({ length: totalPages }, (_, i) => (
                    <DropdownMenuRadioItem key={i + 1} value={String(i + 1)} className={MENU_ITEM}>
                      Page {i + 1}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="sm"
              aria-label="Next page"
              disabled={page >= totalPages}
              onClick={() => pagination.onPageChange(page + 1)}
              className={ICON_BUTTON}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
