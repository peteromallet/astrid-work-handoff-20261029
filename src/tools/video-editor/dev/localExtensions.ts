/**
 * Pack-authored editor extensions admitted by Astrid's generated catalog.
 *
 * `VideoEditorPage` admits only reviewed extensions before activating
 * these entries in production. Both builds honor the Extension Manager's
 * built-in disabled-ID store. Host-only smoke checks remain separate from this catalog.
 */
import type { AstridExtension } from '@astrid/editor-sdk';
import { ASTRID_EDITOR_EXTENSIONS } from '@astrid/packs/rendering/editor/catalog';

export const devLocalExtensions: AstridExtension[] = [...ASTRID_EDITOR_EXTENSIONS];
