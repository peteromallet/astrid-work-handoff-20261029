import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { VariantBadge } from '@/shared/components/VariantBadge';
import { cn } from '@/shared/components/ui/contracts/cn';
import { Loader2, X } from 'lucide-react';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';

interface PanelHeaderMetaProps {
  taskId?: string | null;
  idCopied: boolean;
  onCopyId: () => void;
  hasVariants: boolean;
  variants: GenerationVariant[];
  pendingTaskCount: number;
  unviewedVariantCount: number;
  onMarkAllViewed: () => void;
  variantsSectionRef: React.RefObject<HTMLDivElement> | null;
}

export const PanelHeaderMeta: React.FC<PanelHeaderMetaProps> = ({
  taskId,
  idCopied,
  onCopyId,
  hasVariants,
  variants,
  pendingTaskCount,
  unviewedVariantCount,
  onMarkAllViewed,
  variantsSectionRef,
}) => (
  <div className="flex items-center gap-2">
    {taskId && (
      <button
        onClick={onCopyId}
        className={cn(
          'px-2 py-1 text-xs rounded transition-colors touch-manipulation',
          idCopied
            ? 'text-green-400 bg-green-400/10'
            : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700',
        )}
      >
        {idCopied ? 'copied' : 'id'}
      </button>
    )}
    {hasVariants && (
      <button
        onClick={() => variantsSectionRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors touch-manipulation"
      >
        <span>{variants.length} variants</span>
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>
    )}
    {pendingTaskCount > 0 ? (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs rounded bg-primary/10 text-primary">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>{pendingTaskCount} pending</span>
      </div>
    ) : variants.length > 1 && unviewedVariantCount > 0 ? (
      <VariantBadge
        variant="inline"
        derivedCount={variants.length}
        unviewedVariantCount={unviewedVariantCount}
        hasUnviewedVariants={true}
        tooltipSide="bottom"
        onMarkAllViewed={onMarkAllViewed}
        onClick={() => variantsSectionRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />
    ) : null}
  </div>
);

interface PanelCloseButtonProps {
  isMobile: boolean;
  onClose: () => void;
  stopPropagation?: boolean;
  className?: string;
}

export const PanelCloseButton: React.FC<PanelCloseButtonProps> = ({
  isMobile,
  onClose,
  stopPropagation = false,
  className,
}) => (
  <Button
    aria-label="Close viewer"
    variant="ghost"
    size="sm"
    onClick={(event) => {
      if (stopPropagation) {
        event.stopPropagation();
      }
      onClose();
    }}
    className={cn('p-0 hover:bg-muted', isMobile ? 'h-7 w-7' : 'h-8 w-8', className)}
  >
    <X className={cn(isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
  </Button>
);
