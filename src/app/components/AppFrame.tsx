import type { ReactNode } from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { AppSkyBackground } from '@/shared/components/TimeOfDay/TimeOfDayControl';

/** Shared outer app frame for the routed app and isolated editor surfaces. */
export function AppFrame({ children, fullEditor = false }: { children: ReactNode; fullEditor?: boolean }) {
  return (
    <div className={cn('relative flex min-h-screen flex-col', fullEditor && 'h-dvh min-h-0 overflow-hidden')}>
      <AppSkyBackground />
      {children}
    </div>
  );
}
