import React from 'react';
import { Button } from '@/shared/components/ui/button';

interface GenerationsPaneEmptyStateProps {
  message: string;
  onShowEverything?: () => void;
}

export function GenerationsPaneEmptyState({ message, onShowEverything }: GenerationsPaneEmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[13px] text-zinc-500">
      <p>{message}</p>
      {onShowEverything && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[12px] text-zinc-300 hover:bg-white/5 hover:text-zinc-100"
          onClick={onShowEverything}
        >
          Show everything
        </Button>
      )}
    </div>
  );
}
