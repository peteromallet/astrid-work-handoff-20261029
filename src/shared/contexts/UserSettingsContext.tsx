import { createContext, useContext, type ReactNode } from 'react';
import type { UserPreferences } from '@/shared/settings/userPreferences';
import { requireContextValue } from './contextGuard';

interface UserSettingsContextType {
  /** Account settings, unavailable under Astrid authority */
  userSettings: UserPreferences | undefined;
  /** Whether settings are currently loading */
  isLoadingSettings: boolean;
  /** Fetch user settings from the server */
  fetchUserSettings: () => Promise<void>;
  /** Account settings updates are unavailable under Astrid authority */
  updateUserSettings: (scope: 'user', patch: Partial<UserPreferences>) => Promise<void>;
}

const UserSettingsContext = createContext<UserSettingsContextType | undefined>(undefined);

const astridUserSettings: UserSettingsContextType = {
  userSettings: undefined,
  isLoadingSettings: false,
  fetchUserSettings: async () => {},
  updateUserSettings: async () => {},
};

/** Account settings are unavailable under Astrid authority. */
export const UserSettingsProvider = ({ children }: { children: ReactNode }) => (
  <UserSettingsContext.Provider value={astridUserSettings}>
    {children}
  </UserSettingsContext.Provider>
);

/**
 * Hook to access the account settings compatibility view.
 *
 * For device-local preferences (like sound on/off), use useLocalPreferences instead.
 *
 * @returns { userSettings, isLoadingSettings, fetchUserSettings, updateUserSettings }
 */
export const useUserSettings = () => {
  return requireContextValue(
    useContext(UserSettingsContext),
    'useUserSettings',
    'UserSettingsProvider',
  );
};
