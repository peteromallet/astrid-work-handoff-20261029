export type AstridTaskRef = {
  project_id: string;
  run_id: string;
  task_id: string;
  capability_id: string;
};

export type AgentTaskLink = AstridTaskRef & { sessionId: string; toolCallId: string; liveObserved: boolean };

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** The result details are the sole task join. No text or timestamp fallback. */
export function readAstridTaskRefs(rawOutput: unknown, projectId?: string): AstridTaskRef[] {
  const refs = record(record(rawOutput)?.details)?.astridTaskRefs;
  if (!Array.isArray(refs)) return [];
  const unique = new Map<string, AstridTaskRef>();
  for (const value of refs) {
    const ref = record(value);
    if (!ref || !['project_id', 'run_id', 'task_id', 'capability_id'].every(
      field => typeof ref[field] === 'string' && (ref[field] as string).trim().length > 0,
    ) || (projectId && ref.project_id !== projectId)) continue;
    const parsed = { project_id: ref.project_id, run_id: ref.run_id, task_id: ref.task_id, capability_id: ref.capability_id } as AstridTaskRef;
    unique.set(JSON.stringify([parsed.project_id, parsed.run_id, parsed.task_id, parsed.capability_id]), parsed);
  }
  return [...unique.values()];
}

export function mergeAstridTaskRefs(...groups: readonly (readonly AstridTaskRef[] | undefined)[]): AstridTaskRef[] {
  return readAstridTaskRefs({ details: { astridTaskRefs: groups.flatMap(group => group ?? []) } });
}
