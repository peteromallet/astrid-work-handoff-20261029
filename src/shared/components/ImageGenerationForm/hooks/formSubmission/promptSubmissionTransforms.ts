import { truncateText } from '@/shared/lib/stringFormatting';

export function truncateLabel(text: string): string {
  return truncateText(text, 50);
}
