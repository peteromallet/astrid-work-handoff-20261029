import React, {
  useMemo,
  useCallback
} from 'react';
import { useFileDragTracking } from '@/shared/hooks/useFileDragTracking';
import { preventDefaultDragOver, createSingleFileDropHandler } from '@/shared/lib/dnd/dragDropUpload';
import { useProjectCrudContext, useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import {
  ImageIcon
} from 'lucide-react';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { GenerationRow } from '@/domains/generation/types';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { useAsyncOperation } from '@/shared/hooks/async/useAsyncOperation';
import { useCloudBackendNotice } from '@/shared/hooks/async/useCloudBackendNotice';
import { requireCloudBackend } from '@/shared/lib/cloudBackend';
import { CloudBackendNotice } from '@/shared/components/CloudBackendNotice';
import { InlineEditView } from '../components/InlineEditView';
import { cn } from '@/shared/components/ui/contracts/cn';
import { useIsMobile } from '@/shared/hooks/mobile';
import { parseRatio } from '@/shared/lib/media/aspectRatios';
import { MediaSelectionPanel } from '@/shared/components/MediaSelectionPanel';
import { useEditToolMediaPersistence } from '@/shared/hooks/media/useEditToolMediaPersistence';
import { EditMediaSelectionLayout } from '@/shared/editMedia/EditMediaSelectionLayout';
import { navigateToGenerationById } from '@/domains/generation/navigation';
import { mediaCrossOrigin } from '@/shared/lib/media/mediaCrossOrigin';

// Preload image helper - warm up the browser cache
const preloadedImageRef = { current: null as string | null };
const preloadImage = (gen: GenerationRow) => {
  const imageUrl = gen.location || gen.imageUrl || gen.thumbUrl;
  if (!imageUrl || preloadedImageRef.current === imageUrl) return;
  const img = new Image();
  img.crossOrigin = mediaCrossOrigin(imageUrl) ?? null;
  img.src = imageUrl;
  preloadedImageRef.current = imageUrl;
};

export default function EditImagesPage() {
  const { selectedProjectId } = useProjectSelectionContext();
  const { projects } = useProjectCrudContext();

  // Get project aspect ratio for skeleton sizing
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = selectedProject?.aspectRatio || '16:9';
  const aspectRatioValue = parseRatio(projectAspectRatio);

  // Upload operation with automatic loading state
  const uploadOperation = useAsyncOperation<GenerationRow | undefined>();
  const { isDraggingOver, handleDragEnter, handleDragLeave, resetDrag: resetDragState } = useFileDragTracking();
  const isMobile = useIsMobile();

  // Selected media for the editor
  const {
    selectedMedia,
    setSelectedMedia,
    handleEditorClose,
    showSkeleton,
  } = useEditToolMediaPersistence({
    settingsToolId: 'edit-images-ui',
    projectId: selectedProjectId ?? undefined,
  });
  // Shared upload logic for both file input and drag-drop
  const { unavailable: cloudBackendUnavailable, attempt: attemptCloudBackend } = useCloudBackendNotice();
  const uploadImage = useCallback(
    async (_file: File): Promise<GenerationRow | undefined> =>
      attemptCloudBackend<GenerationRow>(() => requireCloudBackend('edit-images upload')),
    [attemptCloudBackend],
  );

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    if (!selectedProjectId) {
      toast.error("Please select a project first");
      return;
    }

    const result = await uploadOperation.execute(
      () => uploadImage(files[0]),
      { context: 'EditImagesPage', toastTitle: 'Failed to upload image' }
    );
    if (result) {
      setSelectedMedia(result);
    }
  };

  const isEditingOnMobile = selectedMedia && isMobile;

  // Drag and drop handlers
  const handleDragOver = preventDefaultDragOver;

  const handleDrop = useMemo(() =>
    createSingleFileDropHandler({
      mimePrefix: 'image/',
      mimeErrorMessage: "Please drop an image file",
      resetDrag: resetDragState,
      getProjectId: () => selectedProjectId ?? undefined,
      upload: (file) => uploadImage(file),
      onResult: (result) => result && setSelectedMedia(result),
      context: 'EditImagesPage',
      toastTitle: 'Failed to upload image',
      uploadOperation,
    }),
    [selectedProjectId, resetDragState, uploadOperation, uploadImage, setSelectedMedia]
  );

  const handleNavigateToGeneration = useCallback(async (generationId: string) => {
    await navigateToGenerationById(generationId, {
      context: 'EditImagesPage',
      onResolved: (generation) => setSelectedMedia(generation),
    });
  }, [setSelectedMedia]);

  return (
    <div 
      className={cn(
        "w-full flex flex-col relative",
        "min-h-[calc(100dvh-96px)]"
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="px-4 pt-6 pb-6 max-w-7xl mx-auto w-full">
        <h1 className="text-3xl font-light tracking-tight text-foreground">Edit Images</h1>
        {cloudBackendUnavailable && <CloudBackendNotice toolName="Edit Images" />}
      </div>
      
      {/* Show skeleton when loading settings, loading persisted media, OR we have a stored ID but no media yet (and user didn't just close it) */}
      {showSkeleton && (
        <div className="w-full px-4 overflow-y-auto" style={{ minHeight: 'calc(100dvh - 96px)' }}>
          <div className="max-w-7xl mx-auto relative">
            <div className={cn(
              "rounded-2xl overflow-hidden bg-black",
              isEditingOnMobile ? "flex flex-col min-h-[72vh]" : "h-[calc(100dvh-190px)]"
            )}>
              {isMobile ? (
                // Mobile: Match InlineEditView mobile layout (45dvh height)
                <div 
                  className="flex items-center justify-center relative bg-black w-full shrink-0 rounded-t-2xl overflow-hidden"
                  style={{ height: '45dvh' }}
                >
                  <Skeleton 
                    className="rounded-lg"
                    style={{ 
                      aspectRatio: aspectRatioValue,
                      maxWidth: '100%',
                      maxHeight: '100%',
                      width: aspectRatioValue >= 1 ? '90%' : 'auto',
                      height: aspectRatioValue >= 1 ? 'auto' : '90%'
                    }} 
                  />
                </div>
              ) : (
                // Desktop: Match InlineEditView desktop layout (60% width, 100% height)
                <div className="w-full h-full flex bg-transparent overflow-hidden">
                  <div 
                    className="flex-1 flex items-center justify-center relative bg-black rounded-l-xl overflow-hidden"
                    style={{ width: '60%', height: '100%' }}
                  >
                    <Skeleton 
                      className="rounded-lg"
                      style={{ 
                        aspectRatio: aspectRatioValue,
                        maxWidth: '90%',
                        maxHeight: '90%',
                        width: aspectRatioValue >= 1 ? '80%' : 'auto',
                        height: aspectRatioValue >= 1 ? 'auto' : '80%'
                      }} 
                    />
                  </div>
                  {/* Right panel skeleton for controls */}
                  <div className="w-[40%] bg-background border-l border-border p-4">
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-24 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {!selectedMedia && !showSkeleton && (
        <EditMediaSelectionLayout
          isMobile={Boolean(isMobile)}
          isDraggingOver={isDraggingOver}
          isUploading={uploadOperation.isLoading}
          dropIcon={ImageIcon}
          dropLabel="Drop image to upload"
          uploadLabel="Upload Image"
          uploadingLabel="Uploading image..."
          mobileHint="Select or upload an image"
          desktopHint="Select an image from the right or upload a new one to start editing."
          accept="image/*"
          onFileUpload={handleFileUpload}
          rightPanel={(
            <ImageSelectionModal
              onSelect={(media) => {
                preloadImage(media);
                setSelectedMedia(media);
              }}
            />
          )}
        />
      )}
      
      {selectedMedia && (
        <div className="w-full px-4 pb-6 overflow-y-auto" style={{ minHeight: 'calc(100dvh - 96px)' }}>
          <div className="max-w-7xl mx-auto relative">
            <div className={cn(
              "rounded-2xl overflow-hidden",
              isEditingOnMobile ? "flex flex-col min-h-[72vh]" : "h-[calc(100dvh-190px)]"
            )}>
              <InlineEditView
                media={selectedMedia}
                onClose={handleEditorClose}
                onNavigateToGeneration={handleNavigateToGeneration}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageSelectionModal({ onSelect }: { onSelect: (media: GenerationRow) => void }) {
  return <MediaSelectionPanel onSelect={onSelect} mediaType="image" />;
}
