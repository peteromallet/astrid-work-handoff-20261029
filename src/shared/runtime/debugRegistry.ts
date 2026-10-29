type ManagedDebugGlobalKey = '__DATA_FRESHNESS_MANAGER__';

interface ActiveRegistration {
  owner: string;
  value: unknown;
}

const activeRegistrations = new Map<ManagedDebugGlobalKey, ActiveRegistration>();

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

export function registerDebugGlobal<K extends ManagedDebugGlobalKey>(
  key: K,
  value: NonNullable<Window[K]>,
  owner: string,
): () => void {
  if (!hasWindow()) {
    return () => {};
  }

  const globalWindow = window as Window;
  const hadPrevious = Object.prototype.hasOwnProperty.call(globalWindow, key);
  const previousValue = globalWindow[key];
  const previousRegistration = activeRegistrations.get(key) ?? null;

  globalWindow[key] = value;
  activeRegistrations.set(key, { owner, value });

  let disposed = false;
  return () => {
    if (disposed || !hasWindow()) {
      return;
    }
    disposed = true;

    const currentRegistration = activeRegistrations.get(key);
    if (!currentRegistration || currentRegistration.value !== value) {
      return;
    }

    if (previousRegistration) {
      globalWindow[key] = previousRegistration.value as Window[K];
      activeRegistrations.set(key, previousRegistration);
      return;
    }

    if (hadPrevious) {
      globalWindow[key] = previousValue as Window[K];
    } else {
      delete (globalWindow as Partial<Record<ManagedDebugGlobalKey, unknown>>)[key];
    }

    activeRegistrations.delete(key);
  };
}

export function getDebugGlobal<K extends ManagedDebugGlobalKey>(key: K): Window[K] | undefined {
  if (!hasWindow()) {
    return undefined;
  }
  return (window as Window)[key];
}

export function getDebugGlobalOwner(key: ManagedDebugGlobalKey): string | null {
  return activeRegistrations.get(key)?.owner ?? null;
}
