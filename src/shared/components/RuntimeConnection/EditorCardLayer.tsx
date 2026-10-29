import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/shared/components/ui/contracts/cn.ts';
import { EmptyEditorShell } from './EmptyEditorShell.tsx';

/** The blurred empty editor shown behind an onboarding card. */
export function EditorBackdrop({ leaving = false }: { readonly leaving?: boolean }) {
  // Fades in over the boot screen's paper; fades out over the real editor.
  return <div className={cn('fixed inset-0 transition-opacity duration-500 ease-out animate-in fade-in-0 motion-reduce:animate-none motion-reduce:transition-none', leaving && 'opacity-0')}>
    <EmptyEditorShell />
    <div aria-hidden="true" className="absolute inset-0 bg-foreground/[0.07] backdrop-blur-[2px]" />
  </div>;
}

export interface EditorCardLayerProps extends HTMLAttributes<HTMLElement> {
  readonly leaving?: boolean;
  readonly cardKey?: string;
  readonly children: ReactNode;
}

/** A full-screen layer that presents an onboarding card over the editor shell. */
export function EditorCardLayer({ leaving = false, cardKey, children, className, ...props }: EditorCardLayerProps) {
  // Over the app's own panes (the chat pane sits at z 100016) while the app mounts beneath it.
  return <section {...props} className={cn('fixed inset-0 z-[100100] overflow-y-auto text-foreground', leaving && 'pointer-events-none', className)}>
    <EditorBackdrop leaving={leaving} />
    {/* In the middle of the screen on a phone too, as the tour's cards are; the bottom inset clears a home indicator. */}
    <div className="relative flex min-h-full items-center justify-center p-4 max-sm:p-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div key={cardKey} className={cn('w-full max-w-[576px] transition-[opacity,transform] duration-300 ease-out animate-in fade-in-0 motion-reduce:transition-none motion-reduce:animate-none', leaving && '-translate-y-1 opacity-0')}>
        {children}
      </div>
    </div>
  </section>;
}
