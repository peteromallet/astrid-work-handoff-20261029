import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const remotionMocks = vi.hoisted(() => ({
  delayRender: vi.fn(() => 7),
  continueRender: vi.fn(),
}));

vi.mock('remotion', () => ({
  delayRender: remotionMocks.delayRender,
  continueRender: remotionMocks.continueRender,
}));

import { LOCAL_FONT_FACES, LOCAL_FONT_GLYPH_PROBE } from '../../../../vendor/astrid-browser/remotion/src/fonts.ts';
import { LocalFontFaces, localFontFaceCss, localFontSpec } from './LocalFontFaces.tsx';

const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');

describe('LocalFontFaces', () => {
  let load: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    remotionMocks.delayRender.mockClear();
    remotionMocks.continueRender.mockClear();
    load = vi.fn(() => Promise.resolve([]));
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load, check: vi.fn(() => true) } });
  });

  afterEach(() => {
    if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
    else delete (document as { fonts?: unknown }).fonts;
  });

  it('registers every Astrid local face, including Gelasio and Departure Mono', () => {
    const css = localFontFaceCss();
    for (const face of LOCAL_FONT_FACES) {
      expect(css).toContain(`font-family: '${face.family}'`);
      expect(css).toContain(`font-weight: ${face.weight}`);
    }
    expect(css).toMatch(/font-family: 'Gelasio'[^}]*font-style: italic/);
    expect(css).toMatch(/font-family: 'Departure Mono'[^}]*url\('[^']*\.woff2'\)/);
    expect(css.match(/@font-face/g)).toHaveLength(LOCAL_FONT_FACES.length);
  });

  it('holds the composition, requests every face with the render glyph probe, then releases it', async () => {
    render(<LocalFontFaces />);

    expect(remotionMocks.delayRender).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(remotionMocks.continueRender).toHaveBeenCalledWith(7));
    expect(load.mock.calls.map(([spec]) => spec).sort()).toEqual(LOCAL_FONT_FACES.map(localFontSpec).sort());
    for (const [, probe] of load.mock.calls) expect(probe).toBe(LOCAL_FONT_GLYPH_PROBE);
    expect(localFontSpec(LOCAL_FONT_FACES.find((f) => f.family === 'Gelasio' && f.style === 'italic')!)).toBe('italic 400 16px "Gelasio"');
  });

  it('still releases the composition when a face fails to load', async () => {
    load.mockImplementation((spec: string) => (spec.includes('Gelasio') ? Promise.reject(new Error('network')) : Promise.resolve([])));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<LocalFontFaces />);

    await waitFor(() => expect(remotionMocks.continueRender).toHaveBeenCalledWith(7));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Gelasio'));
    warn.mockRestore();
  });
});
