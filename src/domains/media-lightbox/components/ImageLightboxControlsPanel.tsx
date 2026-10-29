import React from 'react';
import type { TaskDetailsData } from '../types';
import { InfoPanel } from './InfoPanel';

interface ImageLightboxControlsPanelProps {
  taskDetailsData?: TaskDetailsData;
  showPanel: boolean;
  panelVariant: 'desktop' | 'mobile';
  panelTaskId: string | null;
}

export const ImageLightboxControlsPanel = React.memo(function ImageLightboxControlsPanel({
  taskDetailsData,
  showPanel,
  panelVariant,
  panelTaskId,
}: ImageLightboxControlsPanelProps) {
  if (!showPanel) return null;

  return (
    <InfoPanel
      variant={panelVariant}
      taskPanel={{ taskDetailsData }}
      taskId={panelTaskId}
    />
  );
});
