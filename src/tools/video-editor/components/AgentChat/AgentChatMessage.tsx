import { ConversationMessage, ConversationToolGroup } from '@/shared/components/conversation/ConversationMessage';
import type { ConversationAttachment, ConversationTurn } from '@/shared/components/conversation/contracts';
import { presentEditorRequests, type RecordedEditorResult } from '../../runtime/editorRequestPresentation';

export function AgentChatMessage({ turn, onAttachmentClick, recordedResults }: {
  turn: ConversationTurn; onAttachmentClick?: (attachment: ConversationAttachment) => void;
  recordedResults?: readonly RecordedEditorResult[];
}) {
  const presented = turn.role === 'assistant' ? presentEditorRequests(turn.content, turn.timestamp, recordedResults) : null;
  return <>
    <ConversationMessage turn={presented ? { ...turn, content: presented.prose } : turn} onAttachmentClick={onAttachmentClick} />
    {presented && presented.pairs.length > 0 && <ConversationToolGroup pairs={presented.pairs} />}
  </>;
}
export {
  ConversationAttachmentStrip as AgentChatAttachmentStrip,
  ConversationToolGroup as AgentChatToolGroup,
} from '@/shared/components/conversation/ConversationMessage.tsx';
export type { ConversationAttachment as AgentChatAttachmentPreviewItem } from '@/shared/components/conversation/contracts.ts';
