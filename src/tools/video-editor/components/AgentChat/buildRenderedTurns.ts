import type { AgentTurn } from '@/tools/video-editor/types/agent-session.ts';

export type ToolCallPair = {
  call: AgentTurn;
  result: AgentTurn | null;
};

export type RenderedTurn =
  | { kind: 'message'; key: string; turn: AgentTurn }
  | { kind: 'tool_group'; key: string; pairs: ToolCallPair[] };

export function buildRenderedTurns(turns: AgentTurn[]): RenderedTurn[] {
  const items: RenderedTurn[] = [];
  let pendingToolPairs: ToolCallPair[] = [];
  let toolGroupStartIndex = 0;

  const flushToolGroup = () => {
    if (pendingToolPairs.length === 0) return;
    items.push({
      kind: 'tool_group',
      key: `tool-group:${toolGroupStartIndex}`,
      pairs: pendingToolPairs,
    });
    pendingToolPairs = [];
  };

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];

    if (turn.role === 'tool_result') {
      continue;
    }

    if (turn.role === 'tool_call') {
      const nextTurn = turns[index + 1];
      const pairedResult = turn.tool_call_id
        ? turns.find(candidate => candidate.role === 'tool_result' && candidate.tool_call_id === turn.tool_call_id) ?? null
        : nextTurn?.role === 'tool_result' && !nextTurn.tool_call_id ? nextTurn : null;

      if (pendingToolPairs.length === 0) {
        toolGroupStartIndex = index;
      }
      pendingToolPairs.push({ call: turn, result: pairedResult });
      if (pairedResult === nextTurn) index += 1;
      continue;
    }

    flushToolGroup();

    // Skip assistant messages that duplicate a preceding message_user result
    if (turn.role === 'assistant' && items.length > 0) {
      const prev = items[items.length - 1];
      if (prev.kind === 'message' && prev.turn.content === turn.content) {
        continue;
      }
    }

    items.push({
      kind: 'message',
      key: `${turn.timestamp}:${turn.role}:${index}`,
      turn,
    });
  }

  flushToolGroup();
  return items;
}
