import type { TranscriptPanelTextEdit } from '@/sdk/video/transcript.ts';
import {
  createProjectTranscriptHost,
  type ProjectTranscriptHostInput,
} from './project-transcript-host.ts';
/** Source correction writes only the canonical project document CAS domain. */
export async function commitTranscriptTextEdit(
  context: ProjectTranscriptHostInput,
  edit: TranscriptPanelTextEdit,
) {
  const host = createProjectTranscriptHost(context);
  try {
    await host.refreshSources();
    return await host.editText(edit);
  } finally {
    host.dispose();
  }
}
