import type { Task as RuntimeTask } from '@/integrations/runtime/generated.ts';
import { runtimeTaskLabel } from './activityPresentation';
import { runtimeTaskIsCancellable, runtimeTaskIsSelectedTimelineRender } from './hooks/useRuntimeTasks';

/** One visible row: a single task, or consecutive same-label tasks collapsed together (newest first). */
export interface RuntimeTaskGroup {
  key: string;
  label: string;
  state: RuntimeTask['state'];
  tasks: RuntimeTask[];
}

export interface RuntimeTaskSections {
  active: RuntimeTask[];
  failed: RuntimeTaskGroup[];
  /** The newest groups, plus the newest exportable render even when it is older. */
  recent: RuntimeTaskGroup[];
  older: RuntimeTaskGroup[];
}

export const RECENT_GROUP_LIMIT = 6;

const newestFirst = (a: RuntimeTask, b: RuntimeTask) =>
  b.updated_at.localeCompare(a.updated_at) || b.created_at.localeCompare(a.created_at);

/** Collapse neighbours that share a label (and, for failures, a state). */
function collapse(tasks: RuntimeTask[], sameState: boolean, solo: ReadonlySet<string> = new Set()): RuntimeTaskGroup[] {
  const groups: RuntimeTaskGroup[] = [];
  for (const task of tasks) {
    const label = runtimeTaskLabel(task);
    const last = groups[groups.length - 1];
    const joins = last
      && !solo.has(task.task_id)
      && !solo.has(last.tasks[0].task_id)
      && last.label === label
      && (!sameState || last.state === task.state);
    if (joins) last.tasks.push(task);
    else groups.push({ key: task.task_id, label, state: task.state, tasks: [task] });
  }
  return groups;
}

export function sectionRuntimeTasks(tasks: readonly RuntimeTask[], timelineId: string | null): RuntimeTaskSections {
  const sorted = [...tasks].sort(newestFirst);
  const active = sorted.filter(runtimeTaskIsCancellable);
  const failed = collapse(sorted.filter((task) => task.state === 'failed' || task.state === 'cancelled'), true);
  const done = sorted.filter((task) => task.state === 'succeeded');
  const exportable = done.find((task) => runtimeTaskIsSelectedTimelineRender(task, timelineId));
  const history = collapse(done, false, new Set(exportable ? [exportable.task_id] : []));
  const recent = history.slice(0, RECENT_GROUP_LIMIT);
  let older = history.slice(RECENT_GROUP_LIMIT);
  const pinned = older.find((group) => group.tasks[0] === exportable);
  if (pinned) {
    recent.push(pinned);
    older = older.filter((group) => group !== pinned);
  }
  return { active, failed, recent, older };
}
