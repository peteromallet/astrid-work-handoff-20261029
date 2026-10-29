import React from "react";
import { TimeOfDayControl } from "@/shared/components/TimeOfDay/TimeOfDayControl";
import { Button } from "@/shared/components/ui/button";
import type { PreferencesSectionProps } from "../types";

const PreferencesSection: React.FC<PreferencesSectionProps> = ({
  isMobile,
  onReplayTour,
}) => {
  return (
    <div className="space-y-6">
      {/* Appearance Subsection */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Appearance</h3>
        <div className={`${isMobile ? 'p-3' : 'p-4'} bg-muted/30 rounded-lg space-y-2`}>
          <span className="font-medium">Brightness:</span>
          <TimeOfDayControl compact />
        </div>
      </div>

      {onReplayTour && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Tour</h3>
          <div className={`${isMobile ? 'p-3' : 'p-4'} bg-muted/30 rounded-lg flex items-center justify-between gap-3`}>
            <span className="text-xs text-muted-foreground">Walk through what Astrid can do, step by step</span>
            <Button variant="retro-secondary" size="retro-sm" onClick={onReplayTour}>Replay tour</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export { PreferencesSection };
