/**
 * Timeline list route of the Astrid workspace (`GET /v1/projects/:p/timelines`).
 *
 * Placement reads and writes never ride a timeline route here: the document head (config and registry)
 * is read and published only through `RuntimeDataProvider` (`loadTimeline`, `loadAssetRegistry`,
 * `saveTimelineAtHead`). `GET /v1/projects/:p/timelines/:t` answers the public timeline resource without
 * either, so this module deliberately offers no load and no save.
 */

import type { AstridBridgeTransport } from './transport.ts';
import { bridgeTimelinesSchema, type BridgeTimelinesPayload } from '@/tools/video-editor/data/bridgeContract.ts';
import { astridTimelineCollectionPath } from './workspaceV1.ts';

export type TimelineRoutesOptions = {
  /** The project slug every timeline route is scoped under. */
  projectSlug: string;
};

export class AstridLocalTimelineRoutes {
  private readonly transport: AstridBridgeTransport;
  private readonly projectSlug: string;

  constructor(transport: AstridBridgeTransport, options: TimelineRoutesOptions) {
    this.transport = transport;
    this.projectSlug = options.projectSlug;
  }

  /** All timelines of the project (identity, slugs, default flag). */
  async list(): Promise<BridgeTimelinesPayload> {
    const payload = await this.transport.requestJson(
      astridTimelineCollectionPath(this.projectSlug),
      {},
      bridgeTimelinesSchema,
      'timeline list',
    );
    const wire = payload as BridgeTimelinesPayload & { items?: BridgeTimelinesPayload['timelines'] };
    return { ...wire, timelines: wire.items ?? [] };
  }
}
