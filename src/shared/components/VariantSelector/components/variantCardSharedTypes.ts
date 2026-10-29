import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';

export interface VariantCardSharedProps {
  activeVariantId: string | null;
  isMobile: boolean;
  readOnly: boolean;
  copiedVariantId: string | null;
  loadedSettingsVariantId: string | null;
  onVariantSelect: (variantId: string) => void;
  onMakePrimary?: (variantId: string) => Promise<void>;
  onDeleteVariant?: (variantId: string) => void;
  onLoadVariantSettings?: (variantParams: Record<string, unknown>) => void;
  onMouseEnter: (variant: GenerationVariant) => void;
  onShowMobileInfo: (variantId: string) => void;
  onCopyId: (variantId: string) => void;
  onLoadSettings: (variant: GenerationVariant) => void;
}
