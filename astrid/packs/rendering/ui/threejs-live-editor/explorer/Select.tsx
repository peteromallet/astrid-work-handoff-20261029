import type { ChangeEvent, ReactNode } from 'react';
import { select } from './ui';

/** A native select drawn like the panel's buttons: transparent, hairline border, our own chevron. */
export function Select({ label, value, disabled, onChange, children }: {
  label: string; value: string; disabled?: boolean; onChange: (event: ChangeEvent<HTMLSelectElement>) => void; children: ReactNode;
}) {
  return (
    <span className="relative inline-flex min-w-0 max-w-full">
      <select aria-label={label} className={`${select} w-full`} value={value} disabled={disabled} onChange={onChange}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}
