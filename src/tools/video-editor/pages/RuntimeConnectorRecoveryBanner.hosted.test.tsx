// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let origin = '';
vi.mock('@/integrations/runtime/connection.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/integrations/runtime/connection.ts')>()),
  runtimeOrigin: () => origin,
}));

import { RuntimeAuthenticationError, RuntimeUnavailableError } from '@/integrations/runtime/client.ts';
import { setRecoveryCardShowing } from '@/integrations/runtime/recoveryCard.ts';
import { RuntimeConnectorRecoveryBanner } from '@/shared/components/RuntimeConnection/RuntimeConnectorRecoveryBanner.tsx';

const ENGINEER_WORDS = /Runtime|workspace|realm|gateway|127\.0\.0\.1|npm run/i;

afterEach(() => {
  origin = '';
  act(() => setRecoveryCardShowing(false));
  cleanup();
});

const errors = [
  ['authentication', () => new RuntimeAuthenticationError('/api/runtime')],
  ['unavailable', () => new RuntimeUnavailableError(new Error('http_error: HTTP 503'), '/api/runtime')],
  ['storage', () => new RuntimeUnavailableError(new Error('realm_admission_failed: No space left on device'), '/api/runtime')],
] as const;

describe('RuntimeConnectorRecoveryBanner on the hosted build', () => {
  it.each(errors)('%s failure: shows the matching copy and Try again retries', async (name, makeError) => {
    origin = 'http://127.0.0.1:17340';
    const onRetry = vi.fn();
    render(<RuntimeConnectorRecoveryBanner error={makeError()} onRetry={onRetry} />);

    const alert = screen.getByRole('alert');
    if (name === 'unavailable') {
      expect(alert).toHaveTextContent("Couldn't load this timeline");
      expect(alert).toHaveTextContent("Astrid on this computer didn't answer in time.");
      expect(document.body.textContent).not.toMatch(ENGINEER_WORDS);
    } else {
      expect(alert).toHaveTextContent(name === 'authentication'
        ? 'Workspace Runtime authentication failed'
        : 'Workspace Runtime reported a storage failure');
    }

    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('stays quiet while the Astrid stopped / restarted card is showing, and speaks again when it is gone', () => {
    origin = 'http://127.0.0.1:17340';
    act(() => setRecoveryCardShowing(true));
    render(<RuntimeConnectorRecoveryBanner error={errors[1][1]()} onRetry={vi.fn()} />);
    expect(screen.queryByRole('alert')).toBeNull();

    act(() => setRecoveryCardShowing(false));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('is unchanged same-origin', () => {
    origin = '';
    render(<RuntimeConnectorRecoveryBanner error={new RuntimeAuthenticationError('/api/runtime')} onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Workspace Runtime authentication failed');
  });
});
