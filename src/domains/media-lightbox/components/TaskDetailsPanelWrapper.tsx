import React from 'react';
import { TaskDetailsPanel } from '@/shared/components/TaskDetails/TaskDetailsPanel';
import { GenerationDetails } from '@/domains/generation/components/GenerationDetails';
import type { TaskDetailsData } from '../types';

interface TaskDetailsPanelWrapperProps {
  taskDetailsData?: TaskDetailsData;
}

/**
 * TaskDetailsPanelWrapper Component
 * Wraps TaskDetailsPanel with all the standard props wiring
 * Includes the derived generations section
 */
export const TaskDetailsPanelWrapper: React.FC<TaskDetailsPanelWrapperProps> = ({
  taskDetailsData,
}) => {
  return (
    <TaskDetailsPanel
      task={taskDetailsData?.task ?? null}
      isLoading={taskDetailsData?.isLoading || false}
      status={taskDetailsData?.status}
      error={taskDetailsData?.error ?? null}
      inputImages={taskDetailsData?.inputImages || []}
      taskId={taskDetailsData?.taskId || null}
      className=""
      showUserImage={false}
      derivedSection={null}
      hideHeader={true}
      renderGenerationDetails={(props) => (
        <GenerationDetails {...props} />
      )}
    />
  );
};
