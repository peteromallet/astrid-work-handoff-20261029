import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import type { PromptEntry } from './ImageGenerationForm/types';
import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useExtraLargeModal } from '@/shared/hooks/useModal';
import { useScrollFade } from '@/shared/hooks/useScrollFade';
import { PromptEditorPromptList } from './PromptEditorModal/components/PromptEditorPromptList';
import { PromptEditorFooter } from './PromptEditorModal/components/PromptEditorFooter';
import { usePromptEditing } from './PromptEditorModal/hooks/usePromptEditing';

interface PromptEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompts: PromptEntry[];
  onSave: (updatedPrompts: PromptEntry[]) => void;
  generatePromptId: () => string;
}

const PromptEditorModal: React.FC<PromptEditorModalProps> = React.memo(({
  isOpen,
  onClose,
  prompts: initialPrompts,
  onSave,
  generatePromptId,
}) => {
  const [activePromptIdForFullView, setActivePromptIdForFullView] = useState<string | null>(null);

  const isMobile = useIsMobile();
  const modalContentRef = useRef<HTMLDivElement>(null);

  const modal = useExtraLargeModal('promptEditor');
  const { selectedProjectId } = useProjectSelectionContext();
  const { showFade, scrollRef } = useScrollFade({
    isOpen,
    debug: false,
    preloadFade: modal.isMobile,
  });

  const {
    internalPrompts,
    handleFinalSaveAndClose,
    handlePromptFieldUpdate,
    handleInternalRemovePrompt,
    handleInternalAddBlankPrompt,
    handleRemoveAllPrompts,
  } = usePromptEditing({
    isOpen,
    initialPrompts,
    onSave,
    onClose,
    scrollRef,
    selectedProjectId,
    generatePromptId,
  });

  useEffect(() => {
    if (isOpen) {
      setActivePromptIdForFullView(null);
    }
  }, [isOpen, selectedProjectId]);

  const handleInsideInteraction = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    if (!activePromptIdForFullView) {
      return;
    }

    const target = event.target as Element;
    if (modalContentRef.current && modalContentRef.current.contains(target)) {
      const clickedActiveField = target.closest(`[data-prompt-id="${activePromptIdForFullView}"]`);
      if (!clickedActiveField) {
        setActivePromptIdForFullView(null);
      }
    }
  }, [activePromptIdForFullView]);

  const handleModalClose = useCallback((open: boolean) => {
    if (!open) {
      handleFinalSaveAndClose();
    }
  }, [handleFinalSaveAndClose]);

  return (
    <Dialog open={isOpen} onOpenChange={handleModalClose}>
      <DialogContent
        className={`${modal.className} gap-2`}
        style={modal.style}
        ref={modalContentRef}
      >
        <div className={modal.headerClass}>
          <DialogHeader className={`${modal.isMobile ? 'px-2 pt-2 pb-2' : 'px-6 pt-4 pb-2'} flex-shrink-0`}>
            <DialogTitle>Prompt Editor</DialogTitle>
          </DialogHeader>
        </div>

        <div
          ref={scrollRef}
          onClickCapture={handleInsideInteraction}
          onTouchStartCapture={handleInsideInteraction}
          className={`${modal.scrollClass} ${modal.isMobile ? 'pt-2' : 'pt-6'}`}
        >
          <PromptEditorPromptList
            prompts={internalPrompts}
            isMobile={isMobile}
            activePromptIdForFullView={activePromptIdForFullView}
            onActivePromptChange={setActivePromptIdForFullView}
            onUpdatePromptField={handlePromptFieldUpdate}
            onRemovePrompt={handleInternalRemovePrompt}
          />
        </div>

        <PromptEditorFooter
          showFade={showFade}
          footerClass={modal.footerClass}
          isMobile={modal.isMobile}
          prompts={internalPrompts}
          onAddBlankPrompt={handleInternalAddBlankPrompt}
          onRemoveAllPrompts={handleRemoveAllPrompts}
          onClose={handleFinalSaveAndClose}
        />
      </DialogContent>
    </Dialog>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.isOpen === nextProps.isOpen &&
    prevProps.prompts.length === nextProps.prompts.length &&
    JSON.stringify(prevProps.prompts) === JSON.stringify(nextProps.prompts)
  );
});

export { PromptEditorModal };
