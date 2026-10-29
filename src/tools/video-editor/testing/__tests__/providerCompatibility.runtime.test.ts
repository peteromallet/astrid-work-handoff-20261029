/**
 * Provider compatibility test: RuntimeDataProvider over `runtimeFixture`.
 *
 * Runs the shared providerCompatibility suite against the real
 * RuntimeDataProvider, with the in-memory Workspace Runtime fixture
 * (`@/test/fakeWorkspaceRuntime`) as the only fake. The provider, client and
 * canonical-head state machine are production code.
 *
 * Two seams make the shared suite's numeric contract expressible:
 *
 *  1. The suite saves with `saveTimeline(id, config, expectedVersion, ...)`.
 *     RuntimeDataProvider refuses that entry point on purpose (it throws
 *     TimelineVersionConflictError; see dataProvider.test.ts "fails closed for
 *     numeric-only saves"), because Runtime authorizes writes by head
 *     revision, not by a number. `VersionedRuntimeProvider` re-expresses the
 *     numeric call the way the editor uses it: read the current head, compare
 *     the caller's version with the version the provider reports, then call
 *     the real `saveTimelineAtHead` with that head. Runtime's own CAS is
 *     exercised by dataProvider.test.ts and dataProvider.parity.test.ts.
 *  2. Seeds ask for `configVersion` N. The provider assigns versions itself
 *     (1 for the first head it sees, +1 per head change), so the factory
 *     reaches N by publishing N-1 real heads through the same save path.
 *
 * Unknown timelines: the fixture serves one timeline. The test transport
 * answers 404 `not_found` for the `nonexistent-timeline` id the suite uses,
 * which is the status the real Runtime returns for an unknown resource.
 */

import { describe } from 'vitest';
import { RuntimeDataProvider } from '@/integrations/runtime/dataProvider.ts';
import {
  TimelineVersionConflictError,
  type DataProvider,
} from '@/tools/video-editor/data/DataProvider.ts';
import {
  MANAGED_OBJECT_DIGEST,
  MANAGED_OBJECT_ID,
  PROJECT_ID,
  TIMELINE_ID,
  json,
  runtimeFixture,
} from '@/test/fakeWorkspaceRuntime.ts';
import {
  runProviderCompatibilitySuite,
  type ProviderFactory,
} from '@/tools/video-editor/testing/providerCompatibility.shared.ts';
import type { AssetRegistry, TimelineConfig } from '@/tools/video-editor/types/index.ts';
import type { TimelineBundleEnvelope } from '@/tools/video-editor/data/typed/timelineBundle.ts';

const UNKNOWN_TIMELINE_ID = 'nonexistent-timeline';

class VersionedRuntimeProvider extends RuntimeDataProvider {
  override async saveTimeline(
    timelineId: string,
    config: TimelineConfig,
    expectedVersion: number,
    registry?: AssetRegistry,
    bundle?: TimelineBundleEnvelope | null,
  ): Promise<number> {
    const current = await this.loadTimeline(timelineId);
    if (current.configVersion !== expectedVersion) {
      throw new TimelineVersionConflictError(
        `Timeline is at version ${current.configVersion}, not ${expectedVersion}.`,
        expectedVersion,
        current.configVersion,
      );
    }
    const receipt = await this.saveTimelineAtHead(timelineId, config, current.head!, registry, bundle);
    return receipt.configVersion;
  }
}

// Runtime resolves only managed objects, so a relative `file` locator resolves
// when some registry entry owns it. Seeds without a registry get one entry that
// owns `clips/demo.mp4` (the path the suite probes) through a managed object id.
const DEFAULT_REGISTRY: AssetRegistry = {
  assets: {
    'asset-demo': {
      file: 'clips/demo.mp4',
      type: 'video/mp4',
      media_id: MANAGED_OBJECT_ID,
      content_sha256: MANAGED_OBJECT_DIGEST,
    },
  },
};

const runtimeFactory: ProviderFactory = async (seed) => {
  const seedConfig = seed?.config as (TimelineConfig & Record<string, unknown>) | undefined;
  const seedRegistry = seed?.registry ?? DEFAULT_REGISTRY;
  const fixture = runtimeFixture(seedConfig
    ? {
        parentComposition: {
          config: structuredClone(seedConfig),
          registry: structuredClone(seedRegistry),
          clips: structuredClone(seedConfig.clips ?? []),
          occurrences: [],
        },
      }
    : { initialConfig: {} });
  const transport: typeof fixture.transport = async (method, path, headers, body) => {
    if (path.includes(`/timelines/${UNKNOWN_TIMELINE_ID}`)) {
      return {
        status: 404,
        headers: {},
        body: json({ code: 'not_found', message: `timeline ${UNKNOWN_TIMELINE_ID} does not exist` }),
      };
    }
    return fixture.transport(method, path, headers, body);
  };
  const provider = new VersionedRuntimeProvider({ projectId: PROJECT_ID, transport });
  if (!seedConfig) return provider as DataProvider;

  const timelineId = seed?.timelineId ?? TIMELINE_ID;
  for (let version = 1; version < (seed?.configVersion ?? 1); version += 1) {
    await provider.saveTimeline(timelineId, seedConfig, version);
  }
  await provider.loadAssetRegistry(timelineId);
  return provider as DataProvider;
};

describe('RuntimeDataProvider compatibility (runtimeFixture)', () => {
  runProviderCompatibilitySuite(runtimeFactory, {
    timelineId: TIMELINE_ID,
    // Runtime treats `config.output` as host-derived: saves drop it and loads
    // re-materialise defaults (dataProvider.ts saveTimelineInOrder).
    derivedOutputOnSave: true,
    checkpoints: false,
  });
});
