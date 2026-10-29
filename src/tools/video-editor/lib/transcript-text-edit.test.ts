import { describe, it, expect, vi } from 'vitest';
import { commitTranscriptTextEdit } from './transcript-text-edit.ts';
import { buildTimelineData } from './timeline-data.ts';
describe('project source edit boundary', () => {
  it('does not mutate timeline bundles when the provider has no document repository', async () => {
    const data = await buildTimelineData(
      {
        output: { resolution: '1920x1080', fps: 30, file: 'out' },
        tracks: [],
        clips: [],
      },
      { assets: {} },
      (f) => f,
    );
    const commitData = vi.fn();
    expect(
      await commitTranscriptTextEdit(
        { dataRef: { current: data }, commitData },
        { type: 'segment', sourceItemId: 's', text: 'edit' },
      ),
    ).toMatchObject({ ok: false });
    expect(commitData).not.toHaveBeenCalled();
  });
});
