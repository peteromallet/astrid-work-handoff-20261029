import type { ReactNode } from 'react';
import type { ActiveLora } from './lora';

export interface ExplicitLoraEditEvent {
  kind: 'remove' | 'strength';
  lora: ActiveLora | null;
  current: ActiveLora[];
}

export interface LoraManagerOptions {
  projectId?: string;
  shotId?: string;
  selectedLoras?: ActiveLora[];
  onSelectedLorasChange?: (loras: ActiveLora[]) => void;
  onExplicitLoraEdit?: (event: ExplicitLoraEditEvent) => void;
  persistenceScope?: 'project' | 'shot' | 'none';
  enableProjectPersistence?: boolean;
  persistenceKey?: string;
  disableAutoLoad?: boolean;
  enableTriggerWords?: boolean;
  onPromptUpdate?: (newPrompt: string) => void;
  currentPrompt?: string;
}

export interface LoraManagerState {
  selectedLoras: ActiveLora[];
  setSelectedLoras: (loras: ActiveLora[]) => void;
  handleRemoveLora: (loraId: string, isManualAction?: boolean) => void;
  handleLoraStrengthChange: (loraId: string, strength: number, isManualAction?: boolean) => void;
  hasEverSetLoras: boolean;
  shouldApplyDefaults: boolean;
  markAsUserSet: () => void;
  handleAddTriggerWord?: (triggerWord: string) => void;
  handleSaveProjectLoras?: () => Promise<void>;
  handleLoadProjectLoras?: () => Promise<void>;
  hasSavedLoras?: boolean;
  isSavingLoras?: boolean;
  saveSuccess?: boolean;
  saveFlash?: boolean;
  renderHeaderActions?: () => ReactNode;
}
