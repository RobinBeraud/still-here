import "server-only";
import { providers } from "@/lib/providers";
import type { ServerSupabase } from "@/lib/supabase/server";
import {
  DIGITAL_SELF_SCHEMA,
  digitalSelfSystemPrompt,
  interviewerSystemPrompt,
  validateUsedIds,
  type DigitalSelfAnswer,
  type RetrievedMemory,
} from "./prompts";
import { getProgress } from "./memory";
import { underdocumentedAreas } from "./progress";
import { llmUsage, recordUsage } from "./usage";

const HISTORY_LIMIT = 30;

type Session = { id: string; user_id: string; subject_user_id: string; kind: string; media_id: string | null };

export async function loadSession(supabase: ServerSupabase, userId: string, sessionId: string): Promise<Session> {
  const { data } = await supabase
    .from("conversation_sessions")
    .select("id, user_id, subject_user_id, kind, media_id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();
  if (!data) throw new Error("Conversation not found");
  return data as Session;
}

async function history(supabase: ServerSupabase, sessionId: string) {
  const { data } = await supabase
    .from("conversation_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  return (data ?? []).reverse() as { role: "user" | "assistant"; content: string }[];
}

async function saveMessage(
  supabase: ServerSupabase,
  userId: string,
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  extra: { used_memory_ids?: string[]; answer_basis?: string; audio_path?: string } = {},
) {
  const { data, error } = await supabase
    .from("conversation_messages")
    .insert({ session_id: sessionId, user_id: userId, role, content, ...extra })
    .select("id, role, content, answer_basis, created_at")
    .single();
  if (error) throw new Error(`Could not save message: ${error.message}`);
  return data;
}

// ------------------------------------------------------------------ interviewer

export async function interviewTurn(
  supabase: ServerSupabase,
  userId: string,
  session: Session,
  userText: string | null,
  audioPath: string | null = null,
) {
  const [{ data: profile }, progress, { data: recent }] = await Promise.all([
    supabase.from("profiles").select("first_name, preferred_name, language").eq("id", userId).single(),
    getProgress(supabase, userId),
    supabase.from("memories").select("title").eq("owner_user_id", userId).in("status", ["confirmed", "corrected"]).order("updated_at", { ascending: false }).limit(15),
  ]);

  let photo: { ownerStory: string | null; aiDescription: string | null } | null = null;
  if (session.media_id) {
    const { data: media } = await supabase.from("media_assets").select("owner_story, ai_description").eq("id", session.media_id).single();
    if (media) photo = { ownerStory: media.owner_story, aiDescription: media.ai_description };
  }

  const userMessage = userText
    ? await saveMessage(supabase, userId, session.id, "user", userText, audioPath ? { audio_path: audioPath } : {})
    : null;
  const messages = await history(supabase, session.id);
  const name = profile?.preferred_name || profile?.first_name || "the narrator";

  const { text, usage } = await providers.llm().chat({
    system: interviewerSystemPrompt({
      name,
      language: profile?.language ?? "en",
      underdocumented: underdocumentedAreas(progress),
      knownSummaries: (recent ?? []).map((m) => m.title),
      photo,
    }),
    messages: messages.length ? messages : [{ role: "user", content: "(The narrator just opened the conversation. Greet them warmly by name and ask your first question.)" }],
    maxOutputTokens: 1200,
  });
  await recordUsage(userId, llmUsage(usage));
  const assistant = await saveMessage(supabase, userId, session.id, "assistant", text || "Tell me more?");
  return { userMessage, assistant };
}

// ------------------------------------------------------------------ digital self (RAG)

/**
 * Pipeline : question → identité du propriétaire → permissions (RLS) → recherche sémantique
 * → contexte grounded → LLM → réponse (+ ids des souvenirs utilisés).
 * Utilise TOUJOURS le client du viewer : RLS filtre ce qu'il a le droit de voir.
 */
export async function digitalSelfTurn(supabase: ServerSupabase, viewerId: string, session: Session, question: string) {
  const ownerId = session.subject_user_id;
  const { data: cards } = await supabase.rpc("still_here_card", { p_owner: ownerId });
  const card = (cards as { display_name: string; language: string }[] | null)?.[0];
  if (!card) throw new Error("You don't have access to this Still Here.");

  let audience: { kind: "owner" } | { kind: "loved_one"; name: string; relationship: string | null } = { kind: "owner" };
  if (viewerId !== ownerId) {
    const { data: tp } = await supabase
      .from("trusted_people")
      .select("name, relationship")
      .eq("owner_user_id", ownerId)
      .eq("linked_user_id", viewerId)
      .eq("status", "active")
      .maybeSingle();
    if (!tp) throw new Error("You don't have access to this Still Here.");
    audience = { kind: "loved_one", name: tp.name, relationship: tp.relationship };
  }

  const userMessage = await saveMessage(supabase, viewerId, session.id, "user", question);
  const prior = await history(supabase, session.id);

  const { vectors, tokens } = await providers.llm().embed([question]);
  const { data: matches, error } = await supabase.rpc("match_memories", {
    p_owner: ownerId,
    p_query: JSON.stringify(vectors[0]),
    p_count: 8,
  });
  if (error) throw new Error(`Retrieval failed: ${error.message}`);
  const retrieved = (matches ?? []) as RetrievedMemory[];

  let traitsQuery = supabase.from("personality_traits").select("trait, value").eq("owner_user_id", ownerId);
  if (viewerId !== ownerId) traitsQuery = traitsQuery.eq("confirmed_by_user", true);
  const { data: traits } = await traitsQuery;

  const system = digitalSelfSystemPrompt({ ownerName: card.display_name, language: card.language, audience, memories: retrieved, traits: traits ?? [] });
  const transcript = prior
    .slice(0, -1)
    .map((m) => `${m.role === "user" ? "THEM" : "YOU"}: ${m.content}`)
    .join("\n");
  const { data, usage } = await providers.llm().structured<DigitalSelfAnswer>({
    system,
    user: `${transcript ? `Conversation so far:\n${transcript}\n\n` : ""}They now say: ${question}`,
    schemaName: "digital_self_answer",
    schema: DIGITAL_SELF_SCHEMA,
    maxOutputTokens: 1500,
  });

  const answer = validateUsedIds(data, retrieved);
  // Coûts imputés au propriétaire du Still Here (c'est son quota)
  await recordUsage(ownerId, [
    ...llmUsage(usage),
    { metric: "embedding_tokens", quantity: tokens, provider: providers.llm().name, metadata: { viewer: viewerId === ownerId ? "owner" : "loved_one" } },
  ]);
  const assistant = await saveMessage(supabase, viewerId, session.id, "assistant", answer.answer, {
    used_memory_ids: answer.used_memory_ids,
    answer_basis: answer.basis,
  });
  return { userMessage, assistant, basis: answer.basis, usedMemoryIds: answer.used_memory_ids };
}
