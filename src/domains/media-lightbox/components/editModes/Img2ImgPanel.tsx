import React from 'react';
import type { LoraManagerState } from '@/domains/lora/types/loraManager';
import type { EditModePanelState } from '../../hooks/useEditModePanelState';
import { Img2ImgControls } from './Img2ImgControls';
import { SectionLabel } from './sharedSections';

interface Img2ImgPanelProps {
  state: EditModePanelState;
  handleGenerateImg2Img: () => void;
  img2imgLoraManager?: LoraManagerState;
}

export const Img2ImgPanel: React.FC<Img2ImgPanelProps> = ({
  state,
  handleGenerateImg2Img,
  img2imgLoraManager,
}) => (
  <Img2ImgControls
    isMobile={state.isMobile}
    img2imgPrompt={state.img2imgPrompt}
    setImg2imgPrompt={state.setImg2imgPrompt}
    flushTextFields={state.flushTextFields}
    img2imgStrength={state.img2imgStrength}
    setImg2imgStrength={state.setImg2imgStrength}
    isGeneratingImg2Img={state.isGeneratingImg2Img}
    img2imgGenerateSuccess={state.img2imgGenerateSuccess}
    handleGenerateImg2Img={handleGenerateImg2Img}
    img2imgLoraManager={img2imgLoraManager}
    SectionLabel={({ children }) => <SectionLabel isMobile={state.isMobile}>{children}</SectionLabel>}
  />
);
