import { toast } from '@/shared/components/ui/runtime/sonner';

const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

export function filterValidTimelineImageFiles(files: File[]): File[] {
  return files.filter((file) => {
    if (VALID_IMAGE_TYPES.includes(file.type)) {
      return true;
    }
    toast.error(`Invalid file type for ${file.name}. Only JPEG, PNG, and WebP are supported.`);
    return false;
  });
}
