// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConversationPresentation } from './ConversationPresentation.tsx';
import { buildConversationItems } from './contracts.ts';

describe('ConversationPresentation', () => {
  it('renders explicit host data under the given name and avatar, with the host footer', () => {
    const items = buildConversationItems([
      { role: 'user', content: 'Arrange these clips.', timestamp: '2026-09-27T10:00:00Z' },
      { role: 'assistant', content: 'I prepared a quiet sequence.', timestamp: '2026-09-27T10:00:01Z' },
    ]);

    const { container } = render(
      <ConversationPresentation items={items} label="Astrid" avatarSrc="/avatar.webp" footer={<button>Send</button>} />,
    );

    expect(screen.getByText('Arrange these clips.')).toBeInTheDocument();
    expect(screen.getByText('I prepared a quiet sequence.')).toBeInTheDocument();
    expect(screen.getByText('Astrid').closest('[data-conversation-presentation]')).toHaveAttribute(
      'data-conversation-presentation',
      'shared-v1',
    );
    expect(container.querySelector('img[src="/avatar.webp"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });
});
