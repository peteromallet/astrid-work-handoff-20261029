import { useState, useCallback, useEffect, useMemo } from 'react';
import { AstridLocalClient } from '@/integrations/astrid/client';
import { ensureProjectHasTimeline } from '@/integrations/runtime/createDefaultTimeline';
import { bridgeCapabilityUnavailable } from '@/integrations/astrid/capability';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { Project } from '@/types/project';
import { UserPreferences } from '@/shared/settings/userPreferences';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { ensureUserRecordExists } from '@/features/projects/services/projectSetupService';
import { getRuntimeDocumentProjectId } from '@/app/runtime/runtimeDocument';

// Type for updating projects
interface ProjectUpdate {
  name?: string;
  aspectRatio?: string;
}

// Helper to convert DB row (snake_case) to our Project interface (camelCase)
const mapDbProjectToProject = (row: Record<string, unknown>): Project => ({
  id: row.id as string,
  name: row.name as string,
  user_id: row.user_id as string,
  aspectRatio: (row.aspect_ratio as string) ?? undefined,
  createdAt: (row.created_at as string) ?? undefined,
});

export const determineProjectIdToSelect = (
  projects: Project[],
  preferredId: string | null | undefined,
  lastOpenedId: string | null | undefined
): string | null => {
  if (!projects.length) return null;

  const availableProjectIds = new Set(projects.map(p => p.id));

  if (preferredId && availableProjectIds.has(preferredId)) {
    return preferredId;
  }
  if (lastOpenedId && availableProjectIds.has(lastOpenedId)) {
    return lastOpenedId;
  }
  return projects[0].id;
};

function projectSlugFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'new-project';
}

interface UseProjectCRUDOptions {
  userId: string | null;
  selectedProjectId: string | null;
  onProjectsLoaded: (projects: Project[], isNewDefault: boolean) => void;
  onProjectCreated: (project: Project) => void;
  onProjectDeleted: (remainingProjects: Project[]) => void;
  updateUserSettings: (scope: 'user', patch: Partial<UserPreferences>) => Promise<void>;
}

/**
 * Manages project CRUD operations: fetch, create, update, delete.
 * Owns the `projects` list state and all loading flags.
 */
export function useProjectCRUD({
  userId,
  selectedProjectId: _selectedProjectId,
  onProjectsLoaded,
  onProjectCreated,
  onProjectDeleted: _onProjectDeleted,
  updateUserSettings: _updateUserSettings,
}: UseProjectCRUDOptions) {
  const runtimeProjectId = getRuntimeDocumentProjectId();
  const runtimeProject = useMemo(
    () => runtimeProjectId
      ? { id: runtimeProjectId, name: runtimeProjectId, user_id: 'runtime-user' }
      : null,
    [runtimeProjectId],
  );
  const urlProject = runtimeProject;
  const isUrlOwnedMode = urlProject !== null;
  const [projects, setProjects] = useState<Project[]>(() => urlProject ? [urlProject] : []);
  const [isLoadingProjects, setIsLoadingProjects] = useState(!urlProject);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  // Keep the canonical URL project visible in ProjectContext while navigating
  // between document tools; Runtime discovery supplies its display metadata.
  useEffect(() => {
    if (urlProject) {
      setProjects([urlProject]);
      setIsLoadingProjects(false);
    } else if (!userId) {
      setProjects([]);
      setIsLoadingProjects(false);
    }
  }, [urlProject, userId]);

  const fetchProjects = useCallback(async () => {
    try {
      if (isUrlOwnedMode) {
        return;
      }
      if (!userId) throw new Error('Not authenticated');
      const user = { id: userId };

      await ensureUserRecordExists(user.id);

      const projectsData = await new AstridLocalClient({ projectSlug: '__discovery__' }).projects.list();
      const mappedProjects = projectsData.map((project) => mapDbProjectToProject({
        id: project.project_id,
        name: project.name,
        user_id: user.id,
      }));
      setProjects(mappedProjects);
      onProjectsLoaded(mappedProjects, false);
    } catch (error: unknown) {
      normalizeAndPresentError(error, { context: 'ProjectContext', toastTitle: 'Failed to load projects' });
      setProjects([]);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [isUrlOwnedMode, userId, onProjectsLoaded]);

  const addNewProject = useCallback(async (projectData: { name: string; aspectRatio: string }) => {
    if (!projectData.name.trim()) {
      toast.error("Project name cannot be empty.");
      return null;
    }
    if (!projectData.aspectRatio) {
      toast.error("Aspect ratio cannot be empty.");
      return null;
    }
    setIsCreatingProject(true);
    try {
      const created = await new AstridLocalClient({ projectSlug: '__discovery__' }).projects.create({
        name: projectData.name.trim(),
        slug: projectSlugFromName(projectData.name),
        metadata: { aspect_ratio: projectData.aspectRatio },
      });
      const createdProject = mapDbProjectToProject({
        id: created.data.project_id,
        name: created.data.name,
        user_id: 'local-user',
        aspect_ratio: created.data.metadata.aspect_ratio,
        created_at: created.data.created_at,
      });
      setProjects((current) => [...current.filter((project) => project.id !== createdProject.id), createdProject]);
      try {
        await ensureProjectHasTimeline(created.data.project_id);
      } catch (timelineError: unknown) {
        normalizeAndPresentError(timelineError, {
          context: 'ProjectContext',
          toastTitle: 'Project created; its first timeline could not be created',
        });
      }
      onProjectCreated(createdProject);
      return createdProject;
    } catch (err: unknown) {
      normalizeAndPresentError(err, { context: 'ProjectContext', toastTitle: 'Failed to create project' });
      return null;
    } finally {
      setIsCreatingProject(false);
    }
  }, [onProjectCreated]);

  const updateProject = useCallback(async (projectId: string, updates: ProjectUpdate): Promise<boolean> => {
    if (!updates.name?.trim() && !updates.aspectRatio) {
      toast.error("No changes to save.");
      return false;
    }
    setIsUpdatingProject(true);
    try {
      if (isUrlOwnedMode) {
        const discoveryClient = new AstridLocalClient({ projectSlug: '__discovery__' });
        const current = (await discoveryClient.projects.list()).find((project) => project.project_id === projectId);
        if (!current?.project_id || current.version === undefined) {
          throw new Error('Astrid did not return the project version required to save settings.');
        }
        const client = new AstridLocalClient({ projectSlug: current.slug });
        const metadata = { ...(current.metadata ?? {}) };
        if (updates.aspectRatio) metadata.aspect_ratio = updates.aspectRatio;
        const updated = await client.projects.update({
          projectId: current.project_id,
          expectedVersion: current.version,
          name: updates.name,
          metadata,
        });
        const updatedProject = mapDbProjectToProject({
          id: updated.project_id,
          name: updated.name,
          user_id: 'local-user',
          aspect_ratio: updated.metadata.aspect_ratio,
          created_at: updated.created_at,
        });
        setProjects((currentProjects) => currentProjects.map((project) => (
          project.id === projectId ? updatedProject : project
        )));
        return true;
      }
      if (!userId) throw new Error('Not authenticated');
      void projectId;
      void updates;
      throw bridgeCapabilityUnavailable('update project', 'Update the project with the Astrid CLI, then refresh this page.');
    } catch (err: unknown) {
      normalizeAndPresentError(err, { context: 'ProjectContext', toastTitle: 'Failed to update project' });
      return false;
    } finally {
      setIsUpdatingProject(false);
    }
  }, [isUrlOwnedMode, userId]);

  const deleteProject = useCallback(async (_projectId: string): Promise<boolean> => {
    setIsDeletingProject(true);
    try {
      if (!userId) throw new Error('Not authenticated');

      throw bridgeCapabilityUnavailable(
        'delete project',
        'Delete the project with the Astrid CLI, then refresh this page.',
      );
    } catch (err: unknown) {
      normalizeAndPresentError(err, { context: 'ProjectContext', toastTitle: 'Failed to delete project' });
      return false;
    } finally {
      setIsDeletingProject(false);
    }
  }, [userId]);

  return {
    projects,
    isLoadingProjects,
    fetchProjects,
    addNewProject,
    isCreatingProject,
    updateProject,
    isUpdatingProject,
    deleteProject,
    isDeletingProject,
  };
}
