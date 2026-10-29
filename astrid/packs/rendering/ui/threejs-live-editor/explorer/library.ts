// The project's world library: one versioned Runtime project document, shared by every timeline and viewer of the project.
import type { ProjectDocumentSurface } from '@astrid/editor-sdk';
import { libraryContent, parseLibrary, stableJson, type LibraryEntry } from './model';

export const LIBRARY_KIND = 'haus.astrid.threejs-live-editor.world-library';
// Runtime document ids are global, so the id carries the project.
export const libraryDocumentId = (projectId: string) => `world-library:${projectId}`;

const MAX_ATTEMPTS = 4;

const statusOf = (error: unknown) => (typeof error === 'object' && error !== null ? (error as { status?: unknown }).status : undefined);

async function readDocument(documents: ProjectDocumentSurface, id: string) {
  try {
    return await documents.get(id);
  } catch (error) {
    if (statusOf(error) === 404) return null;
    throw error;
  }
}

/** The project's worlds; empty when the project has no library yet. */
export async function loadLibrary(documents: ProjectDocumentSurface, projectId: string): Promise<LibraryEntry[]> {
  const doc = await readDocument(documents, libraryDocumentId(projectId));
  return doc ? parseLibrary(doc.content) : [];
}

/**
 * Applies `change` to the stored library and saves it. A concurrent save by another viewer (409) is re-read and the change
 * is applied to the newer list, so edits to different worlds never overwrite each other. Returns the saved list.
 */
export async function updateLibrary(
  documents: ProjectDocumentSurface,
  projectId: string,
  change: (list: LibraryEntry[]) => LibraryEntry[],
): Promise<LibraryEntry[]> {
  const id = libraryDocumentId(projectId);
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const doc = await readDocument(documents, id);
    const current = doc ? parseLibrary(doc.content) : [];
    const next = change(current);
    // Compare what would be stored (invalid items dropped) with stable key order, so a load that changes nothing writes nothing.
    if (doc && stableJson(parseLibrary(libraryContent(next))) === stableJson(current)) return current;
    try {
      if (doc) await documents.update(id, libraryContent(next), doc.version);
      else await documents.create(LIBRARY_KIND, libraryContent(next), id);
      return next;
    } catch (error) {
      if (statusOf(error) !== 409) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
