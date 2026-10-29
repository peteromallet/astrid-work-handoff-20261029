/* eslint-disable */
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { bootstrapEdgeHandler, NO_SESSION_RUNTIME_OPTIONS } from "../_shared/edgeHandler.ts";
import { jsonResponse } from "../_shared/http.ts";
import { getGroqClient, transcribeAudio } from "../_shared/transcription.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse({ ok: true });
  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "ai-voice-prompt",
    logPrefix: "[AI-VOICE-PROMPT]",
    method: "POST",
    corsPreflight: false,
    parseBody: "none",
    auth: {
      required: true,
      options: { allowJwtUserAuth: true },
    },
    ...NO_SESSION_RUNTIME_OPTIONS,
  });
  if (!bootstrap.ok) {
    return bootstrap.response;
  }

  const { logger } = bootstrap.value;

  try {
    const groq = getGroqClient();

    // Handle multipart form data for audio upload OR JSON for text instructions
    const contentType = req.headers.get("content-type") || "";
    
    let audioFile: File | null = null;
    let textInstructions: string | null = null;
    let task: string = "transcribe_and_write";
    let context: string = "";
    let example: string = "";
    let existingValue: string = "";
    
    if (contentType.includes("application/json")) {
      // JSON body with text instructions (skip transcription)
      const body = await req.json();
      textInstructions = body.textInstructions || null;
      task = body.task || "transcribe_and_write";
      context = body.context || "";
      example = body.example || "";
      existingValue = body.existingValue || "";
      
      if (!textInstructions) {
        return jsonResponse({ error: "textInstructions is required for JSON requests" }, 400);
      }
      logger.info('Text instructions received', { preview: textInstructions.substring(0, 100) });
    } else {
      // Multipart form data with audio file
      const formData = await req.formData();
      audioFile = formData.get("audio") as File | null;
      task = formData.get("task") as string || "transcribe_and_write";
      context = formData.get("context") as string || "";
      example = formData.get("example") as string || "";
      existingValue = formData.get("existingValue") as string || "";

      if (!audioFile) {
        return jsonResponse({ error: "audio file is required" }, 400);
      }

      logger.info('Received audio file', { name: audioFile.name, size: audioFile.size, type: audioFile.type });
    }
    
    if (existingValue) {
      logger.info('Existing value provided', { chars: existingValue.length });
    }

    // Determine transcribed text - either from audio or use text instructions directly
    let transcribedText: string;
    
    if (textInstructions) {
      // Skip transcription - use text instructions directly
      transcribedText = textInstructions;
    } else if (audioFile) {
      // Step 1: Transcribe audio using Whisper
      transcribedText = await transcribeAudio(groq, audioFile);
      logger.info('Transcription complete', { preview: transcribedText.substring(0, 100) });

      if (!transcribedText) {
        return jsonResponse({ error: "No speech detected in audio" }, 400);
      }

      // If task is just transcribe, return the raw text
      if (task === "transcribe_only") {
        return jsonResponse({ 
          success: true, 
          transcription: transcribedText,
          usage: null 
        });
      }
    } else {
      return jsonResponse({ error: "Either audio file or textInstructions is required" }, 400);
    }

    // Step 2: Classify intent — is the user dictating a prompt or requesting a rewrite?
    const classifyMsg = `You classify spoken input for an AI image generation tool. Decide whether the user is:

DIRECT: Dictating actual prompt content — describing a scene, subject, or concept they want to generate. They are telling you WHAT to create. Examples:
- "a woman walking through a forest at sunset"
- "cyberpunk cityscape with neon lights and rain"
- "close-up portrait, soft lighting, film grain"
- "an old man sitting on a bench reading a newspaper"

REWRITE: Giving meta-instructions about what kind of prompt they want — asking for help, elaboration, expansion, modification, or describing what they want indirectly. Examples:
- "something like a dramatic landscape, make it moody"
- "blur, distortion, and similar quality issues"
- "make it more cinematic"
- "like the previous one but at night"
- "expand on this, add more detail"
- "I want something with a vintage feel, maybe some film grain"
${existingValue ? `- Any request to modify, extend, or build on the existing content` : ""}

Respond with ONLY the word "direct" or "rewrite".`;

    logger.info('Classifying transcription intent...');
    let intent: "direct" | "rewrite" = "rewrite"; // default to rewrite for safety
    try {
      const classifyResp = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",
        messages: [
          { role: "system", content: classifyMsg },
          { role: "user", content: `INPUT: "${transcribedText}"${existingValue ? `\nEXISTING FIELD CONTENT: "${existingValue}"` : ""}` },
        ],
        temperature: 0,
        max_tokens: 8,
      });
      const raw = classifyResp.choices[0]?.message?.content?.trim().toLowerCase() || "";
      intent = raw.startsWith("direct") ? "direct" : "rewrite";
      logger.info('Intent classified', { intent, raw });
    } catch (classifyError: unknown) {
      logger.warn('Classification failed, defaulting to rewrite', { error: classifyError?.message || String(classifyError) });
    }

    let promptText: string;
    let usage: unknown = null;

    if (intent === "direct") {
      // Clean filler words but preserve the prompt as-is
      promptText = transcribedText
        .replace(/\b(um|uh|like|you know|I mean|so|well|okay so|right)\b\s*/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      logger.info('Direct prompt (cleaned)', { preview: promptText.substring(0, 100) });
    } else {
      // Step 3: Light rewrite — stay close to what the user said
      const systemMsg = `You clean up spoken input for AI image generation prompt fields. Your job is to make minimal, conservative edits — NOT to rewrite or embellish.

What you DO:
- Remove filler words (um, uh, like, you know, I mean)
- Fix grammar and punctuation from speech-to-text artifacts
- If they say "X and similar things" or "etc" or "that kind of thing" → expand with a few more examples
- If they say "make it more X" or "change Y" and there's existing content → apply the modification
- If they explicitly ask you to elaborate, expand, or rewrite → then do so

What you DO NOT do:
- Do not add descriptive details the user didn't mention
- Do not embellish, poeticize, or "improve" the prompt
- Do not add style keywords, quality tags, or atmosphere words they didn't say
- Do not change the meaning or tone of what they said
- Do not make short prompts longer — short is fine

Your output should sound like the user, just cleaned up.`;

      let userMsg = `Clean up this spoken input for use in an AI generation field.

SPOKEN INPUT: "${transcribedText}"
${existingValue ? `
EXISTING CONTENT IN FIELD: "${existingValue}"
(The user may want to modify, extend, or replace this)
` : ""}
${context ? `FIELD CONTEXT: ${context}
` : ""}${example ? `EXAMPLE FORMAT: "${example}"
` : ""}
${existingValue ? `Consider how their input relates to the existing content - are they adding, modifying, or replacing?
` : ""}
RULES:
- Output ONLY the final text, no commentary or quotes
- Match the expected format for the field (e.g., comma-separated list for negative prompts)
- Stay as close to the user's original words as possible
- Preserve all specific details: names, colors, numbers, camera angles, references

Output:`;

      logger.info('Calling rewrite model...');

      try {
        const resp = await groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
          temperature: 0.6,
          max_tokens: 2048,
          top_p: 1,
        });
        logger.info('Rewrite model responded successfully');
        promptText = resp.choices[0]?.message?.content?.trim() || transcribedText;
        usage = resp.usage;
      } catch (rewriteError: unknown) {
        logger.error('Rewrite model error', { error: rewriteError?.message || String(rewriteError) });
        promptText = transcribedText;
      }
    }

    logger.info('Final prompt', { intent, preview: promptText.substring(0, 100) });

    await logger.flush();
    return jsonResponse({
      success: true,
      transcription: transcribedText,
      prompt: promptText,
      intent,
      usage,
    });

  } catch (err: unknown) {
    logger.error('Error', { error: err?.message || String(err) });
    await logger.flush();
    return jsonResponse({ error: "Internal server error", details: err?.message }, 500);
  }
});
