import type { LocalAgentId } from '@/integrations/astrid/localAgents.ts';
import { modelThoughtSelections, newChatChoice } from '@/shared/settings/declarations';
import { getSettingsStore } from '@/shared/settings/instance';

/** Saved with the agents' settings (`ui.agents`), which the Runtime keeps small. */
const MAX_SELECTIONS = 50;

/** Explicit New-menu choices only; offered levels and model defaults come from the service. */
export function readModelThoughtSelections(agent: LocalAgentId): Record<string, string> {
  const value = getSettingsStore().get(modelThoughtSelections(agent).ref());
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

export function rememberModelThoughtSelection(agent: LocalAgentId, model: string, value: string): Record<string, string> {
  const previous = { ...readModelThoughtSelections(agent) };
  delete previous[model];
  const next = Object.fromEntries([...Object.entries(previous), [model, value]].slice(-MAX_SELECTIONS));
  getSettingsStore().set(modelThoughtSelections(agent).ref(), next);
  return next;
}

/** What the + button starts next, chosen in the ▾ menu: an agent, and optionally one of its models and a thinking level. */
export interface NewChatChoice { agent: LocalAgentId; model?: string; modelName?: string | null; thoughtLevel?: string }

export function readNewChatChoice(): NewChatChoice | null {
  const value = getSettingsStore().get(newChatChoice.ref());
  if (!value) return null;
  const { agent, model, modelName, thoughtLevel } = value;
  if (typeof agent !== 'string') return null;
  return {
    agent: agent as LocalAgentId,
    ...(typeof model === 'string' ? { model } : {}),
    ...(typeof modelName === 'string' ? { modelName } : {}),
    ...(typeof thoughtLevel === 'string' ? { thoughtLevel } : {}),
  };
}

export function rememberNewChatChoice(choice: NewChatChoice): void {
  getSettingsStore().set(newChatChoice.ref(), { ...choice });
}
