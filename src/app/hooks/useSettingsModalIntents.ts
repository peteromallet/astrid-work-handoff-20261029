import { useCallback } from 'react';
import { useAppEventListener } from '@/shared/lib/typedEvents';

interface SettingsModalIntent {
  settingsTab?: string;
}

export function useSettingsEventIntent(
  onIntent: (intent: SettingsModalIntent) => void,
): void {
  const handleOpenSettingsEvent = useCallback(({ tab }: { tab?: string }) => {
    onIntent({ settingsTab: tab });
  }, [onIntent]);

  useAppEventListener('openSettings', handleOpenSettingsEvent);
}
