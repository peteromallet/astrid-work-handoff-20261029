import { useRef, useState } from 'react';
import { Paperclip, SquareTerminal } from 'lucide-react';
import { PickerFooterAction, PickerMenu, PickerRow, PickerTrigger, RenameDialog } from '@/shared/components/ui/picker-menu.tsx';
import type { LocalAgentId } from '@/integrations/astrid/localAgents.ts';
import { AGENT_CHAT_COPY } from '@/integrations/astrid/chatCopy.ts';
import { AgentIcon, agentNames } from './agentIdentity.tsx';

const chatLabel = (session: AgentChatMenuSession, index: number) => session.title?.trim() || `Chat ${session.chatNumber ?? index + 1}`;

export interface AgentChatMenuSession { id: string; title?: string; chatNumber?: number }

interface AgentChatMenuProps {
  sessions: AgentChatMenuSession[];
  activeSessionId: string | null;
  mainSessionId?: string | null;
  settingMainSessionId?: string | null;
  /** Each chat's agent and the model it last used, shown under its title. */
  describeSession?: (sessionId: string) => { agent: LocalAgentId; model?: string | null };
  onSelectSession: (sessionId: string) => void;
  onSetMainSession?: (sessionId: string) => void;
  onRenameSession?: (sessionId: string, title: string) => Promise<unknown>;
  /** A new chat is starting; the trigger names it until it opens. */
  starting?: boolean;
  disabled?: boolean;
  /** Bring a chat started elsewhere into this project. */
  attachExisting?: { open: boolean; toggle: () => void };
  onOpenChange?: (open: boolean) => void;
  /** Reopens the terminal note for the open chat's agent; absent when that agent has no synced terminal skill. */
  onUseFromTerminal?: () => void;
}

/** The chat header's chats menu: its trigger names the open chat, and it switches chats, renames, makes a chat Main and attaches existing chats. Starting chats is the new-chat button's job. */
export function AgentChatMenu({
  sessions, activeSessionId, mainSessionId = null, settingMainSessionId = null, describeSession, onSelectSession, onSetMainSession, onRenameSession,
  starting = false, disabled = false, attachExisting, onOpenChange, onUseFromTerminal,
}: AgentChatMenuProps) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);

  const activeIndex = sessions.findIndex(session => session.id === activeSessionId);
  const activeSession = activeIndex >= 0 ? sessions[activeIndex] : null;
  // While the chat list reloads, the open chat keeps the name it was last shown with.
  const shownChat = useRef<{ id: string; label: string; titled: boolean } | null>(null);
  if (activeSession) shownChat.current = { id: activeSession.id, label: chatLabel(activeSession, activeIndex), titled: Boolean(activeSession.title?.trim()) };
  const openChat = activeSessionId && shownChat.current?.id === activeSessionId ? shownChat.current : null;
  const triggerLabel = !starting && openChat ? openChat.label : 'New chat';

  const changeOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const chatRows = sessions.map((session, index) => {
    const label = chatLabel(session, index);
    const fallbackLabel = `Chat ${session.chatNumber ?? index + 1}`;
    const isMain = session.id === mainSessionId;
    const meta = describeSession?.(session.id);
    const metaLabel = meta ? `${agentNames[meta.agent]}${meta.model ? ` · ${meta.model}` : ''}` : null;
    return (
      <PickerRow key={session.id} value={`session:${session.id}`} keywords={[label, fallbackLabel, ...(isMain ? ['Main'] : []), ...(metaLabel ? [metaLabel] : [])]}
        current={session.id === activeSessionId} title={label} detail={metaLabel ?? undefined} detailTitle={metaLabel ?? undefined}
        detailIcon={meta && <AgentIcon agent={meta.agent} className="h-3 w-3 shrink-0" />}
        starred={isMain} starLabel="Main chat" starActionLabel={`Make ${label} main`} starPending={session.id === settingMainSessionId} starDisabled={settingMainSessionId !== null}
        onStar={onSetMainSession && (() => onSetMainSession(session.id))}
        renameLabel={`Rename ${label}`} onRename={onRenameSession && (() => { changeOpen(false); setRenaming({ id: session.id, label }); })}
        onSelect={() => { onSelectSession(session.id); changeOpen(false); }} />
    );
  });

  return (
    <>
      <PickerMenu open={open} onOpenChange={changeOpen} plural="chats" ariaLabel="Chats" currentValue={activeSession ? `session:${activeSession.id}` : undefined}
        count={sessions.length} panelClassName="w-64 max-w-[calc(100vw-2rem)] p-0" emptyHint="Use + to start one."
        trigger={<PickerTrigger label={triggerLabel} aria-label={`Chat: ${triggerLabel}`} title="Switch chats" disabled={disabled} variant="title" className="max-w-full [@media(pointer:coarse)]:min-h-11" />}
        footer={(attachExisting || onUseFromTerminal) && <>
          {onUseFromTerminal && (
            <PickerFooterAction icon={SquareTerminal} onClick={() => { changeOpen(false); onUseFromTerminal(); }}>
              {AGENT_CHAT_COPY.terminalMenu}
            </PickerFooterAction>
          )}
          {attachExisting && (
            <PickerFooterAction icon={Paperclip} onClick={() => { changeOpen(false); attachExisting.toggle(); }}>
              {attachExisting.open ? 'Hide existing chats' : 'Attach an existing chat…'}
            </PickerFooterAction>
          )}
        </>}>
        {chatRows}
      </PickerMenu>
      {onRenameSession && <RenameDialog noun="chat" target={renaming} onClose={() => setRenaming(null)} onRename={onRenameSession} />}
    </>
  );
}
