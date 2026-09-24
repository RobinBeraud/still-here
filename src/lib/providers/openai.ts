import "server-only";
import OpenAI from "openai";
import { serverEnv } from "@/lib/env";
import type { ChatMessage, LLMProvider, TokenUsage, VoiceProvider } from "./types";

let client: OpenAI | null = null;
function openai() {
  if (!client) client = new OpenAI({ apiKey: serverEnv.openaiApiKey });
  return client;
}

function usageOf(u: { prompt_tokens?: number; completion_tokens?: number } | undefined | null): TokenUsage {
  return { inputTokens: u?.prompt_tokens ?? 0, outputTokens: u?.completion_tokens ?? 0 };
}

export class OpenAILLMProvider implements LLMProvider {
  readonly name = "openai";

  async chat(opts: { system: string; messages: ChatMessage[]; maxOutputTokens?: number }) {
    const res = await openai().chat.completions.create({
      model: serverEnv.openaiChatModel,
      messages: [{ role: "system", content: opts.system }, ...opts.messages],
      max_completion_tokens: opts.maxOutputTokens ?? 2000,
    });
    return { text: res.choices[0]?.message?.content?.trim() ?? "", usage: usageOf(res.usage) };
  }

  async structured<T>(opts: { system: string; user: string; schemaName: string; schema: Record<string, unknown>; maxOutputTokens?: number }) {
    const res = await openai().chat.completions.create({
      model: serverEnv.openaiExtractionModel,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      max_completion_tokens: opts.maxOutputTokens ?? 6000,
      response_format: {
        type: "json_schema",
        json_schema: { name: opts.schemaName, schema: opts.schema, strict: true },
      },
    });
    const raw = res.choices[0]?.message?.content ?? "{}";
    return { data: JSON.parse(raw) as T, usage: usageOf(res.usage) };
  }

  async describeImage(opts: { imageUrl: string; prompt: string }) {
    const res = await openai().chat.completions.create({
      model: serverEnv.openaiChatModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: opts.prompt },
            { type: "image_url", image_url: { url: opts.imageUrl } },
          ],
        },
      ],
      max_completion_tokens: 1500,
    });
    return { text: res.choices[0]?.message?.content?.trim() ?? "", usage: usageOf(res.usage) };
  }

  async embed(texts: string[]) {
    const model = serverEnv.openaiEmbeddingModel;
    const res = await openai().embeddings.create({ model, input: texts });
    return { vectors: res.data.map((d) => d.embedding), tokens: res.usage?.total_tokens ?? 0, model };
  }

  async transcribe(file: File, language?: string) {
    const res = await openai().audio.transcriptions.create({
      file,
      model: serverEnv.openaiTranscribeModel,
      ...(language ? { language } : {}),
    });
    return { text: res.text };
  }
}

export class OpenAIVoiceProvider implements VoiceProvider {
  readonly name = "openai-tts";

  async synthesize(opts: { text: string; voiceId?: string | null; instructions?: string }) {
    const res = await openai().audio.speech.create({
      model: serverEnv.openaiTtsModel,
      voice: (opts.voiceId || serverEnv.openaiTtsVoice) as "alloy",
      input: opts.text,
      ...(opts.instructions ? { instructions: opts.instructions } : {}),
      response_format: "mp3",
    });
    return { audio: await res.arrayBuffer(), contentType: "audio/mpeg" };
  }
}
