import type { Shot } from '@/domains/generation/types';

export interface TargetShotInfo {
  targetShotIdForButton: string | undefined;
  targetShotNameForButtonTooltip: string;
}

export function deriveTargetShotInfo(
  lastAffectedShotId: string | null,
  shots: Shot[] | undefined
): TargetShotInfo {
  const targetShotIdForButton = lastAffectedShotId || (shots && shots.length > 0 ? shots[0].id : undefined);
  const targetShotNameForButtonTooltip = targetShotIdForButton
    ? (shots?.find((shot) => shot.id === targetShotIdForButton)?.name || 'Selected Shot')
    : (shots && shots.length > 0 ? shots[0].name : 'Last Shot');

  return { targetShotIdForButton, targetShotNameForButtonTooltip };
}
