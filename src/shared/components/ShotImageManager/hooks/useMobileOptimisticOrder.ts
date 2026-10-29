import { useEffect, useRef, useState } from 'react';
import type { GenerationRow } from '@/domains/generation/types';

export function useMobileOptimisticOrder(images: GenerationRow[]) {
  const [optimisticOrder, setOptimisticOrder] = useState<GenerationRow[]>([]);
  const [isOptimisticUpdate, setIsOptimisticUpdate] = useState(false);

  const currentImages =
    isOptimisticUpdate && optimisticOrder.length > 0 ? optimisticOrder : images;

  const prevImagesLengthRef = useRef(images.length);
  useEffect(() => {
    const lengthDiff = Math.abs(images.length - prevImagesLengthRef.current);
    if (lengthDiff > 1 && isOptimisticUpdate) {
      setIsOptimisticUpdate(false);
      setOptimisticOrder([]);
    }
    prevImagesLengthRef.current = images.length;
  }, [images.length, isOptimisticUpdate]);

  useEffect(() => {
    if (isOptimisticUpdate && images.length > 0) {
      const optimisticIds = optimisticOrder.map((image) => image.id).join(',');
      const serverIds = images.map((image) => image.id).join(',');

      if (optimisticIds === serverIds) {
        setIsOptimisticUpdate(false);
        setOptimisticOrder([]);
      } else {
        const timeout = setTimeout(() => {
          if (isOptimisticUpdate) {
            setIsOptimisticUpdate(false);
            setOptimisticOrder([]);
          }
        }, 5000);
        return () => clearTimeout(timeout);
      }
    }
  }, [images, isOptimisticUpdate, optimisticOrder]);

  return {
    currentImages,
    optimisticOrder,
    setOptimisticOrder,
    isOptimisticUpdate,
    setIsOptimisticUpdate,
  };
}
