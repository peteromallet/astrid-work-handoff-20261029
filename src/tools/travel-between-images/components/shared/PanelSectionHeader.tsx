import React from 'react';
import { SectionHeader } from '@/shared/components/ImageGenerationForm/components/SectionHeader';

interface PanelSectionHeaderProps {
  title: string;
  theme: 'orange' | 'purple' | 'blue' | 'green';
}

export const PanelSectionHeader: React.FC<PanelSectionHeaderProps> = ({ title, theme }) => (
  <div className="mb-4">
    <SectionHeader title={title} theme={theme} />
  </div>
);
