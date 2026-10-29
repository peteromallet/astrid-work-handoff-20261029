# Shared → Tools Import Cleanup

## Status: COMPLETED ✅

All phases executed. ESLint rule in place to prevent new violations.

---

## Summary

**Before:** 49+ files in `src/shared/` importing from `src/tools/`
**After:** 18 files with documented, necessary exceptions

### What Was Done

**Phase 1: Types moved to shared/**
- [x] `shared/types/phaseConfig.ts` - PhaseConfig, PhaseSettings, PhaseLoraConfig, defaults
- [x] `shared/types/steerableMotion.ts` - SteerableMotionSettings, GenerationsPaneSettings
- [x] `shared/types/taskDetailsTypes.ts` - TaskDetailsProps, VariantConfig, getVariantConfig

**Phase 2: Utilities moved to shared/**
- [x] `shared/lib/videoUtils.ts` - Frame/time utilities (FPS, quantizeFrameCount, etc.)
- [x] `shared/lib/loraUtils.ts` - LoRA display utilities (PREDEFINED_LORAS, getDisplayNameFromUrl)
- [x] `shared/lib/galleryUtils.ts` - extractSegmentImages, SegmentImageInfo
- [x] `shared/lib/storageKeys.ts` - STORAGE_KEYS for settings persistence
- [x] `shared/utils/taskParamsUtils.ts` - Added isImageEditTaskType, isVideoEnhanceTaskType

**Phase 3: Components moved to tools/**
- [x] `VideoGenerationModal` → `tools/travel-between-images/components/`
- [x] `PromptEditorModal` → `tools/image-generation/components/`

**Phase 4: Documented Exceptions**
Components that legitimately need tool-specific code (with eslint-disable comments):
- ShotImageManager - needs SegmentSlot, PairData, InlineSegmentVideo for video segments
- MediaLightbox - needs VideoTrimEditor, VariantSelector, TaskDetailsPanel for video editing
- GenerationDetails - needs task-type-specific detail components
- MotionPresetSelector - needs PhaseConfigVertical for motion config display
- ImageGenerationModal - wraps ImageGenerationForm for shared access
- MediaGalleryLightbox - needs TaskDetailsModal

**Phase 5: ESLint Rule Added**
```javascript
// eslint.config.js - Prevents new violations
{
  files: ["src/shared/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [{
        group: ["@/tools/*", "**/tools/*"],
        message: "shared/ cannot import from tools/..."
      }]
    }]
  }
}
```

---

## Documented Exceptions (18 files)

These exceptions exist because shared components need to render/use tool-specific features:

### ShotImageManager (6 files)
Used by `pages/ShotsPage.tsx` and multiple tools. Needs:
- `SegmentSlot` type - video segment slot display
- `PairData` type - timeline pair data
- `InlineSegmentVideo` - inline video segment display
- `useSegmentOutputsForShot` - hook for segment data

### MediaLightbox (7 files)
Cross-cutting lightbox that composes features from travel-between-images, image-generation, and edit-video:
- `VideoTrimEditor/*` - video trimming UI
- `VariantSelector` - variant selection UI
- `TaskDetailsPanel` - task details display
- `useEditVideoSettings` - edit-video settings hook
- `ReferenceImage` type - image-generation type

### Other (5 files)
- `GenerationDetails` - routes to tool-specific task detail components
- `MotionPresetSelector` - needs PhaseConfigVertical for preset display
- `ImageGenerationModal` - wraps ImageGenerationForm for shared access
- `MediaGalleryLightbox` - needs TaskDetailsModal

---

## Verification

```bash
# No new violations (all existing have eslint-disable)
npx eslint src/shared --max-warnings 0 | grep "no-restricted-imports"

# TypeScript compiles
npx tsc --noEmit

# Count exceptions
grep -r "from '@/tools/" src/shared/ | wc -l  # Should be 18
```

---

## Future Improvements (Optional)

If these exceptions become problematic, consider:

1. **Render props pattern** - MediaLightbox could accept render props for tool-specific panels
2. **Move to app/** - Cross-cutting components like MediaLightbox could move to `app/components/`
3. **Registry pattern** - Tools could register their detail components instead of direct imports

These weren't implemented because the current exceptions are stable and well-documented.
