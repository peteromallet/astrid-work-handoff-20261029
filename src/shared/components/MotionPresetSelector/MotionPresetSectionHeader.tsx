import React from 'react';
import { Info } from 'lucide-react';
import { Label } from '@/shared/components/ui/primitives/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';

interface MotionPresetSectionHeaderProps {
  tooltipContent: React.ReactNode;
  tooltipContentClassName?: string;
}

export const MotionPresetSectionHeader: React.FC<MotionPresetSectionHeaderProps> = ({
  tooltipContent,
  tooltipContentClassName,
}) => {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-sm font-medium">Motion Preset:</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
            <Info className="h-4 w-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div className={tooltipContentClassName}>{tooltipContent}</div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
