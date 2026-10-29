/**
 * PhaseConfigVertical
 *
 * A vertical layout component for configuring phase-based video generation settings.
 */

import React from 'react';
import { DEFAULT_PHASE_CONFIG } from '@/shared/types/phaseConfig';
import { PHASE_LABELS_2, PHASE_LABELS_3 } from './PhaseConfigVertical.helpers';
import { PhaseConfigHeader } from './components/PhaseConfigHeader';
import { PhaseGlobalSettingsCard } from './components/PhaseGlobalSettingsCard';
import { PerPhaseCard } from './components/PerPhaseCard';
import type { PhaseConfigVerticalProps } from './types';

export const PhaseConfigVertical: React.FC<PhaseConfigVerticalProps> = ({
  phaseConfig,
  onPhaseConfigChange,
  onBlurSave,
  randomSeed,
  onRandomSeedChange,
  onRestoreDefaults,
}) => {
  const [focusedLoraInput, setFocusedLoraInput] = React.useState<string | null>(null);
  const phaseLabels = phaseConfig.num_phases === 2 ? PHASE_LABELS_2 : PHASE_LABELS_3;

  if (!phaseConfig) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        No phase configuration available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PhaseConfigHeader
        onRestoreDefaults={() => {
          if (onRestoreDefaults) {
            onRestoreDefaults();
            return;
          }
          onPhaseConfigChange(DEFAULT_PHASE_CONFIG);
        }}
      />

      <PhaseGlobalSettingsCard
        phaseConfig={phaseConfig}
        onPhaseConfigChange={onPhaseConfigChange}
        randomSeed={randomSeed}
        onRandomSeedChange={onRandomSeedChange}
      />

      {phaseConfig.phases.map((phase, phaseIdx) => (
        <PerPhaseCard
          key={phaseIdx}
          phaseConfig={phaseConfig}
          onPhaseConfigChange={onPhaseConfigChange}
          phaseIdx={phaseIdx}
          phase={phase}
          label={phaseLabels[phaseIdx] || `Phase ${phase.phase}`}
          focusedLoraInput={focusedLoraInput}
          onFocusLoraInput={setFocusedLoraInput}
          onBlurSave={onBlurSave}
        />
      ))}
    </div>
  );
};
