import React from 'react';
import { VariantBadge } from '@/shared/components/VariantBadge';
import { cn } from '@/shared/components/ui/contracts/cn';
import { InfoTooltip } from './InfoTooltip';
import type { GeneratedImageWithMetadata } from '../types';
import type { Task } from '@/types/tasks';

interface ItemMetadataBarProps {
  image: GeneratedImageWithMetadata;
  isVideoContent: boolean;
  isMobile: boolean;
  taskData: Task | null | undefined;
  inputImages: string[];
  shouldShowMetadata: boolean;
  shouldShowTaskDetails: boolean;
  setIsInfoOpen: (isOpen: boolean) => void;
  onMarkAllVariantsViewed: () => void;
}

export const ItemMetadataBar: React.FC<ItemMetadataBarProps> = ({
  image,
  isVideoContent,
  isMobile,
  taskData,
  inputImages,
  shouldShowMetadata,
  shouldShowTaskDetails,
  setIsInfoOpen,
  onMarkAllVariantsViewed,
}) => {
  return (
    <div
      className={cn(
        'absolute right-1.5 flex flex-col items-end gap-1.5 z-20',
        isMobile ? 'top-12' : 'top-1.5 mt-8',
      )}
    >
      <div className="flex flex-row items-center gap-1.5">
        <InfoTooltip
          image={image}
          taskData={taskData}
          inputImages={inputImages}
          shouldShowMetadata={shouldShowMetadata}
          shouldShowTaskDetails={shouldShowTaskDetails}
          setIsInfoOpen={setIsInfoOpen}
          isMobile={isMobile}
        />

        {!isVideoContent && (
          <VariantBadge
            derivedCount={image.derivedCount}
            unviewedVariantCount={image.unviewedVariantCount}
            hasUnviewedVariants={image.hasUnviewedVariants}
            variant="inline"
            size="md"
            tooltipSide="right"
            onMarkAllViewed={onMarkAllVariantsViewed}
          />
        )}
      </div>
    </div>
  );
};
