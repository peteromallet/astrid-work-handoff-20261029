import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { RotateCcw } from 'lucide-react';

interface PhaseConfigHeaderProps {
  onRestoreDefaults: () => void;
}

export const PhaseConfigHeader: React.FC<PhaseConfigHeaderProps> = ({
  onRestoreDefaults,
}) => {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-lg font-medium truncate">Phase Configuration</h3>
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="w-8 h-8 p-0" onClick={onRestoreDefaults} type="button">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>Restore Defaults</p></TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
