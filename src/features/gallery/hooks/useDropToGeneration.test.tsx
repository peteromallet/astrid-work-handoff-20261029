import React from 'react';
import { beforeAll, describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RUNTIME_MEDIA_IMPORT_MAX_BYTES } from '@/tools/video-editor/data/AssetResolver.ts';

const runtimePrepareMediaImportMock = vi.fn();
const useResolvedGalleryProjectMock = vi.fn();
const toastErrorMock = vi.fn();
const normalizeAndPresentErrorMock = vi.fn();

vi.mock('@/app/runtime/useResolvedGalleryProject', () => ({
  useResolvedGalleryProject: (...args: unknown[]) => useResolvedGalleryProjectMock(...args),
}));

vi.mock('@/integrations/runtime/dataProvider', () => ({
  RuntimeDataProvider: class {
    prepareMediaImport(...args: unknown[]) {
      return runtimePrepareMediaImportMock(...args);
    }
  },
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => normalizeAndPresentErrorMock(...args),
}));

let useDropToGeneration: typeof import('./useDropToGeneration').useDropToGeneration;

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useDropToGeneration', () => {
  beforeAll(async () => {
    ({ useDropToGeneration } = await import('./useDropToGeneration'));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useResolvedGalleryProjectMock.mockReturnValue({
      projectId: null,
      runtimeAuthority: false,
      status: 'not-applicable',
      isResolving: false,
      error: null,
      selector: null,
    });
  });

  it('imports Runtime image/video drops with the canonical project and refreshes the Runtime gallery scope', async () => {
    useResolvedGalleryProjectMock.mockReturnValue({
      projectId: 'runtime-project-id',
      runtimeAuthority: true,
      status: 'resolved',
      isResolving: false,
      error: null,
      selector: 'local-project-slug',
    });
    runtimePrepareMediaImportMock
      .mockResolvedValueOnce({
        provider: 'runtime',
        project: 'runtime-project-id',
        importOperationId: 'operation-image',
        generationId: 'generation-image',
        variantId: 'variant-image',
        assetId: 'sha256:image',
        entry: { file: 'https://runtime.test/image', type: 'image/png' },
      })
      .mockResolvedValueOnce({
        provider: 'runtime',
        project: 'runtime-project-id',
        importOperationId: 'operation-video',
        generationId: 'generation-video',
        variantId: 'variant-video',
        assetId: 'sha256:video',
        entry: { file: 'https://runtime.test/video', type: 'video/mp4' },
      });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useDropToGeneration(), {
      wrapper: createWrapper(queryClient),
    });
    const imageFile = new File(['image'], 'frame.png', { type: 'image/png' });
    const videoFile = new File(['video'], 'clip.mp4', { type: 'video/mp4' });

    await act(async () => {
      await result.current([imageFile, videoFile]);
    });

    expect(runtimePrepareMediaImportMock).toHaveBeenNthCalledWith(1, imageFile, {
      filename: 'frame.png',
      mediaType: 'image/png',
    });
    expect(runtimePrepareMediaImportMock).toHaveBeenNthCalledWith(2, videoFile, {
      filename: 'clip.mp4',
      mediaType: 'video/mp4',
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['runtime', 'unified-generations', 'project', 'runtime-project-id'],
    });
  });

  it('rejects Runtime files above 5 GiB before media import or gallery refresh', async () => {
    useResolvedGalleryProjectMock.mockReturnValue({
      projectId: 'runtime-project-id',
      runtimeAuthority: true,
      status: 'resolved',
      isResolving: false,
      error: null,
      selector: null,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useDropToGeneration(), {
      wrapper: createWrapper(queryClient),
    });
    const oversizedVideo = new File(['x'], 'huge.mp4', { type: 'video/mp4' });
    Object.defineProperty(oversizedVideo, 'size', { value: RUNTIME_MEDIA_IMPORT_MAX_BYTES + 1 });

    await act(async () => {
      await result.current([oversizedVideo]);
    });

    expect(runtimePrepareMediaImportMock).not.toHaveBeenCalled();
    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      toastTitle: 'Failed to add huge.mp4',
    }));
  });

  it('fails closed when Runtime has no canonical project for a scoped URL', async () => {
    useResolvedGalleryProjectMock.mockReturnValue({
      projectId: null,
      runtimeAuthority: true,
      status: 'error',
      isResolving: false,
      error: new Error('Runtime project is unavailable.'),
      selector: 'bridge-slug',
    });
    const { result } = renderHook(() => useDropToGeneration(), {
      wrapper: createWrapper(new QueryClient()),
    });

    await act(async () => {
      await result.current([new File(['image'], 'frame.png', { type: 'image/png' })]);
    });

    expect(runtimePrepareMediaImportMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('Runtime project is unavailable.');
  });

  it('refuses drops on a route without a Runtime project and sends nothing', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useDropToGeneration(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current([new File(['image'], 'frame.png', { type: 'image/png' })]);
    });

    expect(runtimePrepareMediaImportMock).not.toHaveBeenCalled();
    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('Astrid Runtime project is not ready for media import.');
  });

  it('shows an error toast for unsupported files', async () => {
    useResolvedGalleryProjectMock.mockReturnValue({
      projectId: 'runtime-project-id',
      runtimeAuthority: true,
      status: 'resolved',
      isResolving: false,
      error: null,
      selector: null,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useDropToGeneration(), {
      wrapper: createWrapper(queryClient),
    });

    const unsupportedFile = new File(['text'], 'notes.txt', { type: 'text/plain' });

    await act(async () => {
      await result.current([unsupportedFile]);
    });

    expect(toastErrorMock).toHaveBeenCalledWith('Unsupported file type: notes.txt');
    expect(runtimePrepareMediaImportMock).not.toHaveBeenCalled();
  });
});
