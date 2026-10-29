import { useVoiceRecording } from "@/shared/hooks/useVoiceRecording.ts";
import { CHAT_VOICE_ENABLED } from "@/tools/video-editor/hooks/chatVoice.ts";

const NO_OP = () => undefined;
const VOICE_OFF = {
  startRecording: NO_OP,
  stopRecording: NO_OP,
  cancelRecording: NO_OP,
  toggleRecording: NO_OP,
  isRecording: false,
  isProcessing: false,
  audioLevel: 0,
  remainingSeconds: 0,
};

type UseAgentVoiceOptions = {
  onTranscription: (text: string) => void;
  onError?: (error: string) => void;
};

export function useAgentVoice({ onTranscription, onError }: UseAgentVoiceOptions) {
  const {
    startRecording,
    stopRecording,
    cancelRecording,
    toggleRecording,
    isRecording,
    isProcessing,
    audioLevel,
    remainingSeconds,
  } = useVoiceRecording({
    task: "transcribe_only",
    onError,
    onResult: ({ transcription }) => {
      onTranscription(transcription);
    },
  });
  // The recorder is only started by the returned actions, so while voice is off nothing asks for the microphone.
  if (!CHAT_VOICE_ENABLED) return VOICE_OFF;

  return {
    startRecording,
    stopRecording,
    cancelRecording,
    toggleRecording,
    isRecording,
    isProcessing,
    audioLevel,
    remainingSeconds,
  };
}
