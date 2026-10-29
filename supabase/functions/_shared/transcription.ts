import Groq from "npm:groq-sdk@0.26.0";

let groqClient: Groq | null = null;

export function getGroqClient(): Groq {
  if (groqClient) {
    return groqClient;
  }

  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    throw new Error("[ai-voice-prompt] Missing Groq provider configuration");
  }

  groqClient = new Groq({ apiKey });
  return groqClient;
}

export async function transcribeAudio(groq: Groq, audioFile: File): Promise<string> {
  const transcription = await groq.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-large-v3-turbo",
    temperature: 0,
    response_format: "verbose_json",
  });

  return transcription.text?.trim() || "";
}
