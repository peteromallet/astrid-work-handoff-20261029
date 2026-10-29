import React, { useState, useEffect } from 'react';
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/primitives/label";
import { useProjectCrudContext } from '@/shared/contexts/ProjectContext';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { Project } from '@/types/project';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { AspectRatioSelector } from '@/shared/components/GenerationControls/AspectRatioSelector';
import { ModalContainer } from '@/shared/components/ModalContainer';

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  project: Project | null | undefined;
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({ isOpen, onOpenChange, project }) => {
  const [projectName, setProjectName] = useState('');
  const [aspectRatio, setAspectRatio] = useState<string>('');
  const { updateProject, isUpdatingProject, deleteProject, isDeletingProject } = useProjectCrudContext();
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [isDangerZoneOpen, setIsDangerZoneOpen] = useState(false);

  useEffect(() => {
    if (project && isOpen) {
      setProjectName(project.name);
      setAspectRatio(project.aspectRatio || '16:9');
    }
  }, [project, isOpen]);

  const handleSaveChanges = async () => {
    if (!project) {
      toast.error("No project selected to update.");
      return;
    }

    const updates: { name?: string; aspectRatio?: string } = {};
    let hasChanges = false;
    if (projectName.trim() && projectName.trim() !== project.name) {
      updates.name = projectName.trim();
      hasChanges = true;
    }
    if (aspectRatio && aspectRatio !== project.aspectRatio) {
      updates.aspectRatio = aspectRatio;
      hasChanges = true;
    }

    if (!hasChanges) {
      toast.info("No changes detected.");
      onOpenChange(false);
      return;
    }

    if (!updates.name && !updates.aspectRatio) {
      toast.error("Project name cannot be empty if it's the only change.");
      return;
    }

    const success = await updateProject(project.id, updates);
    if (success) onOpenChange(false);
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    const success = await deleteProject(project.id);
    if (success) onOpenChange(false);
  };

  if (!project) return null;

  return (
    <ModalContainer
      open={isOpen}
      onOpenChange={onOpenChange}
      size="medium"
      title="Project Settings"
      footer={(
        <>
          <Button variant="retro-secondary" size="retro-sm" onClick={() => onOpenChange(false)} disabled={isUpdatingProject} className="mr-auto sm:mr-0">
            Cancel
          </Button>
          <Button
            variant="retro"
            size="retro-sm"
            type="submit"
            onClick={handleSaveChanges}
            disabled={isUpdatingProject || !projectName.trim() || !aspectRatio}
          >
            {isUpdatingProject ? "Saving..." : "Save Changes"}
          </Button>
        </>
      )}
    >
      <div className="grid gap-4 py-3">
        <div className="space-y-1.5">
          <Label htmlFor="project-name-settings">Name:</Label>
          <Input
            id="project-name-settings"
            autoComplete="off"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full"
            disabled={isUpdatingProject}
            maxLength={30}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="aspect-ratio-settings">Aspect Ratio:</Label>
          <AspectRatioSelector
            value={aspectRatio}
            onValueChange={setAspectRatio}
            disabled={isUpdatingProject}
            id="aspect-ratio-settings"
            showVisualizer
          />
        </div>
        <Collapsible open={isDangerZoneOpen} onOpenChange={setIsDangerZoneOpen}>
          <div className="mt-6 border-t pt-4">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="h-auto w-full justify-between p-0 text-left hover:bg-transparent" type="button">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="font-light text-red-600">Delete Project</span>
                </div>
                <ChevronDown className={`h-4 w-4 text-red-500 transition-transform ${isDangerZoneOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <div className="space-y-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="delete-confirm-input" className="text-sm font-light text-red-900 dark:text-red-300">
                      Type "confirm" to make it clear you wish to delete the project and all associated data.
                    </Label>
                    <Input
                      id="delete-confirm-input"
                      placeholder='Type "confirm" to enable'
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      disabled={isDeletingProject}
                      className="mt-1 border-red-300 focus:border-red-500 focus:ring-red-500 dark:border-red-700 dark:bg-red-950/20 dark:text-red-100 dark:placeholder:text-red-400/50"
                    />
                  </div>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteProject}
                    disabled={deleteConfirmText !== 'confirm' || isDeletingProject}
                    className="w-full"
                  >
                    {isDeletingProject ? 'Deleting...' : 'Delete Project Forever'}
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </div>
    </ModalContainer>
  );
};
