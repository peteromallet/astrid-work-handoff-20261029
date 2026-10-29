/**
 * Chat voice (the mic and Cmd+Shift+R in the chat composer) is kept in the code but switched off.
 * It returns through an edge function; flip this to true once CHAT_VOICE_BASE_URL and
 * getChatVoiceToken below have real values.
 */
export const CHAT_VOICE_ENABLED = false;

export interface ChatVoiceTransport {
  /** The edge-functions base, with no trailing slash; the recorder posts to `<baseUrl>/ai-voice-prompt`. */
  baseUrl?: string;
  getToken: () => Promise<string | null>;
}

// The ai-voice-prompt function needs a user token, and the zip removed sign-in, so returning
// voice needs a token source. Until then the base is unset and the token getter returns null.
export const CHAT_VOICE_BASE_URL: string | undefined = undefined;
export const getChatVoiceToken = async (): Promise<string | null> => null;

export const defaultChatVoiceTransport: ChatVoiceTransport = {
  baseUrl: CHAT_VOICE_BASE_URL,
  getToken: getChatVoiceToken,
};

export function chatVoiceFunctionUrl(baseUrl: string | undefined): string {
  if (!baseUrl) throw new Error('Chat voice is switched off: no edge-function base is configured.');
  return `${baseUrl.replace(/\/+$/, '')}/ai-voice-prompt`;
}
