import { useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { useAppEventListener } from '@/shared/lib/typedEvents';

export function useSplitViewScroll(isMobileSplitView: boolean) {
  const splitViewWrapperRef = useRef<HTMLDivElement>(null);

  // Continuously track scroll positions so we have them BEFORE transitions happen
  const lastWindowScrollRef = useRef<number>(0);
  const lastWrapperScrollRef = useRef<number>(0);
  const wasSplitViewRef = useRef<boolean>(false);

  // Track window scroll position continuously when NOT in split view
  useEffect(() => {
    if (isMobileSplitView) return;

    const handleScroll = () => {
      lastWindowScrollRef.current = window.scrollY;
    };

    lastWindowScrollRef.current = window.scrollY;

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobileSplitView]);

  // Track wrapper scroll position continuously when IN split view
  useEffect(() => {
    if (!isMobileSplitView) return;

    const wrapper = splitViewWrapperRef.current;
    if (!wrapper) return;

    const handleScroll = () => {
      lastWrapperScrollRef.current = wrapper.scrollTop;
    };

    lastWrapperScrollRef.current = wrapper.scrollTop;

    wrapper.addEventListener('scroll', handleScroll, { passive: true });
    return () => wrapper.removeEventListener('scroll', handleScroll);
  }, [isMobileSplitView]);

  // Handle transitions to/from split view - use useLayoutEffect for synchronous DOM updates
  useLayoutEffect(() => {
    if (isMobileSplitView && !wasSplitViewRef.current) {
      // Transitioning TO split view
      const scrollToRestore = lastWindowScrollRef.current;
      if (splitViewWrapperRef.current) {
        splitViewWrapperRef.current.scrollTop = scrollToRestore;
        lastWrapperScrollRef.current = scrollToRestore;
      }
    } else if (!isMobileSplitView && wasSplitViewRef.current) {
      // Transitioning FROM split view
      const scrollToRestore = lastWrapperScrollRef.current;
      window.scrollTo(0, scrollToRestore);
      lastWindowScrollRef.current = scrollToRestore;
    }
    wasSplitViewRef.current = isMobileSplitView;
  }, [isMobileSplitView]);

  // Listen for global scrollToTop event (for cases where window.scrollTo doesn't work, e.g. split view)
  const handleScrollToTop = useCallback((detail: { behavior?: ScrollBehavior }) => {
    if (isMobileSplitView && splitViewWrapperRef.current) {
      splitViewWrapperRef.current.scrollTo({
        top: 0,
        behavior: detail?.behavior || 'auto'
      });
    }
  }, [isMobileSplitView]);

  useAppEventListener('app:scrollToTop', handleScrollToTop);

  return { splitViewWrapperRef };
}
