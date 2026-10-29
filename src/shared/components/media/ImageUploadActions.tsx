import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/primitives/label';
import { ImageGenerationModal } from '@/shared/components/modals/ImageGenerationModal';
import { handleImageFileInputChange } from '@/shared/lib/media/handleImageFileInputChange';

interface ImageUploadActionsProps {
  /** Callback when files are selected via the file input */
  onImageUpload: (files: File[]) => Promise<void>;
  /** Whether an upload is currently in progress */
  isUploadingImage?: boolean;
  /** Optional shot ID to pre-select in the generation modal */
  shotId?: string;
  /** Unique ID for the file input (required for label association) */
  inputId: string;
  /** Button size variant - 'sm' for compact, 'default' for standard */
  buttonSize?: 'sm' | 'default';
}

/**
 * Shared component for image upload actions: file upload button + generate button + modal.
 * Used in empty states across Timeline and ShotImageManager.
 */
export const ImageUploadActions: React.FC<ImageUploadActionsProps> = ({
  onImageUpload,
  isUploadingImage,
  shotId,
  inputId,
  buttonSize = 'sm',
}) => {
  const [isGenerationModalOpen, setIsGenerationModalOpen] = useState(false);

  return (
    <>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handleImageFileInputChange(e, (files) => {
          void onImageUpload(files);
        })}
        className="hidden"
        id={inputId}
        disabled={isUploadingImage}
      />

      <div className="flex gap-2 w-full">
        <Label htmlFor={inputId} className="m-0 cursor-pointer flex-1">
          <Button
            variant="outline"
            size={buttonSize}
            disabled={isUploadingImage}
            className="w-full"
            asChild
          >
            <span>
              {isUploadingImage ? 'Uploading...' : 'Upload Images'}
            </span>
          </Button>
        </Label>

        <Button
          variant="retro"
          size="retro-sm"
          onClick={() => setIsGenerationModalOpen(true)}
          className="flex-1"
        >
          Start generating
        </Button>
      </div>

      {/* Image Generation Modal */}
      <ImageGenerationModal
        isOpen={isGenerationModalOpen}
        onClose={() => setIsGenerationModalOpen(false)}
        initialShotId={shotId}
      />
    </>
  );
};
