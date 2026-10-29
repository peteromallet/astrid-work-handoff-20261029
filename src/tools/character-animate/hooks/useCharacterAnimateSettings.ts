import { useAutoSaveSettings } from '@/shared/settings/hooks/useAutoSaveSettings';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import { characterAnimateSettings, CharacterAnimateSettings } from '../settings';

export function useCharacterAnimateSettings(projectId: string | null | undefined) {
  return useAutoSaveSettings<CharacterAnimateSettings>({
    toolId: TOOL_IDS.CHARACTER_ANIMATE,
    scope: 'project',
    projectId,
    defaults: characterAnimateSettings.defaults,
    enabled: !!projectId,
  });
}
