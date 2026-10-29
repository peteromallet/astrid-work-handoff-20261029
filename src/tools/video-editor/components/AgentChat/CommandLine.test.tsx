// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandLine, CommandStep } from './CommandLine.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('CommandLine', () => {
  it.each([
    ['no commands', 'Plain prose.', 0],
    ['one command', 'Run `bun test` now.', 1],
    ['two commands', 'Use `bun test` then `npx tsc`.', 2],
  ])('parses %s', (_name, line, count) => {
    render(<p><CommandLine line={line} /></p>);
    expect(screen.queryAllByRole('button', { name: 'Copy command' })).toHaveLength(count);
    expect(document.querySelector('p')).toHaveTextContent(line.replaceAll('`', ''));
    expect(document.querySelectorAll('code')).toHaveLength(count);
  });

  it('copies the exact command and shows copied state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<CommandLine line="Run `bun test ./astrid/chat/file.test.ts` now." />);
    const button = screen.getByRole('button', { name: 'Copy command' });
    const before = button.querySelector('svg')?.innerHTML;
    fireEvent.click(button);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('bun test ./astrid/chat/file.test.ts'));
    await waitFor(() => expect(button.querySelector('svg')?.innerHTML).not.toBe(before));
  });

  it('shows the selectable fallback when clipboard writing fails', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<CommandLine line="Run `npx tsc --noEmit` now." />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy command' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Copying didn't work/i);
    expect(screen.getByRole('textbox', { name: 'Copy command' })).toHaveValue('npx tsc --noEmit');
  });
});

describe('CommandStep', () => {
  it('renders a structured command row with its supplied copy label', () => {
    render(<CommandStep command="agent install" label="Copy install command" />);
    expect(screen.getByText('agent install')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy install command' })).toBeInTheDocument();
  });
});
