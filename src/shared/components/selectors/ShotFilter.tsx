import React, { RefObject } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Label } from '@/shared/components/ui/primitives/label';
import { Shot } from '@/domains/generation/types';
import { SHOT_FILTER, isSpecialFilter } from '@/shared/constants/filterConstants';
import { cn } from '@/shared/components/ui/contracts/cn';

interface ShotFilterProps {
  shots: Shot[];
  selectedShotId: string;
  onShotChange: (shotId: string) => void;
  excludePositioned: boolean;
  onExcludePositionedChange: (exclude: boolean) => void;
  showPositionFilter?: boolean;
  /** Render the position checkbox as the last item of the menu instead of below the trigger. */
  positionFilterInMenu?: boolean;
  /** The shot the page is showing; adds a "This shot" item and labels it as such. */
  currentShotId?: string | null;
  className?: string;
  triggerClassName?: string;
  triggerWidth?: string;
  labelText?: string;
  positionFilterLabel?: string;
  checkboxId?: string;
  /** Use when component is on a permanently dark surface (e.g., GenerationsPane) */
  darkSurface?: boolean;
  /** Borderless ghost trigger in the sans font (for dense toolbars on dark surfaces). */
  ghostTrigger?: boolean;
  isMobile?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  contentRef?: RefObject<HTMLDivElement>;
}

const GHOST_TRIGGER_CLASS =
  '!h-7 !min-h-0 !border-transparent !bg-transparent !px-2 !text-[12px] !font-normal !text-zinc-300 hover:!bg-white/5 hover:!text-zinc-100 !shadow-none !translate-x-0 !translate-y-0 max-w-[10rem]';

const ShotFilterComponent: React.FC<ShotFilterProps> = ({
  shots,
  selectedShotId,
  onShotChange,
  excludePositioned = true,
  onExcludePositionedChange,
  showPositionFilter = true,
  positionFilterInMenu = false,
  currentShotId = null,
  className = "flex items-center gap-x-3",
  triggerClassName,
  triggerWidth = "w-[180px]",
  labelText,
  positionFilterLabel = "Exclude items with a position",
  checkboxId = "exclude-positioned",
  darkSurface,
  ghostTrigger = false,
  isMobile = false,
  open,
  onOpenChange,
  contentRef,
}) => {
  // Variant selection: zinc for dark surfaces, retro for normal (handles app dark mode automatically)
  const variant = darkSurface ? 'zinc' : 'retro';

  // The current shot gets its own "This shot" item, so it is not repeated in the list.
  const listedShots = currentShotId ? shots?.filter((shot) => shot.id !== currentShotId) ?? [] : shots ?? [];

  // Base UI looks up value labels from this map; without it the trigger shows the raw value.
  const itemLabels: Record<string, string> = {
    [SHOT_FILTER.ALL]: 'All shots',
    [SHOT_FILTER.NO_SHOT]: 'Not in a shot',
    ...(currentShotId ? { [currentShotId]: 'This shot' } : {}),
    ...Object.fromEntries(shots?.map((shot) => [shot.id, shot.name]) ?? []),
  };

  const showMenuCheckbox = positionFilterInMenu && showPositionFilter && !isSpecialFilter(selectedShotId) && !!onExcludePositionedChange;

  const containerClassName = isMobile
    ? "flex flex-col gap-y-2"
    : className;

  return (
    <div className={containerClassName}>
      <div className={isMobile ? "flex items-center gap-x-3" : "contents"}>
        {labelText && (
          <Label className={cn("text-xs font-light", darkSurface ? "text-white" : "text-foreground")}>
            {labelText}
          </Label>
        )}

        <Select
          value={selectedShotId}
          items={itemLabels}
          onValueChange={(value) => {
            if (value) {
              onShotChange(value);
            }
          }}
          open={open}
          onOpenChange={onOpenChange}
        >
          <SelectTrigger
            variant={ghostTrigger ? 'default' : darkSurface ? "retro-dark" : "retro"}
            colorScheme={darkSurface && !ghostTrigger ? "zinc" : "default"}
            size="sm"
            className={ghostTrigger ? cn(triggerWidth, GHOST_TRIGGER_CLASS, triggerClassName) : triggerClassName || cn(triggerWidth, "h-6 text-xs")}
          >
            <SelectValue>
              {(value: string | null) => (value ? itemLabels[value] ?? value : 'Filter by shot...')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            variant={variant}
            className="w-max max-h-60 overflow-y-auto text-xs"
            ref={contentRef}
          >
            {/* System filters - muted via opacity */}
            <SelectItem variant={variant} value={SHOT_FILTER.ALL} className="text-xs whitespace-nowrap opacity-70">
              All shots
            </SelectItem>
            {currentShotId && (
              <SelectItem variant={variant} value={currentShotId} className="text-xs whitespace-nowrap">
                This shot
              </SelectItem>
            )}
            <SelectItem variant={variant} value={SHOT_FILTER.NO_SHOT} className="text-xs whitespace-nowrap opacity-70">
              Not in a shot
            </SelectItem>
            {/* Separator */}
            {listedShots.length > 0 && (
              <div className="h-px bg-current opacity-20 my-1.5 mx-2" />
            )}
            {/* User shots */}
            {listedShots.map(shot => (
              <SelectItem variant={variant} key={shot.id} value={shot.id} className="text-xs whitespace-nowrap">
                {shot.name}
              </SelectItem>
            ))}
            {showMenuCheckbox && (
              <>
                <div className="h-px bg-current opacity-20 my-1.5 mx-2" />
                <div className="flex items-center gap-x-2 px-2 py-1.5 text-xs">
                  <Checkbox
                    id={checkboxId}
                    checked={excludePositioned}
                    onCheckedChange={(checked) => onExcludePositionedChange(!!checked)}
                    className={darkSurface ? "border-zinc-600 data-[checked]:bg-zinc-600" : undefined}
                  />
                  <Label
                    htmlFor={checkboxId}
                    className={cn("text-xs cursor-pointer whitespace-nowrap", darkSurface ? "text-zinc-300" : "text-foreground")}
                  >
                    {positionFilterLabel}
                  </Label>
                </div>
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Position filter checkbox - only show when a specific shot is selected */}
      {showPositionFilter && !positionFilterInMenu && !isSpecialFilter(selectedShotId) && onExcludePositionedChange && (
        <div className="flex items-center gap-x-2 mt-2">
          <Checkbox
            id={checkboxId}
            checked={excludePositioned}
            onCheckedChange={(checked) => onExcludePositionedChange(!!checked)}
            className={darkSurface ? "border-zinc-600 data-[checked]:bg-zinc-600" : undefined}
          />
          <Label
            htmlFor={checkboxId}
            className={cn("text-xs cursor-pointer", darkSurface ? "text-zinc-300" : "text-foreground")}
          >
            {positionFilterLabel}
          </Label>
        </div>
      )}
    </div>
  );
};

export const ShotFilter = React.memo(ShotFilterComponent);
