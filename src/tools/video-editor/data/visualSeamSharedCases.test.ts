import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import type {ResolvedTimelineConfig} from '@/tools/video-editor/types/index.ts';
import {analyzeVisualSeams, timecode} from './visualSeamContract.ts';

type ExpectedFinding = {code: string; frame: number; clips: string[]};
type Case = {
  name: string;
  timeline: ResolvedTimelineConfig;
  expected: ExpectedFinding[];
  occurrence?: {id: string; start_ms: number; duration_ms: number; track: string};
  expectedWarnings?: {activation: number; opaque: number};
};

function canonicalTimeline(testCase: Case): ResolvedTimelineConfig {
  const raw = structuredClone(testCase.timeline) as ResolvedTimelineConfig & {effects?: unknown};
  const clips = raw.clips.map((clip) => {
    const assetId = (clip as unknown as {asset_id?: unknown}).asset_id;
    return typeof assetId === 'string' && typeof clip.asset !== 'string'
      ? {...clip, asset: assetId}
      : clip;
  });
  if (!testCase.occurrence) return {...raw, clips};

  // Runtime's occurrence closure projects timeline effects onto each child.
  // Apply that same small canonical projection here; the full composition
  // loader is intentionally outside this fixture's direct-config test.
  const timelineEffects = Array.isArray(raw.effects) ? raw.effects : [];
  const occurrenceClip = clips[0];
  if (occurrenceClip && timelineEffects.length > 0) {
    const canonical = {
      parentDocumentId: 'shared-case',
      occurrenceId: testCase.occurrence.id,
      sourceClipId: occurrenceClip.id,
    };
    const app = {
      ...(occurrenceClip.app ?? {}),
      canonical,
      canonicalTiming: {
        occurrenceStartMs: testCase.occurrence.start_ms,
        occurrenceDurationMs: testCase.occurrence.duration_ms,
      },
      canonicalEffects: {
        localCount: Array.isArray(occurrenceClip.effects) ? occurrenceClip.effects.length : 0,
        timeline: timelineEffects,
      },
    };
    const projected = {...occurrenceClip, app};
    return {...raw, clips: [projected, ...clips.slice(1)], effects: undefined};
  }
  return {...raw, clips};
}

function sharedCases(): Case[] {
  const checkout = process.env.ASTRID_RUNTIME_CHECKOUT;
  expect(checkout, 'set ASTRID_RUNTIME_CHECKOUT to an Astrid Runtime checkout').toBeTruthy();
  const fixturePath = resolve(checkout!, 'conformance/fixtures/visual-seam-cases-v1.json');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {schema_version: number; cases: Case[]};
  expect(fixture.schema_version).toBe(1);
  return fixture.cases;
}

describe('shared App and Runtime visual seam cases', () => {
  it('matches the shared expected findings', () => {
    const cases = sharedCases();
    expect(cases.length).toBeGreaterThanOrEqual(6);
    for (const testCase of cases) {
      const timeline = canonicalTimeline(testCase);
      const report = analyzeVisualSeams(timeline);
      const clips = new Map(testCase.timeline.clips.map((clip) => [clip.id, clip]));
      const expectedLines = testCase.expected.map((expected) => {
        const kind = expected.code === 'boundary/overlap' ? 'overlap'
          : expected.code === 'boundary/gap' ? 'gap' : undefined;
        expect(kind, `${testCase.name}: unknown expected code ${expected.code}`).toBeDefined();
        const participants = expected.clips.map((id) => clips.get(id));
        expect(participants.every(Boolean), `${testCase.name}: missing expected clip`).toBe(true);
        const labels = participants.map((clip) => clip!.label ?? clip!.text?.content ?? 'Unlabeled clip');
        const track = timeline.tracks.find((row) => row.id === participants[0]!.track);
        const trackLabel = track?.label ?? participants[0]!.track;
        const detail = kind === 'overlap'
          ? `Two full-screen clips overlap on ${trackLabel}: '${labels[0]}' and '${labels[1]}'`
          : `Gap on ${trackLabel} between '${labels[0]}' and '${labels[1]}'`;
        return `${timecode(expected.frame / timeline.output.fps)} · ${detail}`;
      });
      expect(report.structuralIssues, testCase.name).toEqual(expectedLines);
      expect(report.boundaries.filter(boundary => boundary.structuralIssues.length > 0).map(boundary => boundary.frame), testCase.name)
        .toEqual(testCase.expected.map(finding => finding.frame));
      if (testCase.expectedWarnings) {
        expect(report.cues.filter(cue => cue.kind === 'activation'), testCase.name).toHaveLength(testCase.expectedWarnings.activation);
        expect(report.opaqueElements, testCase.name).toHaveLength(testCase.expectedWarnings.opaque);
      }
    }
  });
});
