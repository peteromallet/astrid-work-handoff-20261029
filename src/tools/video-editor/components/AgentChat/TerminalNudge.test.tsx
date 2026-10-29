// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalAgentId } from '@/integrations/astrid/localAgents.ts';
import { TerminalNudge } from './TerminalNudge.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('TerminalNudge', () => {
  it.each([
    ['claude-code', 'claude'],
    ['codex', 'codex'],
    ['hermes', 'hermes'],
    ['astrid', '/Users/me/.astrid/bin/run-astrid'],
  ] as const)('shows the %s command from its agent row', (agent, command) => {
    render(<TerminalNudge agent={agent as LocalAgentId} command={command} projectName="My first project" onDismiss={vi.fn()} />);
    expect(screen.getByText(command)).toBeInTheDocument();
    expect(screen.getByText('Updated "My first project"')).toBeInTheDocument();
    const sameSignIn = screen.queryByText('Uses the same sign-in as here.');
    if (agent === 'astrid') expect(sameSignIn).toBeInTheDocument();
    else expect(sameSignIn).toBeNull();
  });

  it('names the project generically when the open project has no name', () => {
    render(<TerminalNudge agent="codex" command="codex" projectName={null} onDismiss={vi.fn()} />);
    expect(screen.getByText('Updated "your project"')).toBeInTheDocument();
  });

  it('copies the exact command', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<TerminalNudge agent="astrid" command="/opt/astrid/run-astrid" onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy terminal command' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('/opt/astrid/run-astrid'));
  });

  it('closes', () => {
    const onDismiss = vi.fn();
    render(<TerminalNudge agent="codex" command="codex" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
