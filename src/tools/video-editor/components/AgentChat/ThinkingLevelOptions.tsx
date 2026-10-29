import { Check, Loader2 } from 'lucide-react';
import { CommandGroup, CommandItem } from '@/shared/components/ui/command.tsx';
import { cn } from '@/shared/components/ui/contracts/cn';
import type { AgentThoughtLevel } from '@/integrations/astrid/localAgents.ts';

/** A model's thinking levels as command items: the current one checked, the service's recommendation marked. */
export function ThinkingLevelOptions({ levels, value, pendingValue = null, disabled = false, onSelect }: {
  levels: AgentThoughtLevel;
  value: string;
  /** A level being applied; it shows a spinner in place of the check. */
  pendingValue?: string | null;
  disabled?: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <CommandGroup heading="Thinking level">
      {levels.options.map(level => (
        <CommandItem key={level.value} value={level.value} disabled={disabled} aria-current={level.value === value ? 'true' : undefined}
          className="min-h-8 items-start gap-2 [@media(pointer:coarse)]:min-h-[44px]" onSelect={() => onSelect(level.value)}>
          {pendingValue === level.value
            ? <Loader2 className="mt-[3px] h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
            : <Check className={cn('mt-[3px] h-3.5 w-3.5 shrink-0', level.value === value ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-baseline gap-2">
              <span>{level.name}</span>
              {level.value === levels.recommendedValue && <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">Recommended</span>}
            </span>
            {level.description && <span className="text-[11px] leading-snug text-muted-foreground">{level.description}</span>}
          </span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
