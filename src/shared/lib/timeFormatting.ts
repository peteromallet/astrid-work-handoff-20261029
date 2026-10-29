/**
 * Shared relative-time formatting utilities.
 *
 * Two flavours:
 *  - `formatRelativeDuration` – hand-rolls the diff from a Date to *now* and
 *    returns abbreviated strings like "5 mins", "1 hr, 30 mins", "2 days".
 *    Used where we need precise compound durations (e.g. "Processing for 1 hr, 30 mins").
 *
 *  - `abbreviateRelativeTime` – post-processes a date-fns `formatDistanceToNow`
 *    string into a shorter form ("about 2 hours ago" → "2 hrs ago").
 *    Used for simple "X ago" timestamps in task lists / galleries.
 */

// ── helpers ──────────────────────────────────────────────────────────────

function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

interface FormatClockTimeOptions {
  showMilliseconds?: boolean;
  millisecondsDigits?: 1 | 2 | 3;
}

export function formatTime(
  seconds: number,
  options: FormatClockTimeOptions = {},
): string {
  const { showMilliseconds = false, millisecondsDigits = 1 } = options;

  if (!Number.isFinite(seconds) || seconds < 0) {
    return showMilliseconds ? `0:00.${'0'.repeat(millisecondsDigits)}` : '0:00';
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const base = `${mins}:${secs.toString().padStart(2, '0')}`;

  if (!showMilliseconds) {
    return base;
  }

  const divisor = Math.pow(10, 3 - millisecondsDigits);
  const ms = Math.floor((seconds % 1) * 1000 / divisor);
  return `${base}.${ms.toString().padStart(millisecondsDigits, '0')}`;
}

/** `m:ss.cc` timecodes (timeline ruler and playback readout). */
export const CENTISECOND_TIME_OPTIONS = { showMilliseconds: true, millisecondsDigits: 2 } as const;

/** Clock time of an epoch timestamp ("10:48 PM"); "never" for 0 (unset). */
export function formatClockTime(epochMs: number): string {
  if (epochMs === 0) return 'never';
  try {
    return new Date(epochMs).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 'unknown';
  }
}

// ── precise duration from a Date ─────────────────────────────────────────

interface FormatRelativeDurationOptions {
  /** Include days in the output (default true). When false, hours keep accumulating. */
  includeDays?: boolean;
}

/**
 * Format the duration between `date` and *now* as an abbreviated string.
 *
 * Examples:
 *  - 30 s  → "<1 min"
 *  - 5 min → "5 mins"
 *  - 90 min → "1 hr, 30 mins"
 *  - 48 h  → "2 days"
 *  - 25 h  → "1 day, 1 hr"
 */
export function formatRelativeDuration(
  date: Date,
  options?: FormatRelativeDurationOptions,
): string {
  const { includeDays = true } = options ?? {};

  const diffMs = Date.now() - date.getTime();
  const totalMinutes = Math.floor(diffMs / 60_000);

  if (totalMinutes < 1) return '<1 min';

  if (totalMinutes < 60) return pluralize(totalMinutes, 'min', 'mins');

  if (!includeDays) {
    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    if (remainingMinutes === 0) return pluralize(hours, 'hr', 'hrs');
    return `${pluralize(hours, 'hr', 'hrs')}, ${pluralize(remainingMinutes, 'min', 'mins')}`;
  }

  // < 24 hours — show hours + minutes
  if (totalMinutes < 24 * 60) {
    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    if (remainingMinutes === 0) return pluralize(hours, 'hr', 'hrs');
    return `${pluralize(hours, 'hr', 'hrs')}, ${pluralize(remainingMinutes, 'min', 'mins')}`;
  }

  // >= 24 hours — show days + hours
  const days = Math.floor(totalMinutes / (24 * 60));
  const remainingHours = Math.floor((totalMinutes % (24 * 60)) / 60);
  if (remainingHours === 0) return pluralize(days, 'day', 'days');
  return `${pluralize(days, 'day', 'days')}, ${pluralize(remainingHours, 'hr', 'hrs')}`;
}

// ── abbreviate a date-fns "formatDistanceToNow" string ───────────────────

/**
 * Shorten a `formatDistanceToNow(..., { addSuffix: true })` result.
 *
 * "less than a minute ago" → "<1 min ago"
 * "about 2 hours ago"      → "2 hrs ago"
 * "3 minutes ago"           → "3 mins ago"
 */
export function abbreviateRelativeTime(str: string): string {
  // Handle singular special-cases first (date-fns may prefix with "about")
  if (str.includes('1 hr') || str.includes('1 hour'))   return '1 hr ago';
  if (str.includes('1 day'))                             return '1 day ago';
  if (str.includes('less than a minute'))                return '<1 min ago';
  if (str.includes('1 minute'))                          return '1 min ago';
  if (str.includes('1 second'))                          return '1 sec ago';

  // General abbreviation
  return str
    .replace(/^about /, '')
    .replace(/minutes?/, 'mins')
    .replace(/hours?/, 'hrs')
    .replace(/seconds?/, 'secs')
    .replace(/\bday\b/, 'days');
}
