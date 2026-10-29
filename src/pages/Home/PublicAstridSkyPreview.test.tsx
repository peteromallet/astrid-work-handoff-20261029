import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PublicAstridSkyPreview } from './PublicAstridSkyPreview';
import { createPublicAstridSkySession } from './publicAstridSkySession';

const environment = { visible: true, reducedMotion: true, phone: false };
const NOON_UTC = Date.UTC(2026, 9, 6, 12);

describe('public Astrid sky preview control', () => {
  const sessions: Array<ReturnType<typeof createPublicAstridSkySession>> = [];
  afterEach(() => { sessions.splice(0).forEach((session) => session.destroy()); });

  function setup(hours: number | null) {
    const session = createPublicAstridSkySession({ environment, now: () => NOON_UTC });
    sessions.push(session);
    session.mount();
    render(<PublicAstridSkyPreview session={session} request={{ hours }} />);
    return session;
  }

  it('pins the sky session clock to the requested time', () => {
    const session = setup(3);
    expect(session.getSnapshot().hours).toBe(3);
    expect(session.getSnapshot().settings.hours).toBe(3);
    expect(session.getSnapshot().palette.theme).toBe('dark');
    expect(screen.getByRole('slider', { name: 'Time of day' })).toHaveProperty('value', '180');
    expect(screen.getByRole('group').textContent).toContain('03:00');
    // The real instant and the date are untouched.
    expect(session.getSnapshot().now).toBe(NOON_UTC);
  });

  it('scrubs the sky through the real pipeline and returns to live', () => {
    const session = setup(null);
    expect(session.getSnapshot().settings.hours).toBeNull();
    fireEvent.change(screen.getByRole('slider', { name: 'Time of day' }), { target: { value: '720' } });
    expect(session.getSnapshot().hours).toBe(12);
    expect(session.getSnapshot().palette.theme).toBe('light');
    fireEvent.change(screen.getByRole('slider', { name: 'Time of day' }), { target: { value: '1065' } });
    expect(session.getSnapshot().hours).toBe(17.75);
    act(() => screen.getByRole('button', { name: 'Live' }).click());
    expect(session.getSnapshot().settings.hours).toBeNull();
  });
});
