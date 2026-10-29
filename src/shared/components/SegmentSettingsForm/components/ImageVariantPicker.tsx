import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { cn } from '@/shared/components/ui/contracts/cn';
import { useVariants } from '@/shared/hooks/variants/useVariants';
import { mediaCrossOrigin } from '@/shared/lib/media/mediaCrossOrigin';

const PAGE_SIZE = 9;

interface ImageVariantPickerProps {
  generationId: string;
  currentImageUrl: string;
  onImageUrlChange: (url: string) => void;
}

export const ImageVariantPicker: React.FC<ImageVariantPickerProps> = ({
  generationId,
  currentImageUrl,
  onImageUrlChange,
}) => {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const { variants, setPrimaryVariant } = useVariants({ generationId });

  const currentVariantId = useMemo(() => {
    return variants.find((variant) => {
      const variantUrl = variant.thumbnail_url || variant.location;
      return variantUrl === currentImageUrl;
    })?.id ?? null;
  }, [currentImageUrl, variants]);

  if (variants.length <= 1) {
    return null;
  }

  const totalPages = Math.ceil(variants.length / PAGE_SIZE);
  const pagedVariants = variants.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleVariantClick = async (variantId: string, variantUrl: string) => {
    onImageUrlChange(variantUrl);
    await setPrimaryVariant(variantId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setPage(0); }}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          className="absolute top-1 right-1 z-10 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/85"
          onClick={(e) => {
            e.stopPropagation();
          }}
          aria-label={`Choose image variant (${variants.length} variants)`}
        >
          <Layers className="h-3 w-3" />
          <span>{variants.length}</span>
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        className="w-72 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-3 gap-2">
          {pagedVariants.map((variant) => {
            const variantUrl = variant.thumbnail_url || variant.location;
            if (!variantUrl) {
              return null;
            }

            const isPrimary = variant.is_primary;
            const isCurrent = currentVariantId === variant.id;

            return (
              <button
                key={variant.id}
                type="button"
                className={cn(
                  'relative aspect-video overflow-hidden rounded-md bg-muted transition-opacity hover:opacity-100',
                  isPrimary && 'ring-2 ring-green-500',
                  !isPrimary && isCurrent && 'ring-1 ring-border',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleVariantClick(variant.id, variantUrl);
                }}
                title={isPrimary ? 'Primary variant' : 'Set as primary'}
              >
                <img
                  src={variantUrl}
                  crossOrigin={mediaCrossOrigin(variantUrl)}
                  alt={variant.name ?? 'Variant thumbnail'}
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <button
              type="button"
              disabled={page === 0}
              onClick={(e) => { e.stopPropagation(); setPage((p) => p - 1); }}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft className="h-3 w-3" />
              Prev
            </button>
            <span>{page + 1} / {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={(e) => { e.stopPropagation(); setPage((p) => p + 1); }}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 hover:bg-muted disabled:opacity-30"
            >
              Next
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
