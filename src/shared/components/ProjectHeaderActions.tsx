import type { ReactNode } from 'react';
import { useState } from 'react';
import { PlusCircle, Wrench } from 'lucide-react';
import { Button } from '@/shared/components/ui/button.tsx';
import { cn } from '@/shared/components/ui/contracts/cn.ts';
import { COARSE_TOUCH_TARGET } from '@/shared/components/ui/contracts/touchTarget.ts';
import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext.tsx';
import type { Project } from '@/types/project.ts';
import { CreateProjectModal } from '@/shared/components/GlobalHeader/CreateProjectModal.tsx';
import { ProjectSettingsModal } from '@/shared/components/modals/ProjectSettingsModal.tsx';

type ProjectSummary = {
  project_id: string;
  slug?: string;
  name: string;
  metadata?: Record<string, unknown>;
};

interface ProjectHeaderActionsProps {
  selectedProject: ProjectSummary | null;
  onProjectCreated?: () => void;
  onProjectUpdated?: () => void;
  disabled?: boolean;
  confirmNavigation?: () => boolean;
  showDialogs?: boolean;
}

function toProject(summary: ProjectSummary | null, contextProject: Project | null): Project | null {
  if (!summary) return null;
  const id = summary.project_id;
  if (contextProject?.id !== id) contextProject = null;
  const aspectRatio = typeof summary.metadata?.aspect_ratio === 'string'
    ? summary.metadata.aspect_ratio
    : typeof summary.metadata?.aspectRatio === 'string'
      ? summary.metadata.aspectRatio
      : contextProject?.aspectRatio;
  return {
    id,
    name: summary.name,
    user_id: contextProject?.user_id ?? 'local-user',
    ...(aspectRatio ? { aspectRatio } : {}),
    createdAt: contextProject?.createdAt,
  };
}

function ProjectActionDialogs({
  selectedProject,
  isCreateProjectModalOpen,
  setIsCreateProjectModalOpen,
  isProjectSettingsModalOpen,
  setIsProjectSettingsModalOpen,
  onProjectCreated,
  onProjectUpdated,
  confirmNavigation,
}: {
  selectedProject: ProjectSummary | null;
  isCreateProjectModalOpen: boolean;
  setIsCreateProjectModalOpen: (open: boolean) => void;
  isProjectSettingsModalOpen: boolean;
  setIsProjectSettingsModalOpen: (open: boolean) => void;
  onProjectCreated?: () => void;
  onProjectUpdated?: () => void;
  confirmNavigation?: () => boolean;
}) {
  const { project: contextProject } = useProjectSelectionContext();
  const project = toProject(selectedProject, contextProject);

  return (
    <>
      <CreateProjectModal
        isOpen={isCreateProjectModalOpen}
        onOpenChange={setIsCreateProjectModalOpen}
        onProjectCreated={onProjectCreated}
        confirmNavigation={confirmNavigation}
      />
      <ProjectSettingsModal
        isOpen={isProjectSettingsModalOpen}
        onOpenChange={(open) => {
          setIsProjectSettingsModalOpen(open);
          if (!open) onProjectUpdated?.();
        }}
        project={project}
      />
    </>
  );
}

function ProjectActionButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('h-7 w-7 shrink-0 rounded-md border border-border/70 bg-card/80 text-muted-foreground hover:bg-accent hover:text-foreground', COARSE_TOUCH_TARGET)}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      {children}
    </Button>
  );
}

export function ProjectHeaderActions({
  selectedProject,
  onProjectCreated,
  onProjectUpdated,
  disabled = false,
  confirmNavigation,
  showDialogs = true,
}: ProjectHeaderActionsProps) {
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [isProjectSettingsModalOpen, setIsProjectSettingsModalOpen] = useState(false);

  return (
    <>
      <div className="flex shrink-0 items-center gap-1 [@media(pointer:coarse)]:gap-2" data-testid="astrid-project-actions">
        <ProjectActionButton
          label="Project settings"
          onClick={() => setIsProjectSettingsModalOpen(true)}
          disabled={disabled || !selectedProject}
        >
          <Wrench className="h-3.5 w-3.5" />
        </ProjectActionButton>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-7 shrink-0 gap-1.5 rounded-md border border-border/70 bg-card/80 px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground', COARSE_TOUCH_TARGET)}
          onClick={() => setIsCreateProjectModalOpen(true)}
          aria-label="New project"
          disabled={disabled}
        >
          <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {/* Phones keep the icon: the caption would push the header onto a second line. */}
          <span className="hidden sm:inline">New project</span>
        </Button>
      </div>

      {showDialogs && <ProjectActionDialogs
        selectedProject={selectedProject}
        isCreateProjectModalOpen={isCreateProjectModalOpen}
        setIsCreateProjectModalOpen={setIsCreateProjectModalOpen}
        isProjectSettingsModalOpen={isProjectSettingsModalOpen}
        setIsProjectSettingsModalOpen={setIsProjectSettingsModalOpen}
        onProjectCreated={onProjectCreated}
        onProjectUpdated={onProjectUpdated}
        confirmNavigation={confirmNavigation}
      />}
    </>
  );
}
