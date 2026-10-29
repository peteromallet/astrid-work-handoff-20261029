import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationRow } from '@/domains/generation/types';
import { useImageLightboxEnvironment } from '../useImageLightboxEnvironment';

const mocks = vi.hoisted(() => ({
  useProject: vi.fn(),
  panesState: {
    isTasksPaneOpen: false,
    tasksPaneWidth: 320,
    isTasksPaneLocked: true,
  },
  useIsMobile: vi.fn(),
  getGenerationId: vi.fn(),
  extractDimensionsFromMedia: vi.fn(),
  useChangedDepsLogger: vi.fn(),
}));

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProjectSelectionContext: (...args: unknown[]) => mocks.useProject(...args),
}));
vi.mock('@/shared/state/panesStore', () => ({
  usePanesStore: (selector: (state: typeof mocks.panesState) => unknown) => selector(mocks.panesState),
}));
vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: (...args: unknown[]) => mocks.useIsMobile(...args),
}));
vi.mock('@/shared/lib/media/mediaTypeHelpers', () => ({
  getGenerationId: (...args: unknown[]) => mocks.getGenerationId(...args),
}));
vi.mock('../../utils/dimensions', () => ({
  extractDimensionsFromMedia: (...args: unknown[]) => mocks.extractDimensionsFromMedia(...args),
}));
vi.mock('@/shared/lib/debug/debugRendering', () => ({
  useChangedDepsLogger: (...args: unknown[]) => mocks.useChangedDepsLogger(...args),
}));

function createMedia(overrides: Partial<GenerationRow> = {}): GenerationRow {
  return { id: 'media-1', parent_generation_id: 'parent-1', ...overrides } as unknown as GenerationRow;
}

describe('useImageLightboxEnvironment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useProject.mockReturnValue({ project: { aspectRatio: '16:9' }, selectedProjectId: 'project-1' });
    mocks.panesState = { isTasksPaneOpen: false, tasksPaneWidth: 320, isTasksPaneLocked: true };
    mocks.useIsMobile.mockReturnValue(true);
    mocks.getGenerationId.mockReturnValue('gen-1');
    mocks.extractDimensionsFromMedia.mockReturnValue({ width: 640, height: 360 });
  });

  it('keeps media, pane, and project display state without mounting edit hooks', () => {
    const media = createMedia();
    const { result } = renderHook(() => useImageLightboxEnvironment({
      media,
      tasksPaneOpen: true,
      tasksPaneWidth: 900,
    }));

    expect(result.current.selectedProjectId).toBe('project-1');
    expect(result.current.projectAspectRatio).toBe('16:9');
    expect(result.current.isMobile).toBe(true);
    expect(result.current.isTasksPaneLocked).toBe(true);
    expect(result.current.effectiveTasksPaneOpen).toBe(true);
    expect(result.current.effectiveTasksPaneWidth).toBe(900);
    expect(result.current.actualGenerationId).toBe('gen-1');
    expect(result.current.variantFetchGenerationId).toBe('parent-1');
    expect(result.current.imageDimensions).toEqual({ width: 640, height: 360 });
    expect(result.current).not.toHaveProperty('upscaleHook');
    expect(result.current).not.toHaveProperty('editSettingsPersistence');
  });

  it('falls back to context pane values and updates dimensions when media changes', () => {
    mocks.extractDimensionsFromMedia.mockImplementation((media: GenerationRow) =>
      media.id === 'media-2' ? { width: 1024, height: 512 } : { width: 640, height: 360 },
    );
    const { result, rerender } = renderHook(
      (props: { media: GenerationRow }) => useImageLightboxEnvironment({ media: props.media }),
      { initialProps: { media: createMedia({ parent_generation_id: undefined }) } },
    );

    expect(result.current.effectiveTasksPaneOpen).toBe(false);
    expect(result.current.effectiveTasksPaneWidth).toBe(320);
    expect(result.current.variantFetchGenerationId).toBe('gen-1');
    expect(result.current.imageDimensions).toEqual({ width: 640, height: 360 });

    rerender({ media: createMedia({ id: 'media-2', parent_generation_id: undefined }) });
    expect(result.current.imageDimensions).toEqual({ width: 1024, height: 512 });
  });
});
