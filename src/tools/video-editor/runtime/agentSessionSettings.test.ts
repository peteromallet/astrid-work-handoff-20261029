import { describe, expect, it, vi } from 'vitest';
import { setSessionConfigOption } from './agentSessionSettings';

describe('fixed chat model and thinking settings', () => {
  it.each(['/model provider/other', '/model', '/model other extra'])('rejects %s without changing session config', async (command) => {
    const acp = { setConfigOption: vi.fn() };
    await expect(setSessionConfigOption(acp as never, 'connection', 'saved-chat', command)).rejects.toThrow('To use another model, start a new chat.');
    expect(acp.setConfigOption).not.toHaveBeenCalled();
  });

  it('keeps the thinking setting scoped to the existing chat', async () => {
    const acp = { setConfigOption: vi.fn(async () => ({ configOptions: [{ id: 'thinking', currentValue: 'high' }] })) };
    await expect(setSessionConfigOption(acp as never, 'connection', 'saved-chat', '/thinking high')).resolves.toBe('Thinking level set to high for this session only.');
    expect(acp.setConfigOption).toHaveBeenCalledWith('connection', 'saved-chat', 'thinking', 'high');
  });

  it('requires the service to confirm the thinking value', async () => {
    const acp = { setConfigOption: vi.fn(async () => ({ configOptions: [{ id: 'thinking', currentValue: 'low' }] })) };
    await expect(setSessionConfigOption(acp as never, 'connection', 'saved-chat', '/thinking high')).rejects.toThrow('ACP did not confirm thinking=high');
  });
});
