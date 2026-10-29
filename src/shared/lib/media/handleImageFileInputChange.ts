import type React from 'react';

export function handleImageFileInputChange(
  event: React.ChangeEvent<HTMLInputElement>,
  onImageUpload: (files: File[]) => void,
): void {
  const files = Array.from(event.target.files || []);
  if (files.length > 0) {
    onImageUpload(files);
    event.target.value = '';
  }
}
