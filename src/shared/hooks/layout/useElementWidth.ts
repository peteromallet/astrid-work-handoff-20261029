import { useLayoutEffect, useState } from 'react';

/**
 * Tracks an element's content-box width with a ResizeObserver.
 * Attach the returned ref callback to the element; the width is null until the first measurement.
 * The ref is a callback ref, so an element that mounts or unmounts later is observed correctly.
 */
export function useElementWidth<T extends HTMLElement>(): [(node: T | null) => void, number | null] {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  // Layout effect: the first width lands before paint, so the layout never flashes the wrong mode.
  useLayoutEffect(() => {
    if (!node) return;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setWidth(entry.contentRect.width);
    });
    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, [node]);

  return [setNode, width];
}
