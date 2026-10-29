import type { EditorTourAct, EditorTourBeat } from '@/shared/state/editorTourStore.ts';
import type { EditorTourScript } from '@/tools/video-editor/tour/tourScript.ts';
import type { AgentTurn } from '@/tools/video-editor/types/agent-session.ts';

/** How far the current beat's animation has got. */
export interface TourChatProgress {
  /** Characters of the act's prompt typed into the composer. */
  typed: number;
  /** Characters of the reply streamed in. */
  replyChars: number;
  /** Tool cards shown. */
  cards: number;
}

export const TOUR_ACTS: readonly EditorTourAct[] = [1, 2, 3];
const ACT_SPACING_MS = 60_000;

/** Timestamp at which an act's exchange begins; later timestamps of the same act sit within the next minute. */
export function tourActStartMs(baseMs: number, act: EditorTourAct): number {
  return baseMs + (act - 1) * ACT_SPACING_MS;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function exchangeTurns(
  script: EditorTourScript,
  act: EditorTourAct,
  startMs: number,
  parts: { user: boolean; replyChars: number; cards: number },
): AgentTurn[] {
  const { prompt, reply, toolCards } = script.acts[act];
  const turns: AgentTurn[] = [];
  if (parts.user) turns.push({ role: 'user', content: prompt, timestamp: iso(startMs) });
  if (parts.replyChars > 0) {
    turns.push({ role: 'assistant', content: reply.slice(0, parts.replyChars), timestamp: iso(startMs + 2_000) });
  }
  toolCards.slice(0, parts.cards).forEach((card, index) => {
    const id = `tour-${act}-${index}`;
    const at = startMs + 4_000 + index * 1_000;
    turns.push({ role: 'tool_call', tool_call_id: id, tool_name: card.name, content: card.name, timestamp: iso(at) });
    turns.push({ role: 'tool_result', tool_call_id: id, tool_status: 'completed', content: card.detail, timestamp: iso(at + 500) });
  });
  return turns;
}

/** The transcript at a point in the tour. Earlier acts are complete; the current act follows its beat. */
export function buildTourTurns(
  script: EditorTourScript,
  baseMs: number,
  act: EditorTourAct,
  beat: EditorTourBeat,
  sent: boolean,
  progress: TourChatProgress,
): AgentTurn[] {
  // The welcome comes before anything is said: the chat shows its real empty state.
  if (beat === 'welcome') return [];
  const full = { user: true, replyChars: Infinity, cards: Infinity };
  const turns: AgentTurn[] = [];
  for (const earlier of TOUR_ACTS) {
    if (earlier >= act) break;
    turns.push(...exchangeTurns(script, earlier, tourActStartMs(baseMs, earlier), full));
  }
  const startMs = tourActStartMs(baseMs, act);
  if (beat === 'compose') {
    turns.push(...exchangeTurns(script, act, startMs, { user: sent, replyChars: 0, cards: 0 }));
  } else if (beat === 'respond') {
    turns.push(...exchangeTurns(script, act, startMs, { user: true, replyChars: progress.replyChars, cards: progress.cards }));
  } else {
    turns.push(...exchangeTurns(script, act, startMs, full));
  }
  return turns;
}
