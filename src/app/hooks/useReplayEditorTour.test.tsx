// @vitest-environment jsdom
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exitEditorTour, getEditorTourState } from '@/shared/state/editorTourStore';
import { useReplayEditorTour } from './useReplayEditorTour';

const device = { mobile: false, tablet: false };
vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: () => device.mobile,
  useIsTablet: () => device.tablet,
}));

function setup(path: string) {
  return renderHook(() => ({ replay: useReplayEditorTour(), location: useLocation() }), {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>,
  });
}

describe('useReplayEditorTour', () => {
  beforeEach(() => { device.mobile = false; device.tablet = false; window.localStorage.clear(); });
  afterEach(() => exitEditorTour());

  it('starts the tour from the welcome card without navigating when already in the editor', () => {
    const { result } = setup('/tools/video-editor?project=p&timeline=t');
    act(() => result.current.replay!());
    expect(getEditorTourState()).toMatchObject({ status: 'running', act: 1, beat: 'welcome' });
    expect(result.current.location.pathname).toBe('/tools/video-editor');
    expect(result.current.location.search).toBe('?project=p&timeline=t');
  });

  it('goes to the editor first when elsewhere, then starts the tour', () => {
    const { result } = setup('/tools/travel-between-images');
    act(() => result.current.replay!());
    expect(result.current.location.pathname).toBe('/tools/video-editor');
    expect(getEditorTourState()).toMatchObject({ status: 'running', beat: 'welcome' });
  });

  it('does not write the legacy seen flag', () => {
    const { result } = setup('/tools/video-editor');
    act(() => result.current.replay!());
    expect(window.localStorage.getItem('astrid-editor-tour-v1')).toBeNull();
    exitEditorTour();
    expect(window.localStorage.getItem('astrid-editor-tour-v1')).toBeNull();
  });

  it('is not offered on a phone or tablet, or while a tour runs', () => {
    device.mobile = true;
    expect(setup('/tools/video-editor').result.current.replay).toBeUndefined();
    device.mobile = false; device.tablet = true;
    expect(setup('/tools/video-editor').result.current.replay).toBeUndefined();
    device.tablet = false;
    const { result } = setup('/tools/video-editor');
    expect(result.current.replay).toBeDefined();
    act(() => result.current.replay!());
    expect(result.current.replay).toBeUndefined();
  });
});
