/**
 * UserSettingsContext Tests
 *
 * Tests for user settings state management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// Use vi.hoisted for variables referenced inside vi.mock factories
const { mockGetUserId } = vi.hoisted(() => ({
  mockGetUserId: vi.fn().mockReturnValue('user-123'),
}));

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ userId: mockGetUserId() }),
}));

import { UserSettingsProvider, useUserSettings } from '../UserSettingsContext';

// Test consumer
function SettingsConsumer() {
  const { userSettings, isLoadingSettings } = useUserSettings();
  return (
    <div>
      <span data-testid="isLoading">{String(isLoadingSettings)}</span>
      <span data-testid="settings">{JSON.stringify(userSettings ?? 'undefined')}</span>
    </div>
  );
}

describe('UserSettingsContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserId.mockReturnValue('user-123');
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  describe('useUserSettings hook', () => {
    it('throws when used outside UserSettingsProvider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      function BadConsumer() {
        useUserSettings();
        return null;
      }

      expect(() => {
        render(<BadConsumer />);
      }).toThrow('useUserSettings must be used within a UserSettingsProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('UserSettingsProvider', () => {
    it('renders children', async () => {
      render(
        <UserSettingsProvider>
          <div data-testid="child">Hello</div>
        </UserSettingsProvider>
      );

      expect(screen.getByTestId('child')).toHaveTextContent('Hello');
    });

    it('provides undefined settings when no userId', async () => {
      mockGetUserId.mockReturnValue(null);

      render(
        <UserSettingsProvider>
          <SettingsConsumer />
        </UserSettingsProvider>
      );

      // Should not be loading and settings should be undefined
      expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      expect(screen.getByTestId('settings')).toHaveTextContent('undefined');
    });

    it('leaves user settings empty after an update in local Astrid editor mode', async () => {
      window.history.replaceState({}, '', '/tools/video-editor?project=demo-project&timeline=demo-timeline');

      function UpdateConsumer() {
        const { updateUserSettings } = useUserSettings();
        return (
          <button
            data-testid="local-update"
            onClick={() => void updateUserSettings('user', { theme: 'light' } as Record<string, unknown>)}
          >
            Update
          </button>
        );
      }

      render(
        <UserSettingsProvider>
          <SettingsConsumer />
          <UpdateConsumer />
        </UserSettingsProvider>,
      );

      expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      expect(screen.getByTestId('settings')).toHaveTextContent('undefined');

      await act(async () => {
        screen.getByTestId('local-update').click();
      });

      expect(screen.getByTestId('settings')).toHaveTextContent('undefined');
    });

    it('leaves user settings empty after an update on the Runtime path', async () => {
      function UpdateConsumer() {
        const { updateUserSettings } = useUserSettings();
        return (
          <button
            data-testid="astrid-update"
            onClick={() => void updateUserSettings('user', { theme: 'light' } as Record<string, unknown>)}
          >
            Update
          </button>
        );
      }

      render(
        <UserSettingsProvider>
          <SettingsConsumer />
          <UpdateConsumer />
        </UserSettingsProvider>,
      );

      expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      expect(screen.getByTestId('settings')).toHaveTextContent('undefined');

      await act(async () => {
        screen.getByTestId('astrid-update').click();
      });

      expect(screen.getByTestId('settings')).toHaveTextContent('undefined');
    });
  });
});
