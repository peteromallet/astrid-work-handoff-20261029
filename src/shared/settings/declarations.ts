import { defineSetting } from './defineSetting';

/**
 * Every setting the app saves, declared once. Adding one is a line here plus `useSetting(declaration)`.
 * User settings follow the person across browsers (the Runtime's `ui.<first id segment>` record); timeline settings
 * are kept per timeline; device settings stay in this browser's localStorage.
 */

const isBoolean = (value: unknown): boolean => typeof value === 'boolean';

/** The Tasks (Activity) pane lock the user last chose. `null` means nothing saved yet (desktop then opens it locked). */
export const tasksPaneLocked = defineSetting<boolean | null>({
  id: 'panes.tasks.locked',
  default: null,
  scope: 'user',
  validate: isBoolean,
  legacyKey: 'astrid.tasks-pane-locked.v1',
});

/** `chat` = compact tasks; `split` = tasks pinned at their normal half height. */
export const tasksPaneExpandedHalf = defineSetting<'chat' | 'split'>({
  id: 'panes.tasks.expandedHalf',
  default: 'chat',
  scope: 'user',
  validate: (value) => value === 'chat' || value === 'split',
  legacyKey: 'tasksPane:expandedHalf',
  legacyParse: (raw) => (raw === 'split' || raw === 'tasks' ? 'split' : 'chat'),
});

export const tasksPaneRuntimeHistoryPinned = defineSetting({
  id: 'panes.tasks.runtimeHistoryPinned',
  default: false,
  scope: 'user',
  legacyKey: 'tasksPane:runtimeHistoryPinned',
  legacyParse: (raw) => raw === 'pinned',
});

/** The editor's per-timeline preferences (zoom, right panel, dock slots, data lanes, asset filters). */
export const EDITOR_PREFERENCES_LEGACY_PREFIX = 'video-editor:preferences:';
export const editorPreferences = defineSetting<Record<string, unknown>>({
  id: 'timeline.preferences',
  default: {},
  scope: 'timeline',
  legacyKey: (timelineId) => `${EDITOR_PREFERENCES_LEGACY_PREFIX}${timelineId}`,
});

/** Built-in extensions switched off (their ids). */
export const disabledBuiltInExtensions = defineSetting<string[]>({
  id: 'extensions.disabled',
  default: [],
  scope: 'user',
  legacyKey: 'astrid.dev-extensions.disabled',
});

/** What the New chat button starts next: an agent, and optionally one of its models and a thinking level. */
export const newChatChoice = defineSetting<Record<string, unknown> | null>({
  id: 'agents.newChatChoice',
  default: null,
  scope: 'user',
  validate: (value) => value === null || (typeof value === 'object' && !Array.isArray(value)),
  legacyKey: 'astrid.app.newChatChoice',
});

const modelThoughtSelectionDeclarations = new Map<string, ReturnType<typeof defineModelThoughtSelections>>();
function defineModelThoughtSelections(agent: string) {
  return defineSetting<Record<string, string>>({
    id: `agents.thoughts.${agent}`,
    default: {},
    scope: 'user',
    legacyKey: `astrid.app.modelThoughtSelections.${agent}`,
  });
}
/** The thinking level chosen per model, one record per agent. */
export function modelThoughtSelections(agent: string) {
  let declaration = modelThoughtSelectionDeclarations.get(agent);
  if (!declaration) {
    declaration = defineModelThoughtSelections(agent);
    modelThoughtSelectionDeclarations.set(agent, declaration);
  }
  return declaration;
}

/** The chat's "talk to Astrid from your terminal" note shows by itself once per browser; the chat menu reopens it. */
export const terminalNudgeSeen = defineSetting({
  id: 'device.agentTerminalNudgeSeen',
  default: false,
  scope: 'device',
});

/** The time of day the app is painted for; `null` follows the sky. Mirrored to `theme-hour` for the boot script. */
export const themeHour = defineSetting<number | null>({
  id: 'preferences.themeHour',
  default: null,
  scope: 'user',
  validate: (value) => value === null || (typeof value === 'number' && Number.isFinite(value)),
  mirrorKey: 'theme-hour',
});

/** The sky preview's environment toggle: this device only. */
export const skyPreviewEnvironment = defineSetting({
  id: 'device.skyPreviewEnvironment',
  default: true,
  scope: 'device',
  deviceKey: 'theme-include-environment',
});
