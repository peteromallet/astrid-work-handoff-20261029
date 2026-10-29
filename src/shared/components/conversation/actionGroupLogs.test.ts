import { describe, expect, it } from 'vitest';
import { actionStatus, formatActionGroupLogs } from './actionGroupLogs';
import type { ConversationToolCallPair } from './contracts';

const result = (exitCode: number, id = 'Review') => ({ id, agent: 'reviewer', exitCode, aborted: false });
const pair = (details?: Record<string, unknown>): ConversationToolCallPair => ({
  call: { role: 'tool_call', content: 'Native task', timestamp: 'replayed-at', tool_call_id: 'call-1' },
  result: { role: 'tool_result', content: 'Exact result', timestamp: 'replayed-at', tool_status: 'completed', tool_output_details: details },
});
const details = (results: unknown[]) => ({ projectAgentsDir: null, totalDurationMs: 53, results });

describe('native task outcome and group log accuracy', () => {
  it('counts a failed native child despite a completed outer transport and preserves both outcomes', () => {
    const failed = pair(details([{ ...result(1), error: '402 credits unavailable' }]));
    expect(actionStatus(failed)).toBe('failed');
    const log = formatActionGroupLogs([failed], 'captured-now');
    expect(log).toContain('Status: failed');
    expect(log).toContain('Transport status: completed');
    expect(log).toContain('"exitCode": 1');
    expect(log).toContain('402 credits unavailable');
    expect(log).toContain('Call observed at: replayed-at');
    expect(log).toContain('not execution times');
    expect(log).not.toContain('Call timestamp:');
    expect(log).not.toContain('```');
    expect(log).not.toContain('**Arguments:**');
  });
  it('handles all-success and mixed native children without double counting calls', () => {
    expect(actionStatus(pair(details([result(0), result(0, 'Second')])))).toBe('completed');
    const mixed = pair(details([result(0), result(1, 'Second')]));
    expect(actionStatus(mixed)).toBe('failed');
    expect(formatActionGroupLogs([mixed], 'now')).toContain('Actions: 1');
  });
  it('does not infer failure from arbitrary quoted output, missing metadata or malformed details', () => {
    const quoted = pair();
    quoted.result!.content = '<task-result status="failed (exit 1)"> {"exitCode":1} error';
    expect(actionStatus(quoted)).toBe('completed');
    expect(actionStatus(pair({ results: [result(1)] }))).toBe('completed');
    expect(actionStatus(pair(details([{ ...result(1), exitCode: '1' }])))).toBe('completed');
    expect(actionStatus(pair(details([{ exitCode: 1 }])))).toBe('completed');
  });
  it('retains in-progress and outer failure without inventing a terminal child outcome', () => {
    const running = pair(details([result(1)]));
    running.result!.tool_status = 'in_progress';
    expect(actionStatus(running)).toBe('in_progress');
    const failed = pair(details([result(0)]));
    failed.result!.tool_status = 'failed';
    expect(actionStatus(failed)).toBe('failed');
  });
});
