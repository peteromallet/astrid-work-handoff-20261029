import { describe, expect, it } from 'vitest';
import { formatConversationExport, conversationExportFilename } from './conversationExport';
import type { ConversationExportTurn } from './conversationExport';

describe('formatConversationExport', () => {
  it('exports messages, attachments, editor requests, tool task details, and pending actions', () => {
    const turns: ConversationExportTurn[] = [
      { turn: {
        role: 'user', content: 'Review this shot', timestamp: '2026-10-26T09:00:00.000Z',
        attachments: [{ clipId: 'clip-1', shotName: 'Opening shot', url: 'https://example.test/opening.png', mediaType: 'image', shotId: 'shot-1' }],
      } },
      { turn: { role: 'assistant', content: 'I will update the timeline.', timestamp: '2026-10-26T09:00:02.000Z' }, editorActions: [{
        call: { role: 'tool_call', tool_name: 'Editor request · setTimeline', tool_call_id: 'editor-1', content: '', tool_args: { action: 'publish', requestId: 'editor-1' }, timestamp: '2026-10-26T09:00:02.000Z' },
        result: { role: 'tool_result', content: 'Recorded host result: {"ok":true}', tool_call_id: 'editor-1', tool_status: 'completed', timestamp: '2026-10-26T09:00:03.000Z' },
      }] },
      { turn: { role: 'tool_call', content: 'Spawn reviewer', tool_name: 'Task', tool_call_id: 'task-1', tool_args: { agent: 'reviewer' }, timestamp: '2026-10-26T09:00:04.000Z' } },
      { turn: { role: 'tool_result', content: 'Reviewer completed', tool_call_id: 'task-1', tool_status: 'completed', timestamp: '2026-10-26T09:00:08.000Z',
        tool_output: { formatted_output: 'Reviewer completed', exit_code: 0 }, tool_output_details: {
          projectAgentsDir: '/tmp/agents', totalDurationMs: 4000,
          results: [{ id: 'Review', agent: 'reviewer', exitCode: 0, summary: 'Checked timeline continuity' }],
        } } },
      { turn: { role: 'tool_call', content: 'Run the next action', tool_name: 'Build', tool_call_id: 'pending-1', timestamp: '2026-10-26T09:00:09.000Z' } },
    ];
    const markdown = formatConversationExport({
      title: 'Chat 33', agent: 'Claude Code', model: 'Opus 5.5', thinkingLevel: 'Extra high',
      sessionId: 'claude-code:session-33', capturedAt: '2026-10-26T09:00:10.000Z', inProgress: true, turns,
    });

    expect(markdown).toContain('# Chat 33');
    expect(markdown).toContain('- Agent: Claude Code');
    expect(markdown).toContain('- Thinking level: Extra high');
    expect(markdown).toContain('- Turn count: 4');
    expect(markdown).toContain('- In progress at capture: Yes');
    expect(markdown).toContain('## Turn 1 — User — 2026-10-26T09:00:00.000Z');
    expect(markdown).toContain('Opening shot (image): https://example.test/opening.png');
    expect(markdown).toContain('Editor requests:');
    expect(markdown).toContain('Recorded host result: {"ok":true}');
    expect(markdown).toContain('"summary": "Checked timeline continuity"');
    expect(markdown).toContain('**Result observed at:** 2026-10-26T09:00:08.000Z');
    expect(markdown).toContain('**Status:** in_progress');
    expect(markdown).toContain('(pending at capture)');
    const taskAction = markdown.slice(markdown.indexOf('### Action 1 — Task'), markdown.indexOf('### Action 1 — Build'));
    expect(taskAction).toContain('- **Call ID:** task-1');
    expect(taskAction).toContain('- **Arguments:**');
    expect(taskAction).toContain('```json');
    expect(taskAction).toContain('"agent": "reviewer"');
    expect(taskAction).toContain('- **Result:**');
    expect(taskAction).toContain('Reviewer completed');
    expect(taskAction).toContain('- **Raw output:**');
    expect(taskAction).toContain('"formatted_output": "Reviewer completed"');
    expect(taskAction).toContain('- **Structured result details:**');
  });

  it('renders a standalone tool result as fenced output and retains raw ACP output', () => {
    const markdown = formatConversationExport({
      title: 'Command chat', agent: 'Codex', sessionId: 'codex:1', capturedAt: 'now', inProgress: false,
      turns: [{ turn: { role: 'tool_result', content: '', tool_call_id: 'shell-1', timestamp: 'then', tool_output: { exit_code: 0, formatted_output: 'hello\nworld' } } }],
    });
    expect(markdown).toContain('- **Result:**\n  ```text\n  {\n    "exit_code": 0,');
    expect(markdown).toContain('- **Raw output:**\n  ```json\n  {\n    "exit_code": 0,');
    expect(markdown).not.toContain('(empty result)');
  });

  it('builds a safe title slug and local minute timestamp filename', () => {
    expect(conversationExportFilename('A Chat: 33', new Date(2026, 9, 6, 9, 4))).toBe('a-chat-33-2026-10-06-0904.md');
    expect(conversationExportFilename('!!!', new Date(2026, 9, 6, 9, 4))).toBe('chat-2026-10-06-0904.md');
  });
});
