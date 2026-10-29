import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { Check, ArrowRight, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/shared/components/ui/command";
import { useIsMobile } from "@/shared/hooks/mobile";
import { cn } from '@/shared/components/ui/contracts/cn';
import type { ShotOption } from "@/domains/generation/types";

export type { ShotOption };

interface ShotSelectorProps {
  // Core selection props
  value: string;
  onValueChange: (value: string) => void;
  shots: ShotOption[];
  placeholder?: string;
  
  // Styling props
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  /** Select variant - defaults to retro-dark for dark contexts */
  variant?: "default" | "retro" | "retro-dark";
  
  // Additional props for SelectContent
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  
  // Controlled open state
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  container?: HTMLElement | null;
  
  // Navigation
  onNavigateToShot?: (shot: ShotOption) => void;
}

export const ShotSelector: React.FC<ShotSelectorProps> = ({
  value,
  onValueChange,
  shots,
  placeholder = "Select shot",
  className,
  triggerClassName,
  contentClassName,
  variant = "retro-dark",
  side = "top",
  align = "start",
  sideOffset = 4,
  open,
  onOpenChange,
  container,
  onNavigateToShot,
}) => {
  const isMobile = useIsMobile();
  
  // Internal state for uncontrolled mode
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Search query state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Ref for auto-focusing the search input
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Use controlled state if provided, otherwise use internal state
  const isOpen = open !== undefined ? open : internalOpen;
  const setShotSelectorOpen = useCallback((newOpen: boolean) => {
    if (open === undefined) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
    // Reset search when closing
    if (!newOpen) {
      setSearchQuery('');
    }
  }, [open, onOpenChange]);
  
  // Prevent cmdk's scrollIntoView from scrolling the window on mount.
  // cmdk calls scrollIntoView in a useLayoutEffect before floating-ui positions
  // the portal, so the items are at 0,0 and the window scrolls to the top.
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      const frame = requestAnimationFrame(() => {
        if (window.scrollY !== scrollY) {
          window.scrollTo({ top: scrollY, behavior: 'instant' });
        }
        // Focus search input after scroll is restored
        searchInputRef.current?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [isOpen]);

  // Get the selected shot
  const selectedShot = useMemo(() => {
    if (!value) return null;
    return shots.find(s => s.id === value) || null;
  }, [value, shots]);

  // Get the display name for the selected shot
  const selectedShotName = selectedShot?.name || null;
  
  // Variant-specific styles (memoized to avoid recalculating on every render)
  const styles = useMemo(() => {
    switch (variant) {
      case "retro":
        return {
          trigger: cn(
            "bg-background hover:bg-[#6a8a8a]/10 rounded-sm border-2 border-[#6a8a8a]/30 hover:border-[#6a8a8a]/45",
            "dark:border-[#6a7a7a] dark:hover:bg-transparent text-[#5a7a7a] dark:text-[#c8c4bb]",
            "font-heading font-light tracking-wide transition-all duration-200"
          ),
          content: "rounded-sm border-2 border-[#6a8a8a] dark:border-[#6a7a7a] bg-background",
          command: "retro" as const,
        };
      case "retro-dark":
        return {
          trigger: cn(
            "bg-zinc-800/90 hover:bg-zinc-700/90 rounded-sm border border-zinc-600",
            "text-zinc-200 font-heading font-light tracking-wide transition-all duration-200"
          ),
          content: "rounded-sm border border-zinc-600 bg-zinc-800",
          command: "retro" as const,
        };
      default:
        return {
          trigger: "border border-input bg-background",
          content: "rounded-md border bg-popover",
          command: "default" as const,
        };
    }
  }, [variant]);

  return (
    <div
      className={`flex items-center gap-1 ${className || ''}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Popover open={isOpen} onOpenChange={setShotSelectorOpen}>
        <PopoverTrigger asChild>
          <button
            role="combobox"
            aria-expanded={isOpen}
            className={cn(
              "flex items-center justify-between px-2 py-1 text-xs",
              "focus:outline-none focus:ring-1 focus:ring-zinc-500",
              "disabled:cursor-not-allowed disabled:opacity-50",
              styles.trigger,
              triggerClassName
            )}
          >
            <span className="truncate">
              {selectedShotName
                ? (selectedShotName.length > 10 ? `${selectedShotName.substring(0, 10)}…` : selectedShotName)
                : (value ? "Loading..." : placeholder)}
            </span>
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className={cn(
            "p-0",
            styles.content,
            contentClassName
          )}
          style={{
            width: 'var(--anchor-width)',
            minWidth: '160px',
            maxWidth: isMobile ? 'calc(100vw - 24px)' : undefined
          }}
          side={side}
          sideOffset={sideOffset}
          align={align}
          collisionPadding={12}
          container={container}
          initialFocus={false}
          // Stop events from bubbling to parent (prevents lightbox closes, etc.)
          // Use bubble phase so events reach child buttons first
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <Command variant={styles.command} className="rounded-none">
            <CommandInput 
              ref={searchInputRef}
              placeholder="Search shots..." 
              className="h-8 text-xs border-none"
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList className="max-h-48">
              <CommandEmpty>
                <div className="text-center py-2">
                  <p className="text-xs text-muted-foreground">No shots found.</p>
                </div>
              </CommandEmpty>
              <CommandGroup>
                {shots.map(shot => (
                  <CommandItem
                    key={shot.id}
                    value={shot.name}
                    variant={styles.command}
                    className="text-xs group/shot relative"
                    onSelect={() => {
                      onValueChange(shot.id);
                      setShotSelectorOpen(false);
                    }}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={cn(
                        "truncate",
                        value === shot.id && "font-medium"
                      )}>
                        {shot.name}
                      </span>
                      {value === shot.id && (
                        <Check className="h-3 w-3 shrink-0 ml-1" />
                      )}
                    </div>
                    {/* Jump arrow - appears on hover, hidden on mobile */}
                    {onNavigateToShot && !isMobile && (
                      <button
                        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/shot:opacity-100 transition-opacity p-1 rounded bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-600/50"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShotSelectorOpen(false);
                          onNavigateToShot(shot);
                        }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        title={`Jump to ${shot.name}`}
                      >
                        <ArrowRight className="h-3 w-3 text-white" />
                      </button>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
