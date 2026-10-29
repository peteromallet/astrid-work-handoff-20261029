/**
 * EnhancedPromptBadge Component
 *
 * Shows "Enhanced" badge with tooltip containing the original prompt and clear action.
 * Uses StatusBadge for consistent styling with other status indicators.
 */

import React from 'react';
import { Loader2, Save } from 'lucide-react';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { truncateText } from '@/shared/lib/stringFormatting';

interface EnhancedPromptBadgeProps {
  onClear: () => void;
  onSetAsDefault?: () => void;
  isSaving?: boolean;
  basePrompt?: string;
}

export const EnhancedPromptBadge: React.FC<EnhancedPromptBadgeProps> = ({
  onClear,
  onSetAsDefault,
  isSaving,
  basePrompt,
}) => {
  const truncatedBase = basePrompt ? truncateText(basePrompt, 50) : basePrompt;

  const tooltipText = basePrompt
    ? `Enhanced from: "${truncatedBase}"`
    : 'AI-enhanced prompt';

  return (
    <div className="flex items-center gap-1">
      <StatusBadge
        label="Enhanced"
        color="green"
        tooltipText={tooltipText}
        tooltipSide="bottom"
        size="md"
        action={{
          label: 'Clear enhanced prompt',
          onClick: onClear,
        }}
      />
      {/* Set as Default button */}
      {onSetAsDefault && (
        <button
          type="button"
          onClick={onSetAsDefault}
          disabled={isSaving}
          className="text-[10px] bg-muted hover:bg-primary/15 text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors disabled:opacity-50"
          title="Set this enhanced prompt as the shot default"
        >
          {isSaving ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
          ) : (
            <Save className="w-2.5 h-2.5" />
          )}
          Set as Default
        </button>
      )}
    </div>
  );
};
