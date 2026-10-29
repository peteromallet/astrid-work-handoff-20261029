import { useState, useCallback, useRef, useEffect } from 'react';

interface UseOperationTrackingResult {
  isShotOperationInProgress: boolean;
  isDraggingInTimeline: boolean;
  setIsDraggingInTimeline: (dragging: boolean) => void;
  signalShotOperation: () => void;
}

export function useOperationTracking(): UseOperationTrackingResult {
  const [isShotOperationInProgress, setIsShotOperationInProgress] = useState(false);
  const [isDraggingInTimeline, setIsDraggingInTimeline] = useState(false);
  const operationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const signalShotOperation = useCallback(() => {
    if (operationTimeoutRef.current) {
      clearTimeout(operationTimeoutRef.current);
    }

    setIsShotOperationInProgress(true);

    operationTimeoutRef.current = setTimeout(() => {
      setIsShotOperationInProgress(false);
      operationTimeoutRef.current = null;
    }, 100);
  }, []);

  useEffect(() => {
    return () => {
      if (operationTimeoutRef.current) {
        clearTimeout(operationTimeoutRef.current);
      }
    };
  }, []);

  return {
    isShotOperationInProgress,
    isDraggingInTimeline,
    setIsDraggingInTimeline,
    signalShotOperation,
  };
}
