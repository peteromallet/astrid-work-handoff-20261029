// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { toast } from '@/shared/components/ui/toast.tsx';
import { AgentChatMenu } from './AgentChatMenu.tsx';

beforeAll(() => {
  Element.prototype.scrollIntoView ??= vi.fn();
});
afterEach(() => { cleanup(); localStorage.clear(); });

type MenuProps = Partial<ComponentProps<typeof AgentChatMenu>>;

/** Renders the menu with the chat-free defaults; `rerender` keeps the same callbacks and overrides props. */
function renderMenu(props: MenuProps = {}) {
  const base = { sessions: [], activeSessionId: null, ...props };
  const view = render(<AgentChatMenu {...base} />);
  const rerender = (next: MenuProps = {}) => view.rerender(<AgentChatMenu {...base} {...next} />);
  return { view, rerender };
}

/** Renders the menu and opens it from its trigger. */
function openMenu(props: MenuProps = {}) {
  const rendered = renderMenu(props);
  fireEvent.click(screen.getByRole('button', { name: /^Chat: / }));
  return rendered;
}

const sessionsTwo = [{ id: 'one', title: 'Planning' }, { id: 'two' }];

describe('AgentChatMenu trigger', () => {
  it('names the open chat by its trimmed title', () => {
    renderMenu({ sessions: [{ id: 'a', title: '  Launch plan  ' }], activeSessionId: 'a' });
    const trigger = screen.getByRole('button', { name: 'Chat: Launch plan' });
    expect(trigger).toHaveTextContent('Launch plan');
  });

  it('falls back to the chat number, then to its list position, when a chat has no title', () => {
    const { view } = renderMenu({ sessions: [{ id: 'a', chatNumber: 7 }], activeSessionId: 'a' });
    expect(screen.getByRole('button', { name: 'Chat: Chat 7' })).toBeInTheDocument();
    view.unmount();
    renderMenu({ sessions: [{ id: 'a' }, { id: 'b' }], activeSessionId: 'b' });
    expect(screen.getByRole('button', { name: 'Chat: Chat 2' })).toBeInTheDocument();
  });

  it('says New chat when no chat is open', () => {
    renderMenu({ sessions: sessionsTwo, activeSessionId: null });
    expect(screen.getByRole('button', { name: 'Chat: New chat' })).toHaveTextContent('New chat');
  });

  it('says New chat while a new chat is starting, even with a chat open', () => {
    renderMenu({ sessions: sessionsTwo, activeSessionId: 'one', starting: true });
    expect(screen.getByRole('button', { name: 'Chat: New chat' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chat: Planning' })).toBeNull();
  });

  it('is disabled when the host disables it', () => {
    renderMenu({ disabled: true });
    expect(screen.getByRole('button', { name: 'Chat: New chat' })).toBeDisabled();
  });

  it('reports open and close through onOpenChange', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderMenu({ onOpenChange });
    await user.click(screen.getByRole('button', { name: 'Chat: New chat' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onOpenChange).toHaveBeenLastCalledWith(false));
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it('opens with the open chat highlighted', () => {
    renderMenu({ sessions: [{ id: 'a' }], activeSessionId: 'a' });
    fireEvent.click(screen.getByRole('button', { name: 'Chat: Chat 1' }));
    expect(screen.getByRole('option', { name: /^Chat 1/ })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('AgentChatMenu chats', () => {
  it('lists chats under a Chats heading, marks the active one, and selects a row closing the menu', async () => {
    const onSelectSession = vi.fn();
    const onOpenChange = vi.fn();
    renderMenu({ sessions: sessionsTwo, activeSessionId: 'one', onSelectSession, onOpenChange });
    fireEvent.click(screen.getByRole('button', { name: 'Chat: Planning' }));
    expect(screen.getByText('Chats')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^Planning/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('option', { name: /^Chat 2/ })).not.toHaveAttribute('aria-current');
    fireEvent.click(screen.getByRole('option', { name: /^Chat 2/ }));
    expect(onSelectSession).toHaveBeenCalledExactlyOnceWith('two');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('shows the Chats heading with the empty text and no search field without chats', () => {
    openMenu({ sessions: [] });
    expect(screen.getByText('Chats')).toBeInTheDocument();
    expect(screen.getByText('No chats yet. Use + to start one.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search chats…')).toBeNull();
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('uses titles in the rows, keeps fallback names, and searches both titles and fallback names', () => {
    openMenu({ sessions: sessionsTwo, activeSessionId: 'one', onRenameSession: vi.fn() });
    expect(screen.getByRole('option', { name: /^Planning/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('option', { name: /^Chat 2/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rename Planning' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rename Chat 2' })).toBeNull();
    const search = screen.getByPlaceholderText('Search chats…');
    fireEvent.change(search, { target: { value: 'Chat 1' } });
    expect(screen.getByRole('option', { name: /^Planning/ })).toBeTruthy();
    fireEvent.change(search, { target: { value: 'Planning' } });
    expect(screen.getByRole('option', { name: /^Planning/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /^Chat 2/ })).toBeNull();
  });

  it('keeps fallback chat numbers stable when missing sessions are omitted or new chats are appended', () => {
    const { rerender } = renderMenu({ sessions: [{ id: 'one', title: 'Planning', chatNumber: 1 }, { id: 'three', chatNumber: 3 }], activeSessionId: 'three' });
    expect(screen.getByRole('button', { name: 'Chat: Chat 3' })).toHaveTextContent('Chat 3');
    fireEvent.click(screen.getByRole('button', { name: 'Chat: Chat 3' }));
    expect(screen.getByRole('option', { name: /^Planning/ })).not.toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('option', { name: /^Chat 3/ })).toHaveAttribute('aria-current', 'true');
    rerender({ sessions: [{ id: 'one', title: 'Planning', chatNumber: 1 }, { id: 'three', chatNumber: 3 }, { id: 'four', chatNumber: 4 }], activeSessionId: 'three' });
    expect(screen.getByRole('option', { name: /^Chat 3/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /^Chat 4/ })).toBeTruthy();
  });

  it('uses only a filled Main star and exposes full truncated chat names', async () => {
    const label = 'A long planning chat name that needs all available space';
    openMenu({ sessions: [{ id: 'one', title: label }, { id: 'two' }], activeSessionId: 'one', mainSessionId: 'one', onRenameSession: vi.fn() });
    const row = await screen.findByRole('option', { name: new RegExp(`^${label}`) });
    expect(within(row).getByTitle(label)).toHaveTextContent(label);
    const main = within(row).getByRole('img', { name: 'Main chat' });
    expect(main).toHaveAttribute('title', 'Main chat');
    expect(main.querySelector('svg')).toHaveClass('fill-current');
    expect(within(row).queryByText('Main', { exact: true })).toBeNull();
    // The star sits on the right, after the title.
    expect(within(row).getByTitle(label).compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(row).getByRole('button', { name: `Rename ${label}` })).toBeInTheDocument();
    expect(within(screen.getByRole('option', { name: 'Chat 2' })).getByTitle('Chat 2')).toBeInTheDocument();
  });

  it('shows each chat\'s agent and last model under its title, and the agent alone when the model is unknown', async () => {
    const describeSession = (id: string) => id === 'codex:one'
      ? { agent: 'codex' as const, model: '6 Sol' }
      : { agent: 'claude-code' as const, model: null };
    renderMenu({ sessions: [{ id: 'codex:one' }, { id: 'claude-code:two' }], activeSessionId: 'codex:one', describeSession });
    fireEvent.click(screen.getByRole('button', { name: 'Chat: Chat 1' }));
    expect(await screen.findByText('Codex · 6 Sol')).toBeTruthy();
    expect(within(screen.getByRole('option', { name: /^Chat 2/ })).getByText('Claude Code')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Search chats…'), { target: { value: 'codex' } });
    expect(screen.getByRole('option', { name: /^Chat 1/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /^Chat 2/ })).toBeNull();
  });

  it('makes another chat main without selecting it', async () => {
    const user = userEvent.setup();
    const onSetMainSession = vi.fn();
    const onSelectSession = vi.fn();
    openMenu({ sessions: sessionsTwo, activeSessionId: 'one', mainSessionId: 'one', onSetMainSession, onSelectSession });
    await user.click(screen.getByRole('button', { name: 'Make Chat 2 main' }));
    expect(onSetMainSession).toHaveBeenCalledExactlyOnceWith('two');
    expect(onSelectSession).not.toHaveBeenCalled();
    expect(screen.getByRole('option', { name: /^Chat 2/ })).toBeTruthy();
  });

  it('disables the make-main buttons while a main change is pending', () => {
    openMenu({ sessions: sessionsTwo, activeSessionId: 'one', mainSessionId: 'one', onSetMainSession: vi.fn(), settingMainSessionId: 'two' });
    expect(screen.getByRole('button', { name: 'Make Chat 2 main' })).toBeDisabled();
  });

  it('hides Rename when no chat is open', () => {
    openMenu({ sessions: sessionsTwo, activeSessionId: null, onRenameSession: vi.fn() });
    expect(screen.queryByRole('button', { name: /^Rename / })).toBeNull();
  });

  it('closes the menu and opens the rename dialog from the active row', async () => {
    const onOpenChange = vi.fn();
    openMenu({ sessions: [{ id: 'one', title: 'Planning' }], activeSessionId: 'one', onRenameSession: vi.fn().mockResolvedValue(undefined), onOpenChange });
    fireEvent.click(screen.getByRole('button', { name: 'Rename Planning' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(await screen.findByText('Rename chat')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Chat name' })).toHaveValue('Planning');
  });

  it('trims and saves a nonempty title', async () => {
    const onRenameSession = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    openMenu({ sessions: [{ id: 'one' }], activeSessionId: 'one', onOpenChange, onSelectSession: vi.fn(), onRenameSession });
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Chat 1' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    const nameInput = screen.getByRole('textbox', { name: 'Chat name' }) as HTMLInputElement;
    expect(nameInput.selectionStart).toBe(0);
    expect(nameInput.selectionEnd).toBe('Chat 1'.length);
    fireEvent.change(nameInput, { target: { value: '  Launch plan  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onRenameSession).toHaveBeenCalledWith('one', 'Launch plan'));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Chat name' })).toBeNull());
  });

  it('validates empty and 120 character titles without saving', async () => {
    const onRenameSession = vi.fn().mockResolvedValue(undefined);
    openMenu({ sessions: [{ id: 'one' }], activeSessionId: 'one', onRenameSession });
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Chat 1' }));
    const input = screen.getByRole('textbox', { name: 'Chat name' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a chat name.')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'x'.repeat(121) } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Chat names must be 120 characters or fewer.')).toBeTruthy();
    expect(onRenameSession).not.toHaveBeenCalled();
  });

  it('accepts exactly 120 characters', async () => {
    const onRenameSession = vi.fn().mockResolvedValue(undefined);
    openMenu({ sessions: [{ id: 'one' }], activeSessionId: 'one', onRenameSession });
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Chat 1' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Chat name' }), { target: { value: 'x'.repeat(120) } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onRenameSession).toHaveBeenCalledWith('one', 'x'.repeat(120)));
  });

  it('shows a toast when renaming fails and keeps the dialog open', async () => {
    const toastError = vi.spyOn(toast, 'error').mockImplementation(() => 'toast-id');
    const onRenameSession = vi.fn().mockRejectedValue(new Error('Rename failed'));
    openMenu({ sessions: [{ id: 'one' }], activeSessionId: 'one', onRenameSession });
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Chat 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Rename failed'));
    expect(screen.getByRole('textbox', { name: 'Chat name' })).toBeInTheDocument();
    toastError.mockRestore();
  });
});

describe('AgentChatMenu attach and empty states', () => {
  it('keeps attaching an existing chat in the same menu', () => {
    const toggle = vi.fn();
    openMenu({ attachExisting: { open: false, toggle } });
    const attach = screen.getByRole('button', { name: /Attach an existing chat/ });
    expect(attach.closest('[role="listbox"]')).toBeNull();
    fireEvent.click(attach);
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('offers Hide existing chats while attached chats are shown', () => {
    const toggle = vi.fn();
    openMenu({ attachExisting: { open: true, toggle } });
    const hide = screen.getByRole('button', { name: /Hide existing chats/ });
    expect(hide.closest('[role="listbox"]')).toBeNull();
    fireEvent.click(hide);
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('does not offer new chats: that is the header + button\'s job', () => {
    openMenu({ sessions: sessionsTwo, activeSessionId: 'one', attachExisting: { open: false, toggle: vi.fn() } });
    expect(screen.queryByText('New chat with')).toBeNull();
    expect(screen.queryByRole('option', { name: /Claude Code|Codex/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Chat: Planning' })).toHaveAttribute('title', 'Switch chats');
  });

  it('points at + when there are no chats yet, and still offers attaching', () => {
    openMenu({ sessions: [], attachExisting: { open: false, toggle: vi.fn() } });
    expect(screen.getByText('No chats yet. Use + to start one.')).toBeInTheDocument();
    expect(screen.queryByText('No chats found.')).toBeNull();
    expect(screen.getByRole('button', { name: /Attach an existing chat/ })).toBeInTheDocument();
  });

  it('keeps the trigger a flat title: the Main star lives in the rows, never on the trigger', () => {
    renderMenu({ sessions: sessionsTwo, activeSessionId: 'one', mainSessionId: 'one' });
    const trigger = screen.getByRole('button', { name: 'Chat: Planning' });
    expect(within(trigger).queryByRole('img', { name: 'Main chat' })).toBeNull();
    expect(trigger).toHaveTextContent('Planning');
    expect(trigger).not.toHaveClass('border');
    expect(trigger).not.toHaveClass('backdrop-blur-md');
    expect(trigger).toHaveClass('h-7', 'font-medium');
  });
});
