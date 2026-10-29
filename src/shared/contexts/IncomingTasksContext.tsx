import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';

// Auto-cleanup stale incoming tasks after this many seconds
const STALE_TASK_TIMEOUT_SECONDS = 90;

/**
 * Generic incoming task - represents a task that is being prepared/created
 * but hasn't yet appeared in the database. This allows for immediate UI feedback
 * while background operations (like AI prompt generation) complete.
 *
 * Designed to work with any task type, not just image generation.
 */
export interface IncomingTask {
  id: string;
  startedAt: Date;
  taskType: string;       // e.g., 'image_generation', 'travel_video', 'upscale', etc.
  label: string;          // Display text (e.g., "cinematic shot of...", "Travel video")
  expectedCount?: number; // Optional: expected number of tasks to create
  taskIds?: string[];     // Real task IDs, set after creation completes (for exact matching)
}

interface IncomingTasksContextValue {
  /** List of all incoming tasks currently being prepared */
  incomingTasks: IncomingTask[];

  /** Add a new incoming task. Returns the generated ID for later removal. */
  addIncomingTask: (task: Omit<IncomingTask, 'id' | 'startedAt'>) => string;

  /** Remove an incoming task by ID (call when real tasks appear or on error) */
  removeIncomingTask: (id: string) => void;

  /**
   * Resolve an incoming task with real task IDs from the database.
   * The placeholder will be hidden once any of these IDs appear in the task list.
   */
  resolveTaskIds: (id: string, taskIds: string[]) => void;

  /** Quick check if there are any incoming tasks */
  hasIncomingTasks: boolean;

  /**
   * Cancel a single incoming task. Removes it from the UI immediately and
   * marks its ID so the in-flight create() call can detect the cancellation.
   */
  cancelIncoming: (id: string) => void;

  /**
   * Cancel all incoming tasks. Removes them from the UI immediately and
   * marks their IDs so in-flight create() calls can detect the cancellation.
   */
  cancelAllIncoming: () => void;

  /** Check if an incoming task was cancelled (for in-flight create() calls). */
  wasCancelled: (id: string) => boolean;

  /** Clear the cancelled flag for a task (after handling the cancellation). */
  acknowledgeCancellation: (id: string) => void;
}

const IncomingTasksContext = createContext<IncomingTasksContextValue | null>(null);

let idCounter = 0;
const generateId = () => `incoming-${Date.now()}-${++idCounter}`;

export const IncomingTasksProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [incomingTasks, setIncomingTasks] = useState<IncomingTask[]>([]);

  // Track cancelled incoming task IDs so in-flight create() calls can detect cancellation.
  // Uses a ref because the check happens inside async closures that need the latest value.
  const cancelledIdsRef = useRef(new Set<string>());

  const addIncomingTask = useCallback((task: Omit<IncomingTask, 'id' | 'startedAt'>): string => {
    const id = generateId();
    const newTask: IncomingTask = {
      ...task,
      id,
      startedAt: new Date(),
    };

    setIncomingTasks(prev => [newTask, ...prev]);
    return id;
  }, []);

  const removeIncomingTask = useCallback((id: string) => {
    setIncomingTasks(prev => prev.filter(task => task.id !== id));
  }, []);

  const resolveTaskIds = useCallback((id: string, taskIds: string[]) => {
    setIncomingTasks(prev =>
      prev.map(task => task.id === id ? { ...task, taskIds } : task)
    );
  }, []);

  const cancelIncoming = useCallback((id: string) => {
    cancelledIdsRef.current.add(id);
    setIncomingTasks(prev => prev.filter(task => task.id !== id));
  }, []);

  const cancelAllIncoming = useCallback(() => {
    setIncomingTasks(prev => {
      prev.forEach(t => cancelledIdsRef.current.add(t.id));
      return [];
    });
  }, []);

  const wasCancelled = useCallback((id: string): boolean => {
    return cancelledIdsRef.current.has(id);
  }, []);

  const acknowledgeCancellation = useCallback((id: string) => {
    cancelledIdsRef.current.delete(id);
  }, []);

  const hasIncomingTasks = incomingTasks.length > 0;

  // Auto-cleanup stale incoming tasks that have been sitting too long
  // This prevents stuck placeholders if removeIncomingTask is never called (e.g., due to errors)
  useEffect(() => {
    if (incomingTasks.length === 0) return;

    const interval = setInterval(() => {
      const now = new Date();
      setIncomingTasks(prev => {
        const staleTasks = prev.filter(task => {
          const ageSeconds = (now.getTime() - task.startedAt.getTime()) / 1000;
          return ageSeconds > STALE_TASK_TIMEOUT_SECONDS;
        });

        if (staleTasks.length > 0) {
          return prev.filter(task => {
            const ageSeconds = (now.getTime() - task.startedAt.getTime()) / 1000;
            return ageSeconds <= STALE_TASK_TIMEOUT_SECONDS;
          });
        }
        return prev;
      });
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [incomingTasks.length]);

  const value = useMemo(() => ({
    incomingTasks,
    addIncomingTask,
    removeIncomingTask,
    resolveTaskIds,
    hasIncomingTasks,
    cancelIncoming,
    cancelAllIncoming,
    wasCancelled,
    acknowledgeCancellation,
  }), [incomingTasks, addIncomingTask, removeIncomingTask, resolveTaskIds, hasIncomingTasks, cancelIncoming, cancelAllIncoming, wasCancelled, acknowledgeCancellation]);

  return (
    <IncomingTasksContext.Provider value={value}>
      {children}
    </IncomingTasksContext.Provider>
  );
};

export const useIncomingTasks = (): IncomingTasksContextValue => {
  const context = useContext(IncomingTasksContext);
  if (!context) {
    throw new Error('useIncomingTasks must be used within an IncomingTasksProvider');
  }
  return context;
};
