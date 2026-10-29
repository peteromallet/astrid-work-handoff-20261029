import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { appThemeDarkness } from '@/shared/hooks/core/useAppTheme.ts';
import { locationForTimeZone } from '@/pages/Home/publicAstridLocation.ts';
import { skyDarknessAt, themeForDarkness } from '@/pages/Home/publicAstridSkyRender.ts';

/**
 * index.html's inline script paints the boot paper and ink before any bundle loads. With no cached theme (or one more
 * than an hour old) it works them out from the time of day. It cannot import the app's code, so it carries its own copy
 * of the sky sums; these tests run the script as the browser would and hold it to the app's own rule (useAppTheme).
 */
const INDEX_HTML = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const SCRIPT = INDEX_HTML.split('<script>').map((part) => part.split('</script>')[0]).find((part) => part.includes('astrid:boot-theme'))!;
const HOUR = 3_600_000;
const LIGHT = { background: 'hsl(40 33% 97%)', ink: 'hsl(32 14% 14%)' };
const DARK = { background: 'hsl(30 11% 7%)', ink: 'hsl(40 30% 93%)' };

/** Runs the inline script in a page with this clock, time zone and storage; returns the properties it set on the root. */
function boot({ now, timeZone = 'Europe/London', storage = {} }: { now: Date; timeZone?: string; storage?: Record<string, string> }) {
  const properties: Record<string, string> = {};
  const FixedDate = class extends Date {
    constructor(...args: unknown[]) {
      super(...(args.length ? (args as [number]) : [now.getTime()]));
    }
    static now() { return now.getTime(); }
  };
  const zonedIntl = {
    DateTimeFormat: function DateTimeFormat(locale?: string, options?: Intl.DateTimeFormatOptions) {
      if (!options) return { resolvedOptions: () => ({ timeZone }) };
      return new Intl.DateTimeFormat(locale, options);
    },
  };
  const context = vm.createContext({
    Date: FixedDate,
    Intl: zonedIntl,
    Math,
    Number,
    JSON,
    RegExp,
    document: { documentElement: { style: { setProperty: (name: string, value: string) => { properties[name] = value; } } } },
    localStorage: { getItem: (key: string) => storage[key] ?? null },
  });
  vm.runInContext(SCRIPT, context);
  return properties;
}

const ZONES = [
  'Europe/London', 'America/New_York', 'Asia/Tokyo', 'Australia/Sydney', 'Atlantic/Reykjavik', 'America/Sao_Paulo',
  'Asia/Kolkata', 'Pacific/Auckland',
  // Not in the table: the offset gives the longitude, the region the hemisphere.
  'Pacific/Chatham', 'Europe/Samara', 'Etc/UTC',
];
const DAYS = ['2026-01-15', '2026-03-29', '2026-06-21', '2026-10-17'];

describe('the boot paper chosen from the time of day', () => {
  it('is dark exactly when the app is dark (useAppTheme: the sky\'s darkness past mid-twilight), for any place, day and half hour', () => {
    let darkOnes = 0;
    let checked = 0;
    for (const timeZone of ZONES) {
      for (const day of DAYS) {
        for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
          const now = new Date(Date.parse(`${day}T00:00:00Z`) + minutes * 60_000);
          const expected = themeForDarkness(skyDarknessAt(now, locationForTimeZone(timeZone, now)));
          const properties = boot({ now, timeZone });
          const paper = expected === 'dark' ? DARK : LIGHT;
          expect(properties, `${timeZone} ${now.toISOString()} should be ${expected}`).toEqual({ '--boot-background': paper.background, '--boot-ink': paper.ink });
          darkOnes += expected === 'dark' ? 1 : 0;
          checked += 1;
        }
      }
    }
    // The grid really covers both sides of the rule.
    expect(darkOnes).toBeGreaterThan(checked * 0.25);
    expect(darkOnes).toBeLessThan(checked * 0.75);
  });

  it('with no cached theme, a first visit at night opens on dark paper, and by day on light', () => {
    expect(boot({ now: new Date('2026-06-21T23:30:00Z') })['--boot-background']).toBe(DARK.background);
    expect(boot({ now: new Date('2026-06-21T12:00:00Z') })['--boot-background']).toBe(LIGHT.background);
  });

  it('keeps a cached theme written within the hour, whatever the sky says', () => {
    const now = new Date('2026-06-21T23:30:00Z');
    const cached = { background: 'rgb(1, 2, 3)', ink: 'rgb(4, 5, 6)', at: now.getTime() - HOUR + 60_000 };
    expect(boot({ now, storage: { 'astrid:boot-theme': JSON.stringify(cached) } })).toEqual({ '--boot-background': 'rgb(1, 2, 3)', '--boot-ink': 'rgb(4, 5, 6)' });
  });

  it('works the theme out again when the cache is older than an hour, or has no time on it', () => {
    const now = new Date('2026-06-21T23:30:00Z');
    const day = { background: 'rgb(247, 244, 237)', ink: 'rgb(40, 36, 31)' };
    for (const cached of [{ ...day, at: now.getTime() - HOUR - 1 }, { ...day, at: now.getTime() - 12 * HOUR }, day]) {
      expect(boot({ now, storage: { 'astrid:boot-theme': JSON.stringify(cached) } })['--boot-background']).toBe(DARK.background);
    }
  });

  it('follows the clock time a person fixed in settings, as the app does', () => {
    // The app reads "today at that hour" on this device, in this device's own time zone.
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const sides = new Set<string>();
    for (const fixed of [3, 12, 23]) {
      for (const now of [new Date('2026-06-21T12:00:00Z'), new Date('2026-12-21T23:30:00Z')]) {
        const expected = themeForDarkness(appThemeDarkness(fixed, now));
        const paper = expected === 'dark' ? DARK : LIGHT;
        expect(boot({ now, timeZone, storage: { 'theme-hour': String(fixed) } })['--boot-background'], `fixed at ${fixed}h, now ${now.toISOString()}`).toBe(paper.background);
        sides.add(expected);
      }
    }
    expect([...sides].sort()).toEqual(['dark', 'light']);
  });
});
