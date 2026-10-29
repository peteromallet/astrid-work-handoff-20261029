import React from 'react';
import { ImageUpscaleForm } from '../ImageUpscaleForm';

interface UpscalePanelProps {
  variant: 'desktop' | 'mobile';
  onUpscale: () => Promise<void>;
  isUpscaling: boolean;
  upscaleSuccess: boolean;
}

export const UpscalePanel: React.FC<UpscalePanelProps> = ({
  variant,
  onUpscale,
  isUpscaling,
  upscaleSuccess,
}) => (
  <ImageUpscaleForm
    onUpscale={onUpscale}
    isUpscaling={isUpscaling}
    upscaleSuccess={upscaleSuccess}
    variant={variant}
  />
);
