import type { ReactNode } from 'react';
import {
  ConversationMessage,
  ConversationToolGroup,
} from './ConversationMessage.tsx';
import type { ConversationItem } from './contracts.ts';

export type ConversationPresentationProps = {
  items: readonly ConversationItem[];
  footer?: ReactNode;
  scrollContainerTabIndex?: number;
  label: string;
  avatarSrc: string;
};

/** A static, read-only transcript under a name-and-avatar header (the public scripted example). State and side effects stay with the host. */
export function ConversationPresentation({
  items,
  footer,
  scrollContainerTabIndex,
  label,
  avatarSrc,
}: ConversationPresentationProps) {
  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      data-conversation-presentation="shared-v1"
    >
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="flex items-end gap-2">
          <img src={avatarSrc} alt="" aria-hidden="true" className="h-5 w-5 rounded-full object-cover" />
          <span className="text-sm font-medium">{label}</span>
        </div>
      </div>

      <div tabIndex={scrollContainerTabIndex} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        <div className="flex flex-col gap-2.5">
          {items.map((item) => item.kind === 'message' ? (
            <ConversationMessage key={item.key} turn={item.turn} />
          ) : (
            <ConversationToolGroup key={item.key} pairs={item.pairs} />
          ))}
        </div>
      </div>

      {footer && <div className="border-t border-border/70 px-3 py-3">{footer}</div>}
    </div>
  );
}
