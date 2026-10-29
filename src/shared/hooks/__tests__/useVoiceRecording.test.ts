import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/shared/lib/errorHandling/errorUtils', () => ({
  getErrorMessage: vi.fn((err: Error) => err?.message || 'Unknown error'),
  isError: vi.fn((err: unknown) => err instanceof Error),
}));

import { useVoiceRecording } from '../useVoiceRecording';

describe('useVoiceRecording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns initial idle state', () => {
    const { result } = renderHook(() => useVoiceRecording());

    expect(result.current.state).toBe('idle');
    expect(result.current.audioLevel).toBe(0);
    expect(result.current.remainingSeconds).toBe(15);
    expect(result.current.isRecording).toBe(false);
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.isActive).toBe(false);
  });

  it('returns all expected functions', () => {
    const { result } = renderHook(() => useVoiceRecording());

    expect(typeof result.current.startRecording).toBe('function');
    expect(typeof result.current.stopRecording).toBe('function');
    expect(typeof result.current.cancelRecording).toBe('function');
    expect(typeof result.current.toggleRecording).toBe('function');
  });

  it('stopRecording does nothing when not recording', () => {
    const { result } = renderHook(() => useVoiceRecording());

    // Should not throw
    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.state).toBe('idle');
  });

  it('cancelRecording does nothing when not recording', () => {
    const { result } = renderHook(() => useVoiceRecording());

    // Should not throw
    act(() => {
      result.current.cancelRecording();
    });

    expect(result.current.state).toBe('idle');
  });

  it('calls onError when microphone access is denied', async () => {
    const mockGetUserMedia = vi.fn().mockRejectedValue(
      Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });

    const onError = vi.fn();
    const { result } = renderHook(() =>
      useVoiceRecording({ onError })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('Microphone access denied')
    );
    expect(result.current.state).toBe('idle');
  });

  it('calls onError when no microphone found', async () => {
    const mockGetUserMedia = vi.fn().mockRejectedValue(
      Object.assign(new Error('No mic'), { name: 'NotFoundError' })
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });

    const onError = vi.fn();
    const { result } = renderHook(() =>
      useVoiceRecording({ onError })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('No microphone found')
    );
  });

  describe('posting the recording', () => {
    class FakeRecorder {
      static isTypeSupported = () => true;
      state = 'inactive';
      stream: { getTracks: () => never[] };
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void | Promise<void>) | null = null;
      onerror: ((event: Event) => void) | null = null;
      constructor(stream: { getTracks: () => never[] }) { this.stream = stream; }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['audio']) });
        void this.onstop?.();
      }
    }

    async function recordOnce(transport: { baseUrl?: string; getToken: () => Promise<string | null> }) {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
        writable: true,
        configurable: true,
      });
      vi.stubGlobal('MediaRecorder', FakeRecorder);
      const onResult = vi.fn();
      const onError = vi.fn();
      const { result } = renderHook(() => useVoiceRecording({ task: 'transcribe_only', transport, onResult, onError }));
      await act(async () => { await result.current.startRecording(); });
      await act(async () => { result.current.stopRecording(); });
      return { onResult, onError };
    }

    it('posts the audio to <base>/ai-voice-prompt with the token', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ transcription: 'hello' }) });
      vi.stubGlobal('fetch', fetchMock);
      const { onResult } = await recordOnce({ baseUrl: 'https://voice.example/functions/', getToken: async () => 'tok' });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://voice.example/functions/ai-voice-prompt');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ Authorization: 'Bearer tok' });
      expect((init.body as FormData).get('task')).toBe('transcribe_only');
      expect((init.body as FormData).get('audio')).toBeInstanceOf(Blob);
      expect(onResult).toHaveBeenCalledWith({ transcription: 'hello', prompt: undefined });
    });

    it('says chat voice is switched off when no base is set, and does not call fetch', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { onError } = await recordOnce({ baseUrl: undefined, getToken: async () => null });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('switched off'));
    });
  });
});
