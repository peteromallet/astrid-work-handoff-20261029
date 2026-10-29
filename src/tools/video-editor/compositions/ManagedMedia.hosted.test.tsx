import React, {createRef} from 'react';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {isManagedObjectUrl} from '@astrid/packs/rendering/shared/managed-media-policy';
import {ManagedImg, ManagedOffthreadVideo, ManagedVideo} from '@astrid/packs/rendering/shared/managed-media';

const observed = vi.hoisted(() => ({video: {} as Record<string, unknown>, offthread: {} as Record<string, unknown>}));
vi.mock('remotion', async () => {
  const {forwardRef} = await import('react');
  return {
    Img: forwardRef<HTMLImageElement, any>(({src, crossOrigin, onLoad}, ref) => <img alt="managed still" ref={ref} src={src} crossOrigin={crossOrigin} onLoad={onLoad} />),
    OffthreadVideo: (props: Record<string, unknown>) => {observed.offthread = props; return null;},
  };
});
vi.mock('@remotion/media', () => ({Video: (props: Record<string, unknown>) => {observed.video = props; return null;}}));

const gatewaySrc = 'http://127.0.0.1:17340/api/astrid/v1/objects/sha256%3Af069b44';
beforeEach(() => {observed.video = {}; observed.offthread = {};});

describe('hosted managed media request boundary', () => {
  it.each([
    gatewaySrc,
    'http://127.0.0.1:20123/api/runtime/v1/objects/sha256:abc',
    'http://localhost:20123/api/astrid/v1/objects/sha256%3Aabc',
    'https://[::1]:20123/api/runtime/v1/objects/object-1',
    '/api/runtime/v1/objects/sha256%3Aabc',
  ])('recognizes the exact managed byte route %s', src => expect(isManagedObjectUrl(src)).toBe(true));

  it.each([
    'https://storage.example/a.png?signature=abc', '/images/a.png', 'blob:https://astrid.haus/id',
    'http://127.0.0.1:17340/other/a.png', 'http://127.0.0.1:17340/api/runtime/v1/objects/a/other',
    'http://127.0.0.1:17340/api/runtime/v1/objects/a%2Fb',
    'https://external.example/api/runtime/v1/objects/sha256:abc',
    '//external.example/api/runtime/v1/objects/sha256:abc',
  ])('preserves non-managed and invalid URLs %s', src => expect(isManagedObjectUrl(src)).toBe(false));

  it('sets anonymous native image mode and retains image readiness callback and ref', () => {
    const ref = createRef<HTMLImageElement>();
    const onLoad = vi.fn();
    render(<ManagedImg src={gatewaySrc} ref={ref} onLoad={onLoad} />);
    expect(screen.getByRole('img')).toHaveAttribute('crossorigin', 'anonymous');
    expect(ref.current).toBe(screen.getByRole('img'));
    ref.current!.dispatchEvent(new Event('load'));
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it('keeps external image credential choices unchanged', () => {
    const view = render(<ManagedImg src="https://storage.example/a.png?signature=abc" crossOrigin="use-credentials" />);
    expect(screen.getByRole('img')).toHaveAttribute('crossorigin', 'use-credentials');
    view.rerender(<ManagedImg src="https://external.example/a.png" />);
    expect(screen.getByRole('img')).not.toHaveAttribute('crossorigin');
  });

  it('sets anonymous native video mode while retaining trims and callbacks', () => {
    const onVideoFrame = vi.fn();
    render(<ManagedOffthreadVideo src={gatewaySrc} trimBefore={120} onVideoFrame={onVideoFrame} />);
    expect(observed.offthread).toMatchObject({crossOrigin: 'anonymous', trimBefore: 120, onVideoFrame});
  });

  it('uses credential-free decoder fetches and native fallback for hosted video', () => {
    const onError = vi.fn();
    const onVideoFrame = vi.fn();
    render(<ManagedVideo src={gatewaySrc} credentials="include" requestInit={{credentials: 'include'}} trimBefore={60} playbackRate={2} onVideoFrame={onVideoFrame} fallbackOffthreadVideoProps={{onError}} />);
    expect(observed.video).toMatchObject({credentials: 'omit', requestInit: {credentials: 'omit'}, trimBefore: 60, playbackRate: 2, onVideoFrame,
      fallbackOffthreadVideoProps: {crossOrigin: 'anonymous', onError}});
  });

  it('preserves signed cloud video request and fallback options', () => {
    const requestInit = {credentials: 'include' as const};
    render(<ManagedVideo src="https://cloud.example/a.mp4?signature=abc" requestInit={requestInit} />);
    expect(observed.video.requestInit).toBe(requestInit);
    expect(observed.video.fallbackOffthreadVideoProps).toBeUndefined();
  });
});
