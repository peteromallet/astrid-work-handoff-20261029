/**
 * Browser-side availability check for Astrid's doctor-owned local setup.
 *
 * The neutral Runtime exposes liveness at `/v1/health`, not the full CLI
 * doctor report. This probe therefore answers only whether the local runtime
 * is available. Detailed remediation remains owned by the read-only
 * `python3 -m astrid doctor --json` command.
 */

import { astridBase } from '@/integrations/runtime/connection.ts';
import { probeBridgeSession } from '@/shared/auth/bridgeSession.ts';
import {
  inspectAstridCapabilities,
  type AstridCapability,
} from './capabilityCensus.ts';

export const ASTRID_DOCTOR_COMMAND = 'python3 -m astrid doctor --json';

export type AstridDoctorAvailability =
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'degraded'; unavailable: AstridCapability[]; unknown: AstridCapability[]; reason: string }
  | { status: 'unavailable'; reason: string };

/**
 * Boot-time check: is the local Runtime answering at all? The launch decision (show the reconnect step or
 * not) needs only liveness, so it reads `/v1/health` alone. The full census above also probes a sentinel
 * media object, which on an empty gallery is a deliberate 404 on every launch; only the setup step and the
 * doctor read, which show per-capability support, pay for that.
 */
export async function checkAstridRuntimeReachable(
  baseUrl: string = astridBase(),
): Promise<{ status: 'available' } | { status: 'unavailable'; reason: string }> {
  const session = await probeBridgeSession(baseUrl);
  return session.ok ? { status: 'available' } : { status: 'unavailable', reason: session.reason };
}

export async function checkAstridDoctorAvailability(
  baseUrl: string = astridBase(),
): Promise<Exclude<AstridDoctorAvailability, { status: 'checking' }>> {
  const result = await inspectAstridCapabilities(baseUrl);
  if (result.health === 'unavailable') {
    return { status: 'unavailable', reason: result.reasons.health ?? 'bridge health unavailable' };
  }
  if (result.readiness === 'ready') return { status: 'available' };

  const capabilities = Object.entries(result.capabilities) as Array<[
    AstridCapability,
    (typeof result.capabilities)[AstridCapability],
  ]>;
  const unavailable = capabilities.filter(([, support]) => support === 'unavailable').map(([name]) => name);
  const unknown = capabilities.filter(([, support]) => support === 'unknown').map(([name]) => name);
  const reason = result.reasons.projects
    ?? [...unavailable, ...unknown].map((name) => result.reasons[name]).find(Boolean)
    ?? 'Some project-scoped capabilities could not be verified.';
  return { status: 'degraded', unavailable, unknown, reason };
}
