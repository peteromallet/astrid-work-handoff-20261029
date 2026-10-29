import { createProjectTranscriptHost } from './project-transcript-host.ts';
export { createProjectTranscriptHost as createTranscriptPanelHost } from './project-transcript-host.ts';
export type TranscriptPanelHost = ReturnType<typeof createProjectTranscriptHost>;
