/**
 * VariantSelector Component
 *
 * Displays a grid of clickable variant thumbnails to switch between variants.
 * Shows which variant is primary and which is currently active.
 * Shows variant relationships (what it's based on / what's based on it).
 * Allows filtering by relationship and making the current variant primary.
 */

import React, { useState, useMemo } from 'react';
import { ArrowDown, ArrowUp, X, Star } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/shared/components/ui/tooltip';
import { useIsMobile } from '@/shared/hooks/mobile';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';
import type { RelationshipFilter } from './variantPresentation';
import { VariantGrid } from './components/VariantGrid';
import { MobileInfoModal } from './components/MobileInfoModal';
import { useVariantActions } from './hooks/useVariantActions';

/**
 * Props for VariantSelector component
 */
interface VariantSelectorProps {
  /** List of variants */
  variants: GenerationVariant[];
  /** Currently active variant ID */
  activeVariantId: string | null;
  /** Handler for variant selection */
  onVariantSelect: (variantId: string) => void;
  /** Handler to make a variant primary */
  onMakePrimary?: (variantId: string) => Promise<void>;
  /** Whether component is loading */
  isLoading?: boolean;
  /** Handler to load a variant's settings into the regenerate form */
  onLoadVariantSettings?: (variantParams: Record<string, unknown>) => void;
  /** Handler to delete a variant (not available for primary variant) */
  onDeleteVariant?: (variantId: string) => Promise<void>;
  /** Read-only mode - hides action buttons (Make Primary, Delete) */
  readOnly?: boolean;
}

export const VariantSelector: React.FC<VariantSelectorProps> = ({
  variants,
  activeVariantId,
  onVariantSelect,
  onMakePrimary,
  isLoading = false,
  onLoadVariantSettings,
  onDeleteVariant,
  readOnly = false,
}) => {
  const [relationshipFilter, setRelationshipFilter] = useState<RelationshipFilter>('all');
  const [currentPage, setCurrentPage] = useState(0);
  // Reset page when filter changes (prev-value ref avoids useEffect+setState)
  const prevRelFilterRef = React.useRef(relationshipFilter);
  if (prevRelFilterRef.current !== relationshipFilter) {
    prevRelFilterRef.current = relationshipFilter;
    if (currentPage !== 0) setCurrentPage(0);
  }
  const isMobile = useIsMobile();

  const actions = useVariantActions({
    isMobile,
    onDeleteVariant,
    onLoadVariantSettings,
  });

  const starredCount = useMemo(() => variants.filter(v => v.starred).length, [variants]);

  // Calculate variant relationships
  const { parentVariants, childVariants, relationshipMap } = useMemo(() => {

    const parents = new Set<string>();
    const children = new Set<string>();
    const relMap: Record<string, { isParent: boolean; isChild: boolean }> = {};

    variants.forEach(variant => {
      relMap[variant.id] = { isParent: false, isChild: false };
    });

    const activeVar = variants.find(variant => variant.id === activeVariantId);
    if (!activeVar) {
      return { parentVariants: parents, childVariants: children, relationshipMap: relMap };
    }

    const activeSourceVariantId = activeVar.params?.source_variant_id as string | undefined;

    if (activeSourceVariantId) {
      const parentVariant = variants.find(variant => variant.id === activeSourceVariantId);
      if (parentVariant) {
        parents.add(parentVariant.id);
        relMap[parentVariant.id].isParent = true;
      }
    }

    variants.forEach(variant => {
      const sourceId = variant.params?.source_variant_id as string | undefined;
      if (sourceId === activeVariantId) {
        children.add(variant.id);
        relMap[variant.id].isChild = true;
      }
    });

    return { parentVariants: parents, childVariants: children, relationshipMap: relMap };
  }, [variants, activeVariantId]);

  // Sort variants with primary first
  const sortedVariants = useMemo(() => {
    return [...variants].sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return 0;
    });
  }, [variants]);

  // Filter variants based on relationship filter
  const filteredVariants = useMemo(() => {
    if (relationshipFilter === 'all') return sortedVariants;
    if (relationshipFilter === 'parents') {
      return sortedVariants.filter(variant => parentVariants.has(variant.id) || variant.id === activeVariantId);
    }
    if (relationshipFilter === 'children') {
      return sortedVariants.filter(variant => childVariants.has(variant.id) || variant.id === activeVariantId);
    }
    if (relationshipFilter === 'starred') {
      return sortedVariants.filter(variant => variant.starred || variant.id === activeVariantId);
    }
    return sortedVariants;
  }, [sortedVariants, relationshipFilter, parentVariants, childVariants, activeVariantId]);

  const hasRelationships = parentVariants.size > 0 || childVariants.size > 0;
  const showFilterRow = hasRelationships || starredCount > 0;

  // Don't show if no variants at all
  if (!isLoading && variants.length === 0) {
    return null;
  }

  // Find the selected variant for the mobile info modal
  const mobileInfoVariant = actions.mobileInfoVariantId
    ? variants.find(variant => variant.id === actions.mobileInfoVariantId)
    : null;

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2 p-2 bg-background/80 backdrop-blur-sm rounded-lg">
        <Skeleton className="w-16 h-10 rounded" />
      </div>
    );
  }

  return (
    <>
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-2 p-2 bg-background/90 backdrop-blur-sm rounded-lg border border-border/50 shadow-lg overflow-hidden">
        {/* Header section - single row with label, filters, and actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground shrink-0">Variants ({variants.length})</span>

          {/* Filter buttons (relationships + starred) - inline after label */}
          {showFilterRow && (
            <div className="flex items-center gap-1">
              {hasRelationships && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setRelationshipFilter(relationshipFilter === 'parents' ? 'all' : 'parents')}
                        className={cn(
                          'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors',
                          relationshipFilter === 'parents'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                          parentVariants.size === 0 && 'opacity-50 cursor-not-allowed'
                        )}
                        disabled={parentVariants.size === 0}
                      >
                        <ArrowUp className="w-2.5 h-2.5" />
                        <span>Based on ({parentVariants.size})</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>Show variants this is based on</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setRelationshipFilter(relationshipFilter === 'children' ? 'all' : 'children')}
                        className={cn(
                          'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors',
                          relationshipFilter === 'children'
                            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                          childVariants.size === 0 && 'opacity-50 cursor-not-allowed'
                        )}
                        disabled={childVariants.size === 0}
                      >
                        <ArrowDown className="w-2.5 h-2.5" />
                        <span>Based on this ({childVariants.size})</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>Show variants based on this one</p>
                    </TooltipContent>
                  </Tooltip>
                </>
              )}

              {starredCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setRelationshipFilter(relationshipFilter === 'starred' ? 'all' : 'starred')}
                      className={cn(
                        'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors',
                        relationshipFilter === 'starred'
                          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <Star className={cn('w-2.5 h-2.5', relationshipFilter === 'starred' && 'fill-current')} />
                      <span>Starred ({starredCount})</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>Show starred variants</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {relationshipFilter !== 'all' && (
                <button
                  onClick={() => setRelationshipFilter('all')}
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Action buttons - pushed to the right */}
          {!readOnly && onMakePrimary && activeVariantId && !variants.find(v => v.id === activeVariantId)?.is_primary && (
            <div className="flex items-center gap-1 ml-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onMakePrimary(activeVariantId)}
                    className="h-auto min-h-6 text-xs px-2 py-1 gap-1 bg-orange-500/90 hover:bg-orange-600 text-white border-none"
                  >
                    <Star className="w-3 h-3 shrink-0" />
                    Make main
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Set this variant as the main variant</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Grid with pagination */}
        <VariantGrid
          filteredVariants={filteredVariants}
          activeVariantId={activeVariantId}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          isMobile={isMobile}
          readOnly={readOnly}
          relationshipMap={relationshipMap}
          copiedVariantId={actions.copiedVariantId}
          loadedSettingsVariantId={actions.loadedSettingsVariantId}
          onVariantSelect={onVariantSelect}
          onMakePrimary={onMakePrimary}
          onDeleteVariant={onDeleteVariant ? actions.handleDeleteVariant : undefined}
          onLoadVariantSettings={onLoadVariantSettings}
          onMouseEnter={actions.handleVariantMouseEnter}
          onShowMobileInfo={actions.setMobileInfoVariantId}
          onCopyId={actions.handleCopyId}
          onLoadSettings={actions.handleLoadSettings}
          isDeleteLoading={actions.isDeleteLoading}
        />
      </div>
    </TooltipProvider>

    {/* Mobile variant info modal */}
    {isMobile && mobileInfoVariant && (
      <MobileInfoModal
        variant={mobileInfoVariant}
        activeVariantId={activeVariantId}
        readOnly={readOnly}
        onClose={() => actions.setMobileInfoVariantId(null)}
        onMakePrimary={onMakePrimary}
        onLoadVariantSettings={onLoadVariantSettings}
      />
    )}
    </>
  );
};
