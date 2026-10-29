import React from 'react';
import { StandardEditPanelContent, type SharedEditPanelProps } from './sharedSections';

interface TextEditPanelProps extends SharedEditPanelProps {
  handleUnifiedGenerate: () => void;
  handleGenerateAnnotatedEdit: () => void;
}

export const TextEditPanel: React.FC<TextEditPanelProps> = (props) => (
  <StandardEditPanelContent {...props} mode="text" />
);
