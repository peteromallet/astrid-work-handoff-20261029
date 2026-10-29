import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';

interface ExternalLinkTooltipButtonProps {
  onClick: () => void;
  tooltipLabel: string;
  delayDuration?: number;
  className?: string;
}

export const ExternalLinkTooltipButton: React.FC<ExternalLinkTooltipButtonProps> = ({
  onClick,
  tooltipLabel,
  delayDuration,
  className,
}) => {
  const button = (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={className ?? 'h-7 w-7'}
    >
      <ExternalLink className="h-4 w-4" />
    </Button>
  );

  if (delayDuration !== undefined) {
    return (
      <TooltipProvider delayDuration={delayDuration}>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltipLabel}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>
        <p>{tooltipLabel}</p>
      </TooltipContent>
    </Tooltip>
  );
};
