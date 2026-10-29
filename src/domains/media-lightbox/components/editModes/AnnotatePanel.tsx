import React from 'react';
import { StandardEditPanelContent, type SharedEditPanelProps } from './sharedSections';

interface AnnotatePanelProps extends SharedEditPanelProps {
  handleUnifiedGenerate: () => void;
  handleGenerateAnnotatedEdit: () => void;
}

export const AnnotatePanel: React.FC<AnnotatePanelProps> = (props) => (
  <StandardEditPanelContent {...props} mode="annotate" />
);
