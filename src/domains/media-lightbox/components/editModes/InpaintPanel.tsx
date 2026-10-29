import React from 'react';
import { StandardEditPanelContent, type SharedEditPanelProps } from './sharedSections';

interface InpaintPanelProps extends SharedEditPanelProps {
  handleUnifiedGenerate: () => void;
  handleGenerateAnnotatedEdit: () => void;
}

export const InpaintPanel: React.FC<InpaintPanelProps> = (props) => (
  <StandardEditPanelContent {...props} mode="inpaint" />
);
