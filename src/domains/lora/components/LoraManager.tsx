import React from 'react';
import { ActiveLoRAsDisplay } from '@/domains/lora/components/ActiveLoRAsDisplay';
import { useLoraManager } from '@/domains/lora/hooks/useLoraManager';
import type { LoraManagerOptions, LoraManagerState } from '@/domains/lora/types/loraManager';

interface LoraManagerProps extends LoraManagerOptions {
  className?: string;
  title?: string;
  externalLoraManager?: LoraManagerState;
}

export const LoraManager: React.FC<LoraManagerProps> = ({
  className = "",
  title = "LoRA Models",
  externalLoraManager,
  ...options
}) => {
  const internalLoraManager = useLoraManager(options);
  const loraManager = externalLoraManager ?? internalLoraManager;

  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="font-light text-sm">{title}</h3>

      <ActiveLoRAsDisplay
        selectedLoras={loraManager.selectedLoras}
        onRemoveLora={loraManager.handleRemoveLora}
        onLoraStrengthChange={loraManager.handleLoraStrengthChange}
        className="mt-4"
        onAddTriggerWord={loraManager.handleAddTriggerWord}
        renderHeaderActions={loraManager.renderHeaderActions}
      />
    </div>
  );
};
