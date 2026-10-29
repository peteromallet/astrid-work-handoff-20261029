import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  normalizeAndPresentErrorMock,
} = vi.hoisted(() => ({
  normalizeAndPresentErrorMock: vi.fn(),
}));

vi.mock('@/pages/ArtPage', () => ({
  default: () => <div data-testid="art-page" />,
}));
vi.mock('@/tools/image-generation/pages/ImageGenerationToolPage', () => ({
  default: () => <div data-testid="image-generation-page" />,
}));
vi.mock('@/tools/travel-between-images/pages/VideoTravelToolPage', () => ({
  default: () => <div data-testid="video-travel-page" />,
}));
vi.mock('@/tools/character-animate/pages/CharacterAnimatePage', () => ({
  default: () => <div data-testid="character-animate-page" />,
}));
vi.mock('@/tools/join-clips/pages/JoinClipsPage', () => ({
  default: () => <div data-testid="join-clips-page" />,
}));
vi.mock('@/tools/edit-video/pages/EditVideoPage', () => ({
  default: () => <div data-testid="edit-video-page" />,
}));
vi.mock('@/tools/video-editor/pages/VideoEditorPage', () => ({
  default: () => <div data-testid="video-editor-page" />,
}));
vi.mock('@/tools/video-editor/pages/ExtensionHarnessPage', () => ({
  default: () => <div data-testid="extension-harness-page" />,
}));
vi.mock('@/tools/edit-images/pages/EditImagesPage', () => ({
  default: () => <div data-testid="edit-images-page" />,
}));
vi.mock('@/tools/training-data-helper/pages/TrainingDataHelperPage', () => ({
  default: () => <div data-testid="training-data-helper-page" />,
}));
vi.mock('@/pages/Blog/BlogListPage', () => ({
  default: () => <div data-testid="blog-list-page" />,
}));
vi.mock('@/pages/Blog/BlogPostPage', () => ({
  default: () => <div data-testid="blog-post-page" />,
}));
vi.mock('@/pages/NotFoundPage', () => ({
  default: () => <div data-testid="not-found-page" />,
}));
vi.mock('@/pages/ShotsPage', () => ({
  default: () => <div data-testid="shots-page" />,
}));
vi.mock('@/app/Layout', async () => {
  const { Outlet } = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    Layout: () => <Outlet />,
  };
});
vi.mock('./DefaultToolRedirect', () => ({
  DefaultToolRedirect: () => <div data-testid="default-tool-redirect" />,
}));
vi.mock('@/shared/components/AstridLoading', () => ({
  AstridLoading: () => <div data-testid="astrid-loading" />,
}));
vi.mock('@/shared/components/ToolErrorBoundary', () => ({
  ToolErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: normalizeAndPresentErrorMock,
}));

async function loadRoutes() {
  vi.resetModules();
  return (await import('./routes')).AppRoutes;
}

function renderRoute(
  AppRoutes: typeof import('./routes').AppRoutes,
  path: string,
  homeDocumentReplacement?: (url: string) => void,
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes homeDocumentReplacement={homeDocumentReplacement} />
    </MemoryRouter>,
  );
}

describe('AppRoutes', () => {
  beforeEach(() => {
    normalizeAndPresentErrorMock.mockReset();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hands /home to a fresh public document with query and hash', async () => {
    const AppRoutes = await loadRoutes();
    const replaceDocument = vi.fn();
    window.history.replaceState({}, '', '/home?source=guard#return');
    renderRoute(AppRoutes, '/home?source=guard#return', replaceDocument);
    await vi.waitFor(() => expect(replaceDocument).toHaveBeenCalledTimes(1));
    expect(replaceDocument).toHaveBeenCalledWith(window.location.origin + '/home?source=guard#return');
  });

  it.each([
    ['/tools/video-editor', 'video-editor-page'],
    ['/tools/image-generation', 'image-generation-page'],
    ['/tools/join-clips', 'join-clips-page'],
  ])('preserves normal tool access at %s', async (path, testId) => {
    const AppRoutes = await loadRoutes();
    renderRoute(AppRoutes, path);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it('maps the app root to the default tool', async () => {
    const AppRoutes = await loadRoutes();
    renderRoute(AppRoutes, '/');
    expect(screen.getByTestId('default-tool-redirect')).toBeInTheDocument();
  });

  it.each([
    ['/tools/character-animate', 'character-animate-page'],
    ['/tools/edit-video', 'edit-video-page'],
    ['/tools/edit-images', 'edit-images-page'],
    ['/tools/training-data-helper', 'training-data-helper-page'],
  ])('keeps the %s tool route', async (path, testId) => {
    const AppRoutes = await loadRoutes();
    renderRoute(AppRoutes, path);
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
  });

  it('renders the DEV extension harness through a Suspense boundary', async () => {
    const AppRoutes = await loadRoutes();
    renderRoute(AppRoutes, '/tools/video-editor/harness?scenario=populated&localTest=1');
    expect(await screen.findByTestId('extension-harness-page')).toBeInTheDocument();
  });

  it('renders public routes outside the layout tree', async () => {
    const AppRoutes = await loadRoutes();
    renderRoute(AppRoutes, '/blog');
    expect(await screen.findByTestId('blog-list-page')).toBeInTheDocument();
  });

  it('renders unknown paths with the catch-all route', async () => {
    const AppRoutes = await loadRoutes();
    renderRoute(AppRoutes, '/does-not-exist');
    expect(screen.getByTestId('not-found-page')).toBeInTheDocument();
  });
});
