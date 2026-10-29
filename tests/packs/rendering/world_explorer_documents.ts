// In-memory stand-in for the Runtime project document surface (creative.documents) with the same semantics:
// get throws {status: 404} when the document is missing, create starts at version 1, and update throws
// {status: 409} when expectedVersion is stale. Tests seed it and simulate concurrent writers with externalWrite.
import type { CreativeProjectDocument, ProjectDocumentSurface } from '@astrid/editor-sdk';
import { LIBRARY_KIND, libraryDocumentId } from '../../../astrid/packs/rendering/ui/threejs-live-editor/explorer/library';

export type FakeDocuments = ProjectDocumentSurface & {
  readonly docs: Map<string, CreativeProjectDocument>;
  /** Another viewer saving the document: bumps the version, so a stale update gets a 409. */
  externalWrite(id: string, content: unknown): void;
};

export function fakeDocuments(options: { projectId?: string; library?: unknown[] } = {}): FakeDocuments {
  const projectId = options.projectId ?? 'p1';
  const docs = new Map<string, CreativeProjectDocument>();
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
  const put = (id: string, kind: string, content: unknown, version: number): CreativeProjectDocument => {
    const doc = {
      document_id: id, project_id: projectId, kind, content, version,
      created_at: '2026-10-21T00:00:00Z', updated_at: '2026-10-21T00:00:00Z',
    } as CreativeProjectDocument;
    docs.set(id, doc);
    return doc;
  };
  if (options.library) put(libraryDocumentId(projectId), LIBRARY_KIND, { version: 1, worlds: options.library }, 1);
  return {
    docs,
    async list(kind) {
      const items = [...docs.values()].filter((d) => d.kind === kind);
      return { items, next_cursor: null };
    },
    async get(id) {
      const doc = docs.get(id);
      if (!doc) throw httpError(404, `document ${id} not found`);
      return doc;
    },
    async create(kind, content, documentId) {
      const id = documentId ?? `doc-${docs.size + 1}`;
      if (docs.has(id)) throw httpError(409, `document ${id} exists`);
      const doc = put(id, kind, content, 1);
      notify();
      return doc;
    },
    async update(id, content, expectedVersion) {
      const doc = docs.get(id);
      if (!doc) throw httpError(404, `document ${id} not found`);
      if (doc.version !== expectedVersion) throw httpError(409, `version ${expectedVersion} is stale (now ${doc.version})`);
      const next = put(id, doc.kind, content, doc.version + 1);
      notify();
      return next;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    externalWrite(id, content) {
      const doc = docs.get(id);
      put(id, doc?.kind ?? LIBRARY_KIND, content, (doc?.version ?? 0) + 1);
    },
  };
}

/** The worlds stored in the project's library document (empty when there is none). */
export function storedWorlds(fake: FakeDocuments, projectId = 'p1'): unknown[] {
  const doc = fake.docs.get(libraryDocumentId(projectId));
  return (doc?.content as { worlds?: unknown[] } | undefined)?.worlds ?? [];
}
