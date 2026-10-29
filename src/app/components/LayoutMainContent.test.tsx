import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutMainContent } from './LayoutMainContent';

let locationPathname = '/home';

const panesState = vi.hoisted(() => ({
  state: {
    isEditorPaneLocked: false,
    effectiveEditorPaneHeight: 0,
    isTasksPaneLocked: true,
    tasksPaneWidth: 320,
    isShotsPaneLocked: true,
    shotsPaneWidth: 260,
    isGenerationsPaneLocked: true,
    isGenerationsPaneOpen: false,
    effectiveGenerationsPaneHeight: 180,
  },
}));
const useHeaderStateMock = vi.fn();
const useViewportResponsiveMock = vi.fn();
const useVideoEditorRouteStateMock = vi.fn();
const appHeaderMock = vi.fn();

const defaultPanesState = {
  isTasksPaneLocked: true,
  tasksPaneWidth: 320,
  isShotsPaneLocked: true,
  shotsPaneWidth: 260,
  isGenerationsPaneLocked: true,
  isGenerationsPaneOpen: false,
  effectiveGenerationsPaneHeight: 180,
  editorPaneHeight: 540,
};

vi.mock('react-router-dom', () => ({
  Outlet: () => <div data-testid="layout-outlet" />,
  useLocation: () => ({ pathname: locationPathname }),
}));

vi.mock('@/shared/components/AppHeader.tsx', () => ({
  AppHeader: (props: unknown) => {
    appHeaderMock(props);
    return <div data-testid="global-header" />;
  },
}));

vi.mock('@/shared/hooks/useHomeNavigation', () => ({
  useHomeNavigation: () => ({
    navigateHome: vi.fn(),
    targetPath: '/tools/travel-between-images',
  }),
}));

vi.mock('@/shared/state/panesStore', () => ({
  usePanesStore: (selector: (state: typeof panesState.state) => unknown) => selector(panesState.state),
}));

vi.mock('@/shared/contexts/ToolPageHeaderContext', () => ({
  useHeaderState: () => useHeaderStateMock(),
}));

vi.mock('@/shared/hooks/responsive/useViewportResponsive', () => ({
  useViewportResponsive: () => useViewportResponsiveMock(),
}));

vi.mock('@/app/hooks/useVideoEditorRouteState', () => ({
  useVideoEditorRouteState: () => useVideoEditorRouteStateMock(),
}));

describe('LayoutMainContent', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    locationPathname = '/home';
    panesState.state = {
      isEditorPaneLocked: false,
      effectiveEditorPaneHeight: 0,
      ...defaultPanesState,
    };
    useHeaderStateMock.mockReturnValue({
      header: <div data-testid="tool-header">Header</div>,
    });
    useViewportResponsiveMock.mockReturnValue({
      isSm: false,
      isMd: false,
      isLg: true,
      isXl: true,
      is2Xl: false,
      contentWidth: 1280,
      contentHeight: 720,
    });
    useVideoEditorRouteStateMock.mockReturnValue({
      isEditorRoute: false,
      isVideoEditorShellActive: false,
    });
  });

  it('renders global layout pieces and applies pane offsets', () => {
    const { container } = render(
      <LayoutMainContent isMobileSplitView={false} />
    );

    expect(screen.getByTestId('global-header')).toBeInTheDocument();
    expect(screen.getByTestId('tool-header')).toBeInTheDocument();
    expect(screen.getByTestId('layout-outlet')).toBeInTheDocument();
    expect(appHeaderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        navigationMode: 'home',
      })
    );

    const contentContainer = container.querySelector('.content-container');
    expect(contentContainer).not.toBeNull();
    expect(contentContainer).toHaveStyle({
      marginRight: '320px',
      marginLeft: '260px',
      paddingTop: '0px',
      paddingBottom: '180px',
      willChange: 'margin, padding',
    });
  });

  it('reserves the locked Tasks pane width for the header so its Settings control is not covered', () => {
    const { container } = render(
      <LayoutMainContent isMobileSplitView={false} />
    );

    const headerSlot = screen.getByTestId('global-header-slot');
    expect(headerSlot).toHaveStyle({ marginRight: '320px' });
    expect(container.querySelector('.content-container')).toHaveStyle({ marginRight: '320px' });
  });

  it('does not reserve header space when the Tasks pane is not locked', () => {
    panesState.state = {
      ...defaultPanesState,
      isTasksPaneLocked: false,
    };

    render(<LayoutMainContent isMobileSplitView={false} />);

    expect(screen.getByTestId('global-header-slot')).toHaveStyle({ marginRight: '0px' });
  });

  it('keeps the canonical app header on the editor fallback route', () => {
    useVideoEditorRouteStateMock.mockReturnValue({
      isEditorRoute: true,
      isVideoEditorShellActive: false,
    });

    render(
      <LayoutMainContent isMobileSplitView={false} />
    );

    expect(screen.getByTestId('global-header')).toBeInTheDocument();
  });

  it('leaves editor navigation to the page-injected project selector', () => {
    useVideoEditorRouteStateMock.mockReturnValue({
      isEditorRoute: true,
      isVideoEditorShellActive: true,
    });
    const projectControls = <div data-testid="editor-project-controls" />;
    useHeaderStateMock.mockReturnValue({ header: null, globalHeaderContent: projectControls });

    render(<LayoutMainContent isMobileSplitView={false} />);

    expect(appHeaderMock).toHaveBeenCalledWith(expect.objectContaining({
      onNavigate: undefined,
      navigationControls: projectControls,
      showProjectControls: false,
    }));
  });

  it('does not apply top padding when the editor pane is hidden', () => {
    panesState.state = {
      ...defaultPanesState,
      isEditorPaneLocked: false,
      effectiveEditorPaneHeight: 360,
    };

    const { container } = render(
      <LayoutMainContent isMobileSplitView={false} />
    );

    const contentContainer = container.querySelector('.content-container');
    expect(contentContainer).not.toBeNull();
    expect(contentContainer).toHaveStyle({
      paddingTop: '0px',
    });
  });

  it('keeps content in place while the editor pane is only hovering open', () => {
    panesState.state = {
      ...defaultPanesState,
      isEditorPaneLocked: false,
      effectiveEditorPaneHeight: 360,
    };

    const { container } = render(
      <LayoutMainContent isMobileSplitView={false} />
    );

    const contentContainer = container.querySelector('.content-container');
    expect(contentContainer).not.toBeNull();
    expect(contentContainer).toHaveStyle({
      paddingTop: '0px',
    });
  });

  it('applies bottom padding in the video editor shell when the generations pane is locked', () => {
    useVideoEditorRouteStateMock.mockReturnValue({
      isEditorRoute: true,
      isVideoEditorShellActive: true,
    });
    panesState.state = {
      ...defaultPanesState,
      isGenerationsPaneLocked: true,
      isGenerationsPaneOpen: false,
      effectiveGenerationsPaneHeight: 180,
    };

    const { container } = render(
      <LayoutMainContent isMobileSplitView={false} />
    );

    const contentContainer = container.querySelector('.content-container');
    expect(contentContainer).not.toBeNull();
    expect(contentContainer).toHaveStyle({
      paddingBottom: '180px',
    });
  });

  it('keeps bottom padding at zero in the video editor shell when the generations pane is closed', () => {
    useVideoEditorRouteStateMock.mockReturnValue({
      isEditorRoute: true,
      isVideoEditorShellActive: true,
    });
    panesState.state = {
      ...defaultPanesState,
      isGenerationsPaneLocked: false,
      isGenerationsPaneOpen: false,
      effectiveGenerationsPaneHeight: 180,
    };

    const { container } = render(
      <LayoutMainContent isMobileSplitView={false} />
    );

    const contentContainer = container.querySelector('.content-container');
    expect(contentContainer).not.toBeNull();
    expect(contentContainer).toHaveStyle({
      paddingBottom: '0px',
    });
  });

  it('does not reserve app-shell pane space on the image generation page', () => {
    locationPathname = '/tools/image-generation';
    const { container } = render(
      <LayoutMainContent isMobileSplitView={false} />
    );

    const contentContainer = container.querySelector('.content-container');
    expect(contentContainer).not.toBeNull();
    expect(contentContainer).toHaveStyle({
      paddingBottom: '0px',
    });
  });
});
