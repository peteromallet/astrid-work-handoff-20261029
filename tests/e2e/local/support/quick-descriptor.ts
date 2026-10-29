/** Private handoff from Astrid F1 to the App QUICK journey. */
export interface QuickDescriptor {
  version: 1;
  dataRoot: string;
  sourceManifest: string;
  discoveryFile: string;
  /** The hosted origin the adopted Runtime's door serves (https), and the door's loopback endpoint (http). */
  hostedOrigin: string;
  doorEndpoint: string;
  productCredentialFile: string;
  astridCredentialFile: string;
  projectId: string;
  projectSlug: string;
  timelineId: string;
  headRevisionId: string;
  realmId: string;
  runtimeInstanceId: string;
  /** N4 acceptance provenance for the already-imported CLI archive. */
  sourceArchiveBytes?: number;
  freeBytesBefore?: number;
  /** Physical short TMPDIR used by the N4 fixture children. */
  shortTmpDir?: string;
  /** Optional empty project provisioned by the N4 Runtime fixture for the UI archive round trip. */
  transferProjectId?: string;
  transferProjectName?: string;
  revisions: { astrid: string; runtime: string; app: string };
  resultFile: string;
}

const pathKeys = ['dataRoot', 'sourceManifest', 'discoveryFile', 'productCredentialFile', 'astridCredentialFile', 'resultFile'] as const;
const urlKeys = ['hostedOrigin', 'doorEndpoint'] as const;
const idKeys = ['projectId', 'projectSlug', 'timelineId', 'headRevisionId', 'realmId', 'runtimeInstanceId'] as const;
const sha = /^[0-9a-f]{40}$/;

export function parseQuickDescriptor(text: string): QuickDescriptor {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('ASTRID_QUICK_DESCRIPTOR must contain valid JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ASTRID_QUICK_DESCRIPTOR must be a JSON object');
  const record = value as Record<string, unknown>;
  if (record.version !== 1) throw new Error('ASTRID_QUICK_DESCRIPTOR version must be 1');
  for (const key of ['sourceArchiveBytes', 'freeBytesBefore'] as const) {
    if (record[key] !== undefined && (typeof record[key] !== 'number' || !Number.isSafeInteger(record[key]) || record[key] <= 0)) {
      throw new Error(`ASTRID_QUICK_DESCRIPTOR ${key} must be a positive safe integer`);
    }
  }
  if (record.shortTmpDir !== undefined && (typeof record.shortTmpDir !== 'string' || !isAbsolutePath(record.shortTmpDir))) {
    throw new Error('ASTRID_QUICK_DESCRIPTOR shortTmpDir must be an absolute path when present');
  }
  for (const key of ['transferProjectId', 'transferProjectName'] as const) {
    if (record[key] !== undefined && (typeof record[key] !== 'string' || !record[key])) {
      throw new Error(`ASTRID_QUICK_DESCRIPTOR ${key} must be a nonempty string`);
    }
  }
  for (const key of pathKeys) {
    if (typeof record[key] !== 'string' || !record[key]) throw new Error(`ASTRID_QUICK_DESCRIPTOR ${key} must be a nonempty absolute path`);
    if (!isAbsolutePath(record[key] as string)) throw new Error(`ASTRID_QUICK_DESCRIPTOR ${key} must be an absolute path`);
  }
  for (const key of idKeys) if (typeof record[key] !== 'string' || !record[key]) throw new Error(`ASTRID_QUICK_DESCRIPTOR ${key} must be a nonempty string`);
  for (const key of urlKeys) {
    if (typeof record[key] !== 'string' || !URL.canParse(record[key] as string) || !new URL(record[key] as string).port) throw new Error(`ASTRID_QUICK_DESCRIPTOR ${key} must be an absolute URL with an explicit port`);
  }
  if (!record.revisions || typeof record.revisions !== 'object' || Array.isArray(record.revisions)) throw new Error('ASTRID_QUICK_DESCRIPTOR revisions must be an object');
  const revisions = record.revisions as Record<string, unknown>;
  for (const key of ['astrid', 'runtime', 'app'] as const) if (typeof revisions[key] !== 'string' || !sha.test(revisions[key] as string)) throw new Error(`ASTRID_QUICK_DESCRIPTOR revisions.${key} must be a 40-character Git SHA`);
  return record as unknown as QuickDescriptor;
}

export function loadQuickDescriptor(file: string): QuickDescriptor {
  if (!isAbsolutePath(file)) throw new Error('ASTRID_QUICK_DESCRIPTOR must be an absolute path to its JSON file');
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('ASTRID_QUICK_DESCRIPTOR must name a regular file, not a symlink');
  if ((stat.mode & 0o077) !== 0) throw new Error('ASTRID_QUICK_DESCRIPTOR file must not be readable or writable by group or others');
  return parseQuickDescriptor(readFileSync(file, 'utf8'));
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}
import { lstatSync, readFileSync } from 'node:fs';

