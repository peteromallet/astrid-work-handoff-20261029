import type { GenerationRow } from '@/domains/generation/types';

export interface FinalVideoSectionProps {
  shotId: string;
  projectId: string;
  projectAspectRatio?: string;
  onApplySettingsFromTask?: (taskId: string) => void;
  onJoinSegmentsClick?: () => void;
  selectedParentId?: string | null;
  onSelectedParentChange?: (id: string | null) => void;
  parentGenerations?: GenerationRow[];
  segmentProgress?: { completed: number; total: number };
  getFinalVideoCount?: (shotId: string | null) => number | null;
  readOnly?: boolean;
  preloadedParent?: GenerationRow | null;
}

export interface FinalVideoVariantBadgeData {
  derivedCount: number;
  unviewedVariantCount: number;
  hasUnviewedVariants: boolean;
}

export interface FinalVideoSectionProgress {
  completed: number;
  total: number;
}
