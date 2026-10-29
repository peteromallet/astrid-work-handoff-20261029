import React from 'react';
import type { GeneratedImageWithMetadata } from '@/shared/components/MediaGallery/types';

interface DraggableImageProps {
  image: GeneratedImageWithMetadata;
  children: React.ReactNode;
  onDoubleClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const DraggableImage: React.FC<DraggableImageProps> = ({ children, onDoubleClick }) => {
  // Drag temporarily disabled: render a non-draggable wrapper
  return (
    <div draggable={false} onDoubleClick={onDoubleClick}>
      {children}
    </div>
  );
};
