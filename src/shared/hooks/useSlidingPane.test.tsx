// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
}));

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

function renderRightPane(isLocked: boolean) {
  const onToggleLock = vi.fn();
  const hook = renderHook(
    () => useSlidingPane({ side: 'right', isLocked, onToggleLock }),
    { wrapper },
  );
  return { ...hook, onToggleLock };
}

describe('useSlidingPane pointer leave', () => {
  it('a locked pane stays open when the pointer leaves it', () => {
    vi.useFakeTimers();
    const { result } = renderRightPane(true);
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.handlePaneLeave();
      vi.runAllTimers();
    });

    expect(result.current.isOpen).toBe(true);
    vi.useRealTimers();
  });

  it('an unlocked, hover-opened pane closes when the pointer leaves it', () => {
    vi.useFakeTimers();
    const { result } = renderRightPane(false);
    act(() => {
      result.current.openPane();
      vi.runAllTimers();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.handlePaneLeave();
      vi.runAllTimers();
    });

    expect(result.current.isOpen).toBe(false);
    vi.useRealTimers();
  });
});
