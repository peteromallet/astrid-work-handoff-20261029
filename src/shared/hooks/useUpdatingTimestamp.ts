import { useMemo } from 'react';
import { formatDistanceToNow, isValid } from 'date-fns';
import { abbreviateRelativeTime, formatRelativeDuration } from '@/shared/lib/timeFormatting';
import { useTimestampUpdater } from './useTimestampUpdater';

interface UseLiveRelativeTimestampOptions {
  dateInput: string | Date | null | undefined;
  disabled: boolean;
  formatter: (date: Date) => string;
}

export function useLiveRelativeTimestamp({
  dateInput,
  disabled,
  formatter,
}: UseLiveRelativeTimestampOptions): string | null {
  const parsedDate = useMemo(() => {
    if (!dateInput) {
      return null;
    }

    const parsed = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return isValid(parsed) ? parsed : null;
  }, [dateInput]);

  // The updater's tick state re-renders this host on every update, so the
  // formatter runs on each render and no memo keyed on the tick is needed.
  useTimestampUpdater({
    date: parsedDate,
    disabled,
    isVisible: true,
  });

  if (!parsedDate) {
    return null;
  }
  return formatter(parsedDate);
}

type RelativeTimestampPreset = 'default' | 'task' | 'processing' | 'completed';

interface UseRelativeTimestampOptions {
  date?: string | Date | null;
  abbreviate?: (str: string) => string;
  disabled?: boolean;
  preset?: RelativeTimestampPreset;
}

const relativeTimestampFormatters: Record<
  RelativeTimestampPreset,
  (date: Date, abbreviate: (str: string) => string) => string
> = {
  default: (date, abbreviate) => abbreviate(formatDistanceToNow(date, { addSuffix: true })),
  task: (date) => {
    const abbreviated = abbreviateRelativeTime(formatDistanceToNow(date, { addSuffix: true }));
    return abbreviated || '<1 min ago';
  },
  processing: (date) => `Processing for ${formatRelativeDuration(date, { includeDays: false })}`,
  completed: (date) => `Completed ${formatRelativeDuration(date)} ago`,
};

export function useRelativeTimestamp({
  date,
  abbreviate = abbreviateRelativeTime,
  disabled = false,
  preset = 'default',
}: UseRelativeTimestampOptions = {}): string | null {
  const formatter = relativeTimestampFormatters[preset];

  return useLiveRelativeTimestamp({
    dateInput: date,
    disabled,
    formatter: (parsedDate) => formatter(parsedDate, abbreviate),
  });
}

export function useTaskTimestamp(date?: string | Date | null) {
  return useRelativeTimestamp({
    date,
    preset: 'task',
  });
}
