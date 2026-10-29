/**
 * VariantOverlayBadge - Displays variant status
 *
 * Shows at top-center of the lightbox a "Main variant" badge when viewing
 * the primary variant of a generation that has several variants.
 *
 * Can be used in two modes:
 * 1. Props mode: Pass all props explicitly (legacy usage)
 * 2. Context mode: Uses LightboxStateContext via hooks (preferred)
 */

import React from 'react';
import { Check } from 'lucide-react';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';
import { useLightboxVariantsSafe, useLightboxCoreSafe } from '../../contexts/LightboxStateContext';

interface VariantOverlayBadgeProps {
  // All props are optional - uses context if not provided
  activeVariant?: GenerationVariant | undefined;
  variants?: GenerationVariant[] | undefined;
  readOnly?: boolean;
}

export const VariantOverlayBadge: React.FC<VariantOverlayBadgeProps> = ({
  activeVariant: activeVariantProp,
  variants: variantsProp,
  readOnly: readOnlyProp,
}) => {
  // Get values from context (safe versions return defaults if outside provider)
  const core = useLightboxCoreSafe();
  const variantsContext = useLightboxVariantsSafe();

  // Use props if provided, otherwise fall back to context
  const activeVariant = activeVariantProp ?? variantsContext.activeVariant;
  const variants = variantsProp ?? variantsContext.variants;
  const readOnly = readOnlyProp ?? core.readOnly;

  if (readOnly || !activeVariant || !variants) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-2 select-none"
      onClick={(e) => e.stopPropagation()}
    >
        {/* Main variant badge - only show when multiple variants exist */}
        {variants.length > 1 && activeVariant.is_primary && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-green-500/90 text-white text-sm font-medium shadow-lg">
            <Check className="w-4 h-4" />
            <span>Main variant</span>
          </div>
        )}
    </div>
  );
};
