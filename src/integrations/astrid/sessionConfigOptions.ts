import { localAgentModelsSchema, type AgentThoughtLevel, type LocalAgentModels } from './localAgents.ts';

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** ACP select options may be flat or grouped (for example, OMP's providers). */
function choices(value: unknown): Array<{ value: string; name: string; description?: string | null }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const option = record(item);
    if (typeof option?.value !== 'string') return choices(option?.options);
    return [{ value: option.value, name: typeof option.name === 'string' ? option.name : option.value,
      ...(typeof option.description === 'string' || option.description === null ? { description: option.description } : {}) }];
  });
}

/** Adapters title-case raw effort IDs ("Xhigh", "HIGH"); show them in sentence case. */
function levelName(value: string, name: string): string {
  if (value.toLowerCase().replace(/[^a-z]/g, '') === 'xhigh') return 'Extra high';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/** Adapter IDs are opaque; categories identify model and thought-level controls. */
export function sessionConfigModels(value: unknown): LocalAgentModels | null {
  const response = record(value);
  const options = Array.isArray(response?.configOptions) ? response.configOptions.map(record) : [];
  const model = options.find(option => option?.category === 'model') ?? options.find(option => option?.id === 'model');
  const level = options.find(option => option?.category === 'thought_level' && option.type === 'select');
  let thoughtLevel: AgentThoughtLevel | undefined;
  if (level && typeof level.id === 'string' && typeof level.currentValue === 'string') {
    const values = choices(level.options).map(option => ({ ...option, name: levelName(option.value, option.name) }));
    const air = record(record(record(level._meta)?.jetbrains)?.air);
    const recommended = air?.recommendedValue;
    if (values.length) thoughtLevel = {
      configId: level.id, name: typeof level.name === 'string' ? level.name : 'Thinking level',
      currentValue: level.currentValue, options: values,
      ...(typeof recommended === 'string' && values.some(option => option.value === recommended) ? { recommendedValue: recommended } : {}),
    };
  }
  const models = model ? {
    availableModels: choices(model.options).map(({ value, ...option }) => ({ modelId: value, ...option })),
    currentModelId: model.currentValue,
    modelConfigId: model.id,
  } : record(response?.models);
  const parsed = localAgentModelsSchema.safeParse(models && { ...models, thoughtLevel });
  return parsed.success ? parsed.data : null;
}
