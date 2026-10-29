import { X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

interface PairPromptTooltipContentProps {
  pairPrompt?: string;
  pairNegativePrompt?: string;
  enhancedPrompt?: string;
  onClearEnhancedPrompt?: () => void;
}

export function PairPromptTooltipContent({
  pairPrompt,
  pairNegativePrompt,
  enhancedPrompt,
  onClearEnhancedPrompt,
}: PairPromptTooltipContentProps) {
  return (
    <div className="space-y-2">
      <div>
        <span className="font-medium">Prompt:</span>
        <p className="text-sm">
          {pairPrompt && pairPrompt.trim() ? pairPrompt.trim() : '[default]'}
        </p>
      </div>
      <div>
        <span className="font-medium">Negative:</span>
        <p className="text-sm">
          {pairNegativePrompt && pairNegativePrompt.trim() ? pairNegativePrompt.trim() : '[default]'}
        </p>
      </div>
      {enhancedPrompt && enhancedPrompt.trim() && (
        <div className="pt-1 border-t border-border/50">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium">Enhanced Prompt:</span>
            {onClearEnhancedPrompt && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  onClearEnhancedPrompt();
                }}
                className="h-5 w-5 p-0 hover:bg-destructive/10 hover:text-destructive"
                title="Clear enhanced prompt"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <p className="text-sm">
            {enhancedPrompt.trim()}
          </p>
        </div>
      )}
    </div>
  );
}
