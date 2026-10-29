import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InlineEditStateResult } from '../hooks/useInlineEditState';
import { EditModePanel } from '@/domains/media-lightbox/components/EditModePanel';
import { InlineEditView } from './InlineEditView';

const mockUseInlineEditState = vi.fn();
const mockUseEditModePanelState = vi.fn();
const variantSelectorSpy = vi.fn();
const textEditPanelSpy = vi.fn();
const inpaintPanelSpy = vi.fn();
const annotatePanelSpy = vi.fn();
const repositionPanelSpy = vi.fn();
const img2imgPanelSpy = vi.fn();
const upscalePanelSpy = vi.fn();
let currentEditMode: 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img' | 'upscale' = 'text';

vi.mock('../hooks/useInlineEditState', () => ({
  useInlineEditState: (...args: unknown[]) => mockUseInlineEditState(...args),
}));

vi.mock('@/domains/media-lightbox/hooks/useEditModePanelState', () => ({
  useEditModePanelState: (...args: unknown[]) => mockUseEditModePanelState(...args),
}));

vi.mock('@/domains/media-lightbox/components/MediaDisplayWithCanvas', () => ({
  MediaDisplayWithCanvas: () => <div data-testid="media-display">media</div>,
}));

vi.mock('@/domains/media-lightbox/components/ButtonGroups', () => ({
  TopRightControls: () => <div data-testid="top-right-controls" />,
  BottomRightControls: () => <div data-testid="bottom-right-controls" />,
}));

vi.mock('@/domains/media-lightbox/components/FloatingToolControls', () => ({
  FloatingToolControls: () => <div data-testid="floating-tool-controls" />,
}));

vi.mock('@/domains/media-lightbox/components/AnnotationFloatingControls', () => ({
  AnnotationFloatingControls: () => <div data-testid="annotation-controls" />,
}));

vi.mock('@/domains/media-lightbox/components/ModeSelector', () => ({
  ModeSelector: () => <div data-testid="mode-selector" />,
}));

vi.mock('@/domains/media-lightbox/components/editModes/TextEditPanel', () => ({
  TextEditPanel: (props: {
    state: { inpaintPrompt: string };
    handleUnifiedGenerate: () => void;
  }) => {
    textEditPanelSpy(props);
    return (
      <div data-testid="text-edit-panel">
        <span data-testid="text-prompt">{props.state.inpaintPrompt}</span>
        <button type="button" onClick={props.handleUnifiedGenerate}>
          text-generate
        </button>
      </div>
    );
  },
}));

vi.mock('@/domains/media-lightbox/components/editModes/InpaintPanel', () => ({
  InpaintPanel: (props: {
    state: { inpaintPrompt: string };
    handleUnifiedGenerate: () => void;
  }) => {
    inpaintPanelSpy(props);
    return (
      <div data-testid="inpaint-panel">
        <span data-testid="inpaint-prompt">{props.state.inpaintPrompt}</span>
        <button type="button" onClick={props.handleUnifiedGenerate}>
          inpaint-generate
        </button>
      </div>
    );
  },
}));

vi.mock('@/domains/media-lightbox/components/editModes/AnnotatePanel', () => ({
  AnnotatePanel: (props: {
    state: { inpaintPrompt: string };
    handleGenerateAnnotatedEdit: () => void;
  }) => {
    annotatePanelSpy(props);
    return (
      <div data-testid="annotate-panel">
        <span data-testid="annotate-prompt">{props.state.inpaintPrompt}</span>
        <button type="button" onClick={props.handleGenerateAnnotatedEdit}>
          annotate-generate
        </button>
      </div>
    );
  },
}));

vi.mock('@/domains/media-lightbox/components/editModes/RepositionPanel', () => ({
  RepositionPanel: (props: {
    state: { inpaintPrompt: string };
    handleGenerateReposition: () => void;
  }) => {
    repositionPanelSpy(props);
    return (
      <div data-testid="reposition-panel">
        <span data-testid="reposition-prompt">{props.state.inpaintPrompt}</span>
        <button type="button" onClick={props.handleGenerateReposition}>
          reposition-generate
        </button>
      </div>
    );
  },
}));

vi.mock('@/domains/media-lightbox/components/editModes/Img2ImgPanel', () => ({
  Img2ImgPanel: (props: {
    state: { img2imgPrompt: string };
    handleGenerateImg2Img: () => void;
  }) => {
    img2imgPanelSpy(props);
    return (
      <div data-testid="img2img-panel">
        <span data-testid="img2img-prompt">{props.state.img2imgPrompt}</span>
        <button type="button" onClick={props.handleGenerateImg2Img}>
          img2img-generate
        </button>
      </div>
    );
  },
}));

vi.mock('@/domains/media-lightbox/components/editModes/UpscalePanel', () => ({
  UpscalePanel: (props: {
    onUpscale: () => Promise<void>;
  }) => {
    upscalePanelSpy(props);
    return (
      <div data-testid="upscale-panel">
        <button type="button" onClick={() => void props.onUpscale()}>
          upscale-generate
        </button>
      </div>
    );
  },
}));

vi.mock('@/domains/lora/components', () => ({
  LoraSelectorModal: () => null,
}));

vi.mock('@/domains/media-lightbox/components/PanelHeaderControls', () => ({
  PanelHeaderMeta: () => <div data-testid="panel-header-meta" />,
  PanelCloseButton: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>
      close-panel
    </button>
  ),
}));

vi.mock('@/shared/components/VariantSelector', () => ({
  VariantSelector: (props: {
    variants: Array<{ id: string }>;
    onVariantSelect: (variantId: string) => void;
    onMakePrimary?: (variantId: string) => Promise<void>;
    onDeleteVariant?: (variantId: string) => Promise<void>;
  }) => {
    variantSelectorSpy(props);
    return (
      <div data-testid="variant-selector">
        <span>{props.variants.length} variants</span>
        <button type="button" onClick={() => props.onVariantSelect('variant-2')}>
          select-variant
        </button>
        <button type="button" onClick={() => props.onMakePrimary?.('variant-2')}>
          primary-variant
        </button>
        <button type="button" onClick={() => props.onDeleteVariant?.('variant-2')}>
          delete-variant
        </button>
      </div>
    );
  },
}));

const variantA = {
  id: 'variant-1',
  generation_id: 'gen-1',
  params: {},
  is_primary: true,
  starred: false,
} as InlineEditStateResult['variants']['variants'][number];

const variantB = {
  id: 'variant-2',
  generation_id: 'gen-1',
  params: {},
  is_primary: false,
  starred: false,
} as InlineEditStateResult['variants']['variants'][number];

function createInlineEditState(): InlineEditStateResult {
  const flushTextFields = vi.fn().mockResolvedValue(undefined);
  return {
    media: { id: 'gen-1' },
    canvasEnvironment: {
      isMobile: false,
      isCloudMode: true,
      effectiveImageUrl: 'https://example.com/image.png',
      isVideo: false,
      imageDimensions: null,
      setImageDimensions: vi.fn(),
    },
    inpaintingState: {
      selectedShapeId: null,
      isAnnotateMode: false,
      brushStrokes: [],
      getDeleteButtonPosition: vi.fn(),
      handleToggleFreeForm: vi.fn(),
      handleDeleteSelected: vi.fn(),
      isSpecialEditMode: true,
      setIsInpaintMode: vi.fn(),
      setEditMode: vi.fn(),
      handleEnterMagicEditMode: vi.fn(),
    },
    generationState: {
      handleDownload: vi.fn(),
      handleUnifiedGenerate: vi.fn(),
      handleGenerateAnnotatedEdit: vi.fn(),
      handleGenerateReposition: vi.fn(),
      handleGenerateImg2Img: vi.fn(),
      img2imgLoraManager: undefined,
    },
    cloudBackendUnavailable: false,
    imageEditValue: { kind: 'image-edit-value', flushTextFields },
    variants: {
      variants: [variantA, variantB],
      activeVariant: variantA,
      isLoading: false,
      setActiveVariantId: vi.fn(),
      setPrimaryVariant: vi.fn(),
      deleteVariant: vi.fn(),
    },
  } as unknown as InlineEditStateResult;
}

describe('InlineEditView', () => {
  beforeEach(() => {
    variantSelectorSpy.mockClear();
    textEditPanelSpy.mockClear();
    inpaintPanelSpy.mockClear();
    annotatePanelSpy.mockClear();
    repositionPanelSpy.mockClear();
    img2imgPanelSpy.mockClear();
    upscalePanelSpy.mockClear();
    currentEditMode = 'text';
    mockUseInlineEditState.mockReset();
    mockUseEditModePanelState.mockReset();
    mockUseEditModePanelState.mockImplementation((params) => ({
      onClose: params.coreState.onClose,
      editMode: currentEditMode,
      modeSelectorItems: [],
      handleExitMagicEditMode: vi.fn(),
      variants: params.variantsState.variants,
      activeVariantId: params.variantsState.activeVariant?.id ?? null,
      onVariantSelect: params.variantsState.handleVariantSelect,
      onMakePrimary: params.variantsState.handleMakePrimary,
      isLoadingVariants: params.variantsState.isLoadingVariants ?? false,
      onDeleteVariant: params.variantsState.handleDeleteVariant,
      onLoadVariantSettings: params.variantsState.onLoadVariantSettings,
      pendingTaskCount: params.variantsState.pendingTaskCount ?? 0,
      unviewedVariantCount: params.variantsState.unviewedVariantCount ?? 0,
      onMarkAllViewed: params.variantsState.onMarkAllViewed,
      inpaintPrompt: 'persistent main prompt',
      img2imgPrompt: 'persistent img2img prompt',
    }));
  });

  it('passes explicit panel state props into EditModePanel and keeps the close button wired', () => {
    const inlineState = createInlineEditState();
    const onClose = vi.fn();
    mockUseInlineEditState.mockReturnValue(inlineState);

    render(
      <InlineEditView
        media={{ id: 'gen-1' } as never}
        onClose={onClose}
      />,
    );

    expect(mockUseEditModePanelState).toHaveBeenCalledWith(
      expect.objectContaining({
        coreState: expect.objectContaining({
          onClose: expect.any(Function),
        }),
        imageEditState: inlineState.imageEditValue,
        variantsState: expect.objectContaining({
          variants: inlineState.variants.variants,
          activeVariant: inlineState.variants.activeVariant,
          handleVariantSelect: inlineState.variants.setActiveVariantId,
          handleMakePrimary: inlineState.variants.setPrimaryVariant,
          handleDeleteVariant: inlineState.variants.deleteVariant,
        }),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'close-panel' }));
    expect(inlineState.imageEditValue.flushTextFields).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the online-account line when the LoRA library is unavailable', () => {
    mockUseInlineEditState.mockReturnValue({ ...createInlineEditState(), cloudBackendUnavailable: true });

    render(<InlineEditView media={{ id: 'gen-1' } as never} onClose={vi.fn()} />);

    expect(screen.getByTestId('cloud-backend-notice').textContent).toBe(
      "Edit Images needs an online account, which isn't available yet.",
    );
  });

  it('shows no online-account line while the backend is not needed', () => {
    mockUseInlineEditState.mockReturnValue(createInlineEditState());

    render(<InlineEditView media={{ id: 'gen-1' } as never} onClose={vi.fn()} />);

    expect(screen.queryByTestId('cloud-backend-notice')).toBeNull();
  });

  it('renders a single variant selector path and forwards variant actions', () => {
    const inlineState = createInlineEditState();
    mockUseInlineEditState.mockReturnValue(inlineState);

    render(
      <InlineEditView
        media={{ id: 'gen-1' } as never}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId('variant-selector')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'select-variant' }));
    fireEvent.click(screen.getByRole('button', { name: 'primary-variant' }));
    fireEvent.click(screen.getByRole('button', { name: 'delete-variant' }));

    expect(inlineState.variants.setActiveVariantId).toHaveBeenCalledWith('variant-2');
    expect(inlineState.variants.setPrimaryVariant).toHaveBeenCalledWith('variant-2');
    expect(inlineState.variants.deleteVariant).toHaveBeenCalledWith('variant-2');
  });

  it('renders every edit mode and keeps prompt-backed actions wired across mode switches', () => {
    const inlineState = createInlineEditState();
    const handleUpscale = vi.fn().mockResolvedValue(undefined);

    const renderPanel = () => (
      <EditModePanel
        variant="desktop"
        currentMediaId={inlineState.media.id}
        actions={{
          handleUnifiedGenerate: inlineState.generationState.handleUnifiedGenerate,
          handleGenerateAnnotatedEdit: inlineState.generationState.handleGenerateAnnotatedEdit,
          handleGenerateReposition: inlineState.generationState.handleGenerateReposition,
          handleGenerateImg2Img: inlineState.generationState.handleGenerateImg2Img,
        }}
        upscale={{
          isCloudMode: true,
          handleUpscale,
        }}
        lora={{ availableLoras: [] }}
        coreState={{ onClose: vi.fn() }}
        imageEditState={inlineState.imageEditValue}
        variantsState={{
          variants: inlineState.variants.variants,
          activeVariant: inlineState.variants.activeVariant,
          handleVariantSelect: inlineState.variants.setActiveVariantId,
          handleMakePrimary: inlineState.variants.setPrimaryVariant,
          isLoadingVariants: inlineState.variants.isLoading,
          handleDeleteVariant: inlineState.variants.deleteVariant,
          pendingTaskCount: 0,
          unviewedVariantCount: 0,
          onMarkAllViewed: vi.fn(),
        }}
      />
    );

    const { rerender } = render(renderPanel());

    expect(screen.getByTestId('text-edit-panel')).toBeTruthy();
    expect(screen.getByTestId('text-prompt').textContent).toBe('persistent main prompt');
    fireEvent.click(screen.getByRole('button', { name: 'text-generate' }));

    currentEditMode = 'inpaint';
    rerender(renderPanel());
    expect(screen.getByTestId('inpaint-panel')).toBeTruthy();
    expect(screen.getByTestId('inpaint-prompt').textContent).toBe('persistent main prompt');
    fireEvent.click(screen.getByRole('button', { name: 'inpaint-generate' }));

    currentEditMode = 'annotate';
    rerender(renderPanel());
    expect(screen.getByTestId('annotate-panel')).toBeTruthy();
    expect(screen.getByTestId('annotate-prompt').textContent).toBe('persistent main prompt');
    fireEvent.click(screen.getByRole('button', { name: 'annotate-generate' }));

    currentEditMode = 'reposition';
    rerender(renderPanel());
    expect(screen.getByTestId('reposition-panel')).toBeTruthy();
    expect(screen.getByTestId('reposition-prompt').textContent).toBe('persistent main prompt');
    fireEvent.click(screen.getByRole('button', { name: 'reposition-generate' }));

    currentEditMode = 'img2img';
    rerender(renderPanel());
    expect(screen.getByTestId('img2img-panel')).toBeTruthy();
    expect(screen.getByTestId('img2img-prompt').textContent).toBe('persistent img2img prompt');
    fireEvent.click(screen.getByRole('button', { name: 'img2img-generate' }));

    currentEditMode = 'upscale';
    rerender(renderPanel());
    expect(screen.getByTestId('upscale-panel')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'upscale-generate' }));

    expect(inlineState.generationState.handleUnifiedGenerate).toHaveBeenCalledTimes(2);
    expect(inlineState.generationState.handleGenerateAnnotatedEdit).toHaveBeenCalledTimes(1);
    expect(inlineState.generationState.handleGenerateReposition).toHaveBeenCalledTimes(1);
    expect(inlineState.generationState.handleGenerateImg2Img).toHaveBeenCalledTimes(1);
    expect(handleUpscale).toHaveBeenCalledTimes(1);
  });
});
