import { ArrowRight } from 'lucide-react';
import { APP_ENTRY_PATH, rememberAppEntryPreference } from '@/app/entryClassification.ts';
import { isMobileDevice } from './installScenario.ts';

/** The first visit starts with the browser-only welcome. */
export function PublicAstridHeroCta({ active = true }: { active?: boolean }) {
  return (
    <div className="astrid-hero-cta">
      <a className="astrid-button astrid-button-primary" href={APP_ENTRY_PATH}
        data-active={active} aria-hidden={!active} tabIndex={active ? undefined : -1}
        onClick={() => { if (!isMobileDevice()) rememberAppEntryPreference(); }}>
        <span>Get Started</span><ArrowRight size={17} aria-hidden="true" />
      </a>
    </div>
  );
}
