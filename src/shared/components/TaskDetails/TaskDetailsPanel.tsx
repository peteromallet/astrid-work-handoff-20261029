import React, { useCallback, useState, ReactNode } from 'react';
import { Button } from '@/shared/components/ui/button';
import { useIsMobile } from '@/shared/hooks/mobile';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Task } from '@/types/tasks';
import { CornerDownLeft } from 'lucide-react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  TaskDetailsEmptyState,
  TaskDetailsErrorState,
  TaskDetailsLoadingState,
} from '@/shared/components/TaskDetails/components/TaskDetailsStatusStates';
import {
  TaskDetailsSummaryControls,
  TaskDetailsSummarySection,
} from '@/shared/components/TaskDetails/components/TaskDetailsSummarySection';
import type { TaskGenerationDetailsRendererProps } from '@/shared/components/TaskDetails/components/TaskDetailsSummaryAndParams';
import type { TaskDetailsStatus } from '@/shared/lib/taskDetails/taskDetailsContract';

interface TaskDetailsPanelProps {
  task: Task | null;
  isLoading: boolean;
  status?: TaskDetailsStatus;
  error: Error | null;
  inputImages: string[];
  onApplySettingsFromTask?: (taskId: string) => void;
  taskId: string | null;
  className?: string;
  basedOnSection?: ReactNode;
  derivedSection?: ReactNode;
  // Control whether to show user-provided source images
  showUserImage?: boolean;
  // Hide the header (title is shown in parent component)
  hideHeader?: boolean;
  renderGenerationDetails?: (props: TaskGenerationDetailsRendererProps) => ReactNode;
}

const TaskDetailsPanel: React.FC<TaskDetailsPanelProps> = ({
  task,
  isLoading,
  status,
  error,
  inputImages,
  onApplySettingsFromTask,
  taskId,
  className = "",
  basedOnSection,
  derivedSection,
  hideHeader = false,
  renderGenerationDetails,
}) => {
  const isMobile = useIsMobile();
  const resolvedStatus = status ?? (error ? 'error' : task ? 'ok' : 'missing');
  const [showDetailedParams, setShowDetailedParams] = useState(false);
  const [showAllImages, setShowAllImages] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [showFullNegativePrompt, setShowFullNegativePrompt] = useState(false);
  const [paramsCopied, setParamsCopied] = useState(false);
  const [idCopied, setIdCopied] = useState(false);

  const handleCopyParams = useCallback(async () => {
    if (!task?.params) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(task.params, null, 2));
      setParamsCopied(true);
      setTimeout(() => setParamsCopied(false), 2000);
    } catch (err) {
      normalizeAndPresentError(err, { context: 'TaskDetailsPanel', showToast: false });
    }
  }, [task?.params]);

  const handleCopyId = useCallback(() => {
    if (!taskId) return;
    navigator.clipboard.writeText(taskId);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 2000);
  }, [taskId]);

  const handleApplySettingsFromTask = () => {
    if (taskId && onApplySettingsFromTask && task) {
      onApplySettingsFromTask(taskId);
    }
  };
  const summaryControls: TaskDetailsSummaryControls = {
    showAllImages,
    onShowAllImagesChange: setShowAllImages,
    showFullPrompt,
    onShowFullPromptChange: setShowFullPrompt,
    showFullNegativePrompt,
    onShowFullNegativePromptChange: setShowFullNegativePrompt,
    showDetailedParams,
    onShowDetailedParamsChange: setShowDetailedParams,
    paramsCopied,
    onCopyParams: () => {
      void handleCopyParams();
    },
  };

  if (isLoading) {
    return (
      <TaskDetailsLoadingState containerClassName={`h-64 ${className}`} />
    );
  }

  if (resolvedStatus === 'error' && !task) {
    return (
      <div className={`flex flex-col ${className}`}>
        {basedOnSection}
        {derivedSection}
        <TaskDetailsErrorState
          errorMessage={error?.message}
          containerClassName="py-6"
          iconWrapperClassName="w-10 h-10"
          iconClassName="w-5 h-5"
        />
      </div>
    );
  }

  if (!task) {
    return (
      <div className={`flex flex-col ${className}`}>
        {/* Based On Section - show even without task details */}
        {basedOnSection}

        {/* Derived Generations Section - show even without task details */}
        {derivedSection}

        {/* No task message - only show if there's also no based on or derived sections */}
        {!basedOnSection && !derivedSection && (
          <TaskDetailsEmptyState
            containerClassName="py-6"
            iconWrapperClassName="w-10 h-10"
            iconClassName="w-5 h-5"
          />
        )}
      </div>
    );
  }

  // When hideHeader is true, we're embedded in a parent scroll container (like InfoPanel)
  // so don't force height or add our own ScrollArea
  const wrapperClass = hideHeader
    ? `flex flex-col ${className}`
    : `flex flex-col h-full ${className}`;

  // Match EditPanelLayout padding: p-6 desktop, p-3 mobile
  const padding = isMobile ? 'p-3' : 'p-6';

  const contentWrapper = (content: React.ReactNode) => {
    if (hideHeader) {
      // No scroll wrapper - parent handles scrolling
      return <div className={padding}>{content}</div>;
    }
    // Use ScrollArea for standalone usage
    return <ScrollArea className={`flex-1 ${padding} overflow-y-auto`}>{content}</ScrollArea>;
  };

  return (
    <div className={wrapperClass}>
      {!hideHeader && (
        <div className="flex-shrink-0 p-4 border-b">
          <div className="flex items-center justify-end">
            {taskId && (
              <button
                onClick={handleCopyId}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  idCopied ? 'text-green-400' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700'
                }`}
              >
                {idCopied ? 'copied' : 'id'}
              </button>
            )}
          </div>
        </div>
      )}

      {contentWrapper(
        <TaskDetailsSummarySection
          task={task}
          inputImages={inputImages}
          detailsVariant="panel"
          isMobile={isMobile}
          controls={summaryControls}
          showCopyButtons={true}
          renderGenerationDetails={renderGenerationDetails}
        >
          {basedOnSection}
          {derivedSection}
        </TaskDetailsSummarySection>
      )}

      {/* Footer with controls - Sticky to bottom - only show when Apply Settings is available */}
      {onApplySettingsFromTask && task && taskId && (
        <div className="flex-shrink-0 border-t bg-gradient-to-t from-background via-background to-background/95 sticky bottom-0">
          <div className="p-4 flex items-center gap-3">
            {/* Apply button */}
            <Button
              variant="retro"
              size="retro-sm"
              onClick={handleApplySettingsFromTask}
              className="flex-1 gap-2"
            >
              <CornerDownLeft className="h-4 w-4" />
              Apply Settings
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export { TaskDetailsPanel };
