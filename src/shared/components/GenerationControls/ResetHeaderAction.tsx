import React from 'react';
import { RotateCcw } from 'lucide-react';

interface ResetHeaderActionProps {
  disabled?: boolean;
  onReset: () => void;
}

export const ResetHeaderAction: React.FC<ResetHeaderActionProps> = ({
  disabled = false,
  onReset,
}) => (
  <div
    role="button"
    tabIndex={0}
    onClick={(event) => {
      event.preventDefault();
      if (!disabled) onReset();
    }}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!disabled) onReset();
      }
    }}
    className={`inline-flex items-center text-xs text-muted-foreground hover:text-foreground h-7 px-2 rounded cursor-pointer ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
  >
    <RotateCcw className="w-3 h-3 mr-1" />
    Reset
  </div>
);
