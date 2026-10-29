import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { localAgentIdSchema, type LocalAgentId, type LocalAgentModels } from './localAgents.ts';

const savedState = z.strictObject({
  defaultAgent: localAgentIdSchema,
  defaults: z.partialRecord(localAgentIdSchema, z.string().min(1)),
  hiddenSessions: z.array(z.string().min(1)),
});

/** Service preferences and internal native sessions survive a service restart. */
export class AgentModelState {
  readonly catalogs = new Map<LocalAgentId, LocalAgentModels>();
  readonly hiddenSessions = new Set<string>();
  readonly defaults = new Map<LocalAgentId, string>();
  defaultAgent: LocalAgentId = 'astrid';

  constructor(private readonly path?: string) {
    if (!path) return;
    let raw: string;
    try { raw = readFileSync(path, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    const state = savedState.parse(JSON.parse(raw));
    this.defaultAgent = state.defaultAgent;
    for (const [agent, model] of Object.entries(state.defaults)) if (model) this.defaults.set(agent as LocalAgentId, model);
    for (const id of state.hiddenSessions) this.hiddenSessions.add(id);
  }

  refresh(agent: LocalAgentId, models: LocalAgentModels | null): void {
    if (!models) { this.catalogs.delete(agent); return; }
    const previous = this.catalogs.get(agent);
    this.catalogs.set(agent, { ...models, availableModels: models.availableModels.map(model => {
      const thoughtLevel = model.modelId === models.currentModelId ? models.thoughtLevel
        : previous?.availableModels.find(item => item.modelId === model.modelId)?.thoughtLevel;
      return { ...model, thoughtLevel };
    }) });
    if (!models.availableModels.some(model => model.modelId === this.defaults.get(agent))) {
      const fallback = models.availableModels.find(model => model.modelId === models.currentModelId)?.modelId
        ?? models.availableModels[0]?.modelId;
      if (fallback) this.defaults.set(agent, fallback);
      else this.defaults.delete(agent);
    }
  }

  remember(agent: LocalAgentId, model?: string): void {
    this.defaultAgent = agent;
    if (model) this.defaults.set(agent, model);
    this.save();
  }

  hide(id: string): void {
    this.hiddenSessions.add(id);
    // Save before cleanup: session/close need not delete a native transcript.
    this.save();
  }

  private save(): void {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify({ defaultAgent: this.defaultAgent, defaults: Object.fromEntries(this.defaults), hiddenSessions: [...this.hiddenSessions] }), { mode: 0o600, flag: 'wx' });
      renameSync(temporary, this.path);
    } finally { rmSync(temporary, { force: true }); }
  }
}
