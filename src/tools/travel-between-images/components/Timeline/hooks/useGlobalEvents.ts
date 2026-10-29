import { useEffect, useCallback } from 'react';

interface GlobalEventsProps {
  isDragging: boolean;
  activeId?: string;
  shotId: string;
  handleMouseMove: (e: MouseEvent) => void;
  handleMouseUp: (e: MouseEvent, containerRef: React.RefObject<HTMLDivElement>) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

export function useGlobalEvents({
  isDragging,
  activeId,
  shotId,
  handleMouseMove,
  handleMouseUp,
  containerRef
}: GlobalEventsProps) {

  // Create wrapped event handlers
  const createMoveHandler = useCallback((moveHandler: (e: MouseEvent) => void) => {
    return (e: MouseEvent) => {
      moveHandler(e);
    };
  }, []);

  const createUpHandler = useCallback((upHandler: (e: MouseEvent, containerRef: React.RefObject<HTMLDivElement>) => void) => {
    return (e: MouseEvent) => {
      upHandler(e, containerRef);
    };
  }, [containerRef]);

  // Set up global mouse event listeners for drag
  useEffect(() => {
    if (isDragging) {
      const moveHandler = createMoveHandler(handleMouseMove);
      const upHandler = createUpHandler(handleMouseUp);

      document.addEventListener('mousemove', moveHandler);
      document.addEventListener('mouseup', upHandler);

      return () => {
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', upHandler);
      };
    }
  }, [
    isDragging,
    activeId,
    shotId,
    handleMouseMove,
    handleMouseUp,
    createMoveHandler,
    createUpHandler
  ]);

  return {
    // This hook doesn't return anything, it just manages global events
    // But we could return utilities if needed in the future
    isListening: isDragging
  };
}
