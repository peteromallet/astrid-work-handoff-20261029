import { probeBridgeSession } from '@/shared/auth/bridgeSession.ts';
import { astridBase } from '@/integrations/runtime/connection.ts';
import { AstridBridgeTransport, BridgeRouteError } from './transport.ts';
import { AstridLocalProjectRoutes } from './projectRoutes.ts';
import { runtimeTaskReadPageSchema } from './taskReadSchemas.ts';
import { runtimeGenerationPageSchema } from '@/tools/video-editor/data/bridgeContract.ts';

/**
 * One-shot capability inspection for the setup step and the doctor read. There is no shared census
 * store: workspace.v1 owns capability discovery (the Runtime handshake), and no feature poller gates on
 * a boot probe.
 */
export type AstridCapability = 'tasks' | 'generations' | 'media';
export type AstridCapabilitySupport = 'supported' | 'unavailable' | 'unknown';

export interface AstridCapabilityCensus {
  health: 'available' | 'unavailable';
  readiness: 'ready' | 'degraded' | 'unavailable';
  projectSlug: string | null;
  capabilities: Record<AstridCapability, AstridCapabilitySupport>;
  reasons: Partial<Record<AstridCapability | 'health' | 'projects', string>>;
}

function isPermanentCapabilityUnavailable(error: unknown): boolean {
  return error instanceof BridgeRouteError
    && (
      error.code === 'capability_unavailable'
      || error.category === 'capability_unavailable'
      || (error.status === 404 && /unknown route:/i.test(error.detail ?? ''))
    );
}

function supportAfterProbe(error: unknown): { support: AstridCapabilitySupport; reason: string } {
  return {
    support: isPermanentCapabilityUnavailable(error) ? 'unavailable' : 'unknown',
    reason: error instanceof Error ? error.message : String(error),
  };
}

async function probeJsonCapability(operation: () => Promise<unknown>) {
  try {
    await operation();
    return { support: 'supported' as const, reason: undefined };
  } catch (error) {
    return supportAfterProbe(error);
  }
}

async function probeMediaCapability(
  transport: AstridBridgeTransport,
  knownMediaId?: string,
): Promise<{ support: AstridCapabilitySupport; reason?: string }> {
  const mediaRef = knownMediaId?.startsWith('sha256:')
    ? knownMediaId
    : `sha256:${'0'.repeat(64)}`;
  const contentPath = `/v1/objects/${encodeURIComponent(mediaRef)}`;
  try {
    const response = await transport.requestRaw(
      contentPath,
      { method: 'HEAD' },
    );
    if (response.ok) return { support: 'supported' };

    // A missing sentinel object proves that the content route exists. An old
    // bridge instead answers its typed `unknown route:` envelope.
    if (response.status === 404) {
      // HEAD responses intentionally have no body in browsers, so use one
      // bounded GET of the nonexistent sentinel only to distinguish the
      // route's ordinary object-not-found from the bridge router's unknown
      // route envelope.
      const diagnostic = await transport.requestRaw(
        contentPath,
        { method: 'GET' },
      );
      let detail = '';
      try {
        const body = await diagnostic.json() as {
          detail?: unknown;
          message?: unknown;
          code?: unknown;
        };
        detail = [body.detail, body.message, body.code]
          .filter((value): value is string => typeof value === 'string')
          .join(' ');
      } catch {
        // A plain 404 is the ordinary "media object absent" route answer.
      }
      return /unknown route:/i.test(detail)
        ? { support: 'unavailable', reason: detail }
        : { support: 'supported' };
    }

    if (response.status === 422) {
      return { support: 'unavailable', reason: 'media content capability unavailable' };
    }
    return { support: 'unknown', reason: `media probe responded ${response.status}` };
  } catch (error) {
    return supportAfterProbe(error);
  }
}

async function probeGenerationCapability(
  transport: AstridBridgeTransport,
  encodedProject: string,
): Promise<{ support: AstridCapabilitySupport; reason?: string; mediaId?: string }> {
  try {
    await transport.requestJson(
      `/v1/projects/${encodedProject}/generations?limit=1`,
      {},
      runtimeGenerationPageSchema,
      'generation capability probe',
    );
    return {
      support: 'supported',
      mediaId: undefined,
    };
  } catch (error) {
    return supportAfterProbe(error);
  }
}

/**
 * Select only from projects returned by the local bridge. A canonical URL
 * owns project selection when it names one of those projects; an unknown
 * explicit selection has no fallback. With no URL selection keep the
 * historical first-project default. Never consult cloud or persisted
 * project selection here: this census is a bridge-only boot probe.
 */
function selectCapabilityProbeProject(
  projects: Array<{ slug: string; project_id?: string }>,
): string | null {
  const fallback = projects[0]?.slug ?? null;
  if (typeof window === 'undefined') return fallback;

  let requested: string | null = null;
  try {
    requested = new URLSearchParams(window.location.search).get('project')?.trim() || null;
  } catch {
    // A malformed location must not prevent the bridge health census from
    // completing; use the bridge-owned fallback below.
  }
  const selected = requested ? projects.find((project) =>
    project.project_id === requested || project.slug === requested,
  ) : null;
  return selected?.slug ?? (requested ? null : fallback);
}

/**
 * One bounded boot census. Health and feature support are deliberately
 * separate: a healthy older bridge can lack the task/gallery/media routes.
 */
export async function inspectAstridCapabilities(
  baseUrl: string = astridBase(),
): Promise<AstridCapabilityCensus> {
  const session = await probeBridgeSession(baseUrl);
  if (!session.ok) {
    return {
      health: 'unavailable',
      readiness: 'unavailable',
      projectSlug: null,
      capabilities: { tasks: 'unknown', generations: 'unknown', media: 'unknown' },
      reasons: { health: session.reason },
    };
  }

  const transport = new AstridBridgeTransport({ baseUrl });
  let projectSlug: string | null = null;
  try {
    const projects = await new AstridLocalProjectRoutes(transport).list();
    projectSlug = selectCapabilityProbeProject(projects);
  } catch (error) {
    return {
      health: 'available',
      readiness: 'degraded',
      projectSlug: null,
      capabilities: { tasks: 'unknown', generations: 'unknown', media: 'unknown' },
      reasons: { projects: error instanceof Error ? error.message : String(error) },
    };
  }

  if (!projectSlug) {
    return {
      health: 'available',
      readiness: 'degraded',
      projectSlug: null,
      capabilities: { tasks: 'unknown', generations: 'unknown', media: 'unknown' },
      reasons: { projects: 'No project exists yet; project-scoped capabilities were not probed.' },
    };
  }

  const encodedProject = encodeURIComponent(projectSlug);
  const [tasks, generations] = await Promise.all([
    probeJsonCapability(() => transport.requestJson(
      `/v1/projects/${encodedProject}/tasks?limit=1`,
      {},
      runtimeTaskReadPageSchema,
      'task capability probe',
    )),
    probeGenerationCapability(transport, encodedProject),
  ]);
  // When the bridge already exposed a primary managed-media id, probe that
  // real object instead of intentionally generating a noisy sentinel 404.
  // Empty/older galleries retain the diagnostic sentinel fallback.
  const media = await probeMediaCapability(transport, generations.mediaId);
  const capabilities = {
    tasks: tasks.support,
    generations: generations.support,
    media: media.support,
  } satisfies AstridCapabilityCensus['capabilities'];
  const reasons: AstridCapabilityCensus['reasons'] = {};
  if (tasks.reason) reasons.tasks = tasks.reason;
  if (generations.reason) reasons.generations = generations.reason;
  if (media.reason) reasons.media = media.reason;

  return {
    health: 'available',
    readiness: Object.values(capabilities).every((value) => value === 'supported')
      ? 'ready'
      : 'degraded',
    projectSlug,
    capabilities,
    reasons,
  };
}
