import { useState } from 'react';
import { useRuntimeRequestWait } from '@/integrations/runtime/useRuntimeRequestWait.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { EditorCard } from './EditorCard.tsx';

/** Release the boot layer when discovery needs the person's attention, even if no request settles. */
export function WorkspaceDiscoveryPending({ onRetry, onOpenEditor, waitedAlready = false }: {
  /** The caller already held its own loading screen for the deadline. */
  waitedAlready?: boolean;
  onRetry: () => void;
  onOpenEditor?: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const stillWaiting = useRuntimeRequestWait(true, attempt) || (waitedAlready && attempt === 0);
  return <div className="flex flex-1 items-center justify-center px-6 py-10">
    {!stillWaiting && <span data-boot-hold="" hidden />}
    <div className="w-full max-w-[576px]">
      <EditorCard title={stillWaiting ? 'Still waiting for your workspace' : 'Opening your workspace…'} sentence={<span role="status">{stillWaiting
        ? 'Astrid on this computer is taking longer than usual. You can keep waiting or try again.'
        : 'Astrid is looking for your projects on this computer.'}</span>}>
        {stillWaiting && <div className={onOpenEditor ? 'grid gap-2 sm:grid-cols-2' : ''}>
          <Button className="h-11 w-full rounded-xl" onClick={() => { setAttempt(value => value + 1); onRetry(); }}>Try again</Button>
          {onOpenEditor && <Button className="h-11 w-full rounded-xl" variant="outline" onClick={onOpenEditor}>Open editor</Button>}
        </div>}
      </EditorCard>
    </div>
  </div>;
}
