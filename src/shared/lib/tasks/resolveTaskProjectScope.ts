import { getProjectSelectionFallbackId } from '@/shared/contexts/projectSelectionStore';

export function resolveTaskProjectScope(projectId?: string | null): string | null {
  if (projectId && projectId.trim().length > 0) {
    return projectId;
  }

  const selectedProjectId = getProjectSelectionFallbackId();
  if (selectedProjectId && selectedProjectId.trim().length > 0) {
    return selectedProjectId;
  }

  return null;
}
