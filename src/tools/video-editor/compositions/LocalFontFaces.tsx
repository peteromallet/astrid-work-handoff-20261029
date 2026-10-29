import { continueRender, delayRender } from 'remotion';
import { createElement, useEffect, useState, type ReactElement } from 'react';
import {
  LOCAL_FONT_FACES,
  LOCAL_FONT_GLYPH_PROBE,
  type LocalFontFace,
} from '../../../../vendor/astrid-browser/remotion/src/fonts.ts';

// The same binaries Astrid's renderer registers (remotion/src/fonts.ts), vendored
// with their sha256 record in vendor/astrid-browser/provenance.json. Vite emits
// each one as a hashed asset URL.
const FONT_URLS = import.meta.glob<string>('../../../../vendor/astrid-browser/remotion/public/fonts/*.woff2', {
  eager: true,
  query: '?url',
  import: 'default',
});

const fontUrl = (file: string): string => {
  const name = file.split('/').pop() ?? file;
  const url = Object.entries(FONT_URLS).find(([path]) => path.endsWith(`/${name}`))?.[1];
  if (!url) throw new Error(`Vendored Astrid font is missing from the bundle: ${file}`);
  return url;
};

export const localFontFaceCss = (faces: readonly LocalFontFace[] = LOCAL_FONT_FACES): string =>
  faces
    .map(
      ({ family, file, weight, style = 'normal' }) =>
        `@font-face { font-family: '${family}'; src: url('${fontUrl(file)}') format('woff2'); font-weight: ${weight}; font-style: ${style}; font-display: block; }`,
    )
    .join('\n');

export const localFontSpec = ({ family, weight, style }: LocalFontFace): string =>
  `${style === 'italic' ? 'italic ' : ''}${weight} 16px "${family}"`;

let fontFaceRegistration: Promise<readonly LocalFontFace[]> | null = null;

/**
 * Adds each face to the document only once its file has loaded. A CSS @font-face
 * rule takes over 'Inter', which the editor UI also uses, while its file is still
 * in flight, and `font-display: block` then blanks every UI label until it lands.
 * Resolves with the faces that failed. Runs once per page.
 */
function registerLoadedFontFaces(): Promise<readonly LocalFontFace[]> {
  fontFaceRegistration ??= Promise.allSettled(
    LOCAL_FONT_FACES.map(async (face) => {
      const fontFace = new FontFace(face.family, `url('${fontUrl(face.file)}') format('woff2')`, {
        weight: String(face.weight),
        style: face.style ?? 'normal',
      });
      await fontFace.load();
      document.fonts.add(fontFace);
    }),
  ).then((results) => results.flatMap((result, index) => (result.status === 'rejected' ? [LOCAL_FONT_FACES[index]] : [])));
  return fontFaceRegistration;
}

const canRegisterLoadedFaces = (): boolean =>
  typeof FontFace !== 'undefined' && typeof document !== 'undefined' && typeof document.fonts?.add === 'function';

/**
 * Registers Astrid's shipped local faces for the editor preview and holds the
 * composition until each face has loaded, so text is never measured against a
 * system fallback. A failed load is logged and released: the preview should
 * degrade to a fallback rather than hang. Without the FontFace API it falls back
 * to @font-face rules.
 */
export function LocalFontFaces(): ReactElement | null {
  const [renderHandle] = useState(() => delayRender('Loading Astrid local fonts'));
  const [cssFaces] = useState(() => !canRegisterLoadedFaces());

  useEffect(() => {
    let cancelled = false;
    const release = () => {
      if (!cancelled) continueRender(renderHandle);
    };
    const loadFonts = async (): Promise<void> => {
      if (typeof document === 'undefined' || !document.fonts) {
        console.warn('Astrid local fonts need the FontFaceSet API; using system fallbacks.');
        return;
      }
      if (!cssFaces) {
        const unregistered = await registerLoadedFontFaces();
        if (unregistered.length > 0) {
          console.warn(`Astrid local font registration failed: ${unregistered.map((face) => localFontSpec(face)).join(', ')}`);
        }
      }
      const results = await Promise.allSettled(
        LOCAL_FONT_FACES.map((face) => document.fonts.load(localFontSpec(face), LOCAL_FONT_GLYPH_PROBE)),
      );
      const failed = results.flatMap((result, index) => (result.status === 'rejected' ? [LOCAL_FONT_FACES[index]] : []));
      if (failed.length > 0) {
        console.warn(`Astrid local font load failed: ${failed.map((face) => localFontSpec(face)).join(', ')}`);
      }
    };
    loadFonts().catch((error) => console.warn('Astrid local font load failed', error)).finally(release);
    return () => {
      cancelled = true;
    };
  }, [cssFaces, renderHandle]);

  return cssFaces ? createElement('style', { 'data-astrid-local-fonts': true }, localFontFaceCss()) : null;
}
