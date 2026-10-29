import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';

/**
 * The right action pane's presentation, independent of task discovery and chat sessions. Opaque: on a touch screen it
 * covers the editor, which must not show through it.
 */
export const TasksPaneSurface = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function TasksPaneSurface({ className, children, ...props }, ref) {
    return <div {...props} ref={ref} data-tasks-pane="true" data-pane-side="right" data-scroll-lock-scrollable="true"
      className={cn('h-full w-full bg-sidebar border-l border-sidebar-border text-sidebar-foreground shadow-xl flex flex-col pointer-events-auto', className)}>
      {children}
    </div>;
  },
);

/** Keeps chat clipped to the pane and gives its transcript a bounded flex height. */
export function TasksPaneChatSlot({ children }: { children: ReactNode }) {
  return <div data-tasks-pane-chat="true" className="overflow-hidden border-t-2 border-sidebar-border relative bg-background/60 flex-1 min-h-0">
    {children}
  </div>;
}
