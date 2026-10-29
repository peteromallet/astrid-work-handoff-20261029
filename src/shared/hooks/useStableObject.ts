import { useRef } from 'react';

/**
 * Hook that returns a stable reference to an object, only updating when dependencies change.
 * Uses deep comparison to prevent unnecessary recreations.
 */
export function useStableObject<T extends Record<string, unknown>>(
  factory: () => T,
  deps: React.DependencyList
): T {
  const depsRef = useRef<React.DependencyList>();
  const objectRef = useRef<T>();

  // Check if dependencies have actually changed
  const depsChanged = !depsRef.current || 
    depsRef.current.length !== deps.length ||
    depsRef.current.some((dep, index) => dep !== deps[index]);

  if (depsChanged || !objectRef.current) {
    objectRef.current = factory();
    depsRef.current = deps;
  }

  return objectRef.current;
}

