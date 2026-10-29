import type { PhaseConfig, PhaseSettings } from '@/shared/types/phaseConfig';

export const PHASE_LABELS_2 = ['High Noise Sampler', 'Low Noise Sampler'];
export const PHASE_LABELS_3 = ['High Noise Sampler 1', 'High Noise Sampler 2', 'Low Noise Sampler'];

/** Compute new phases/steps when switching between 2 and 3 phases. */
export function computePhaseTransition(
  phaseConfig: PhaseConfig,
  newNumPhases: number,
): { phases: PhaseSettings[]; steps: number[] } {
  const currentPhases = phaseConfig.phases || [];
  const currentSteps = phaseConfig.steps_per_phase || [];
  const oldNumPhases = currentPhases.length;

  if (oldNumPhases === 2 && newNumPhases === 3) {
    const phase1 = currentPhases[0] || { phase: 1, guidance_scale: 1, loras: [] };
    const phase2 = currentPhases[1] || { phase: 2, guidance_scale: 1, loras: [] };

    return {
      phases: [
        { ...phase1, phase: 1, loras: phase1.loras.map((lora) => ({ ...lora })) },
        { ...phase1, phase: 2, loras: phase1.loras.map((lora) => ({ ...lora })) },
        { ...phase2, phase: 3, loras: phase2.loras.map((lora) => ({ ...lora })) },
      ],
      steps: [currentSteps[0] || 2, currentSteps[0] || 2, currentSteps[1] || 2],
    };
  }

  if (oldNumPhases === 3 && newNumPhases === 2) {
    const phase1 = currentPhases[0] || { phase: 1, guidance_scale: 1, loras: [] };
    const phase3 = currentPhases[2] || { phase: 3, guidance_scale: 1, loras: [] };

    return {
      phases: [
        { ...phase1, phase: 1, loras: phase1.loras.map((lora) => ({ ...lora })) },
        { ...phase3, phase: 2, loras: phase3.loras.map((lora) => ({ ...lora })) },
      ],
      steps: [currentSteps[0] || 2, currentSteps[2] || 2],
    };
  }

  const nextPhases = currentPhases.slice(0, newNumPhases);
  const nextSteps = currentSteps.slice(0, newNumPhases);

  while (nextPhases.length < newNumPhases) {
    nextPhases.push({ phase: nextPhases.length + 1, guidance_scale: 1, loras: [] });
  }

  while (nextSteps.length < newNumPhases) {
    nextSteps.push(2);
  }

  return { phases: nextPhases, steps: nextSteps };
}

/** Immutably update a single field on a lora within a phase's lora list. */
export function updateLoraField(
  phaseConfig: PhaseConfig,
  phaseIdx: number,
  loraIdx: number,
  field: string,
  value: string,
): PhaseSettings[] {
  return phaseConfig.phases.map((phase, phaseIndex) =>
    phaseIndex === phaseIdx
      ? {
          ...phase,
          loras: phase.loras.map((lora, loraIndex) =>
            loraIndex === loraIdx ? { ...lora, [field]: value } : lora,
          ),
        }
      : phase,
  );
}
