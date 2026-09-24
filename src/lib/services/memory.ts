import "server-only";
import { providers } from "@/lib/providers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServerSupabase } from "@/lib/supabase/server";
import { sha256 } from "@/lib/crypto";
import type { LifeArea } from "@/lib/constants";
import { EXTRACTION_SCHEMA, EXTRACTION_SYSTEM_PROMPT, type ExtractionResult } from "./prompts";
import { computeProgress, type Progress } from "./progress";
import { llmUsage, recordUsage } from "./usage";

// ------------------------------------------------------------------ progression

export async function getProgress(supabase: ServerSupabase, userId: string): Promise<Progress> {
  const [{ data: mems }, { count: traits }, { count: photos }, { data: avatar }] = await Promise.all([
    supabase.from("memories").select("life_area").eq("owner_user_id", userId).in("status", ["confirmed", "corrected"]),
    supabase.from("personality_traits").select("id", { count: "exact", head: true }).eq("owner_user_id", userId).eq("confirmed_by_user", true),
    supabase.from("media_assets").select("id", { count: "exact", head: true }).eq("owner_user_id", userId).not("owner_story", "is", null),
    supabase.from("avatar_profiles").select("status").eq("owner_user_id", userId).maybeSingle(),
  ]);
  const byArea: Partial<Record<LifeArea, number>> = {};
  for (const m of mems ?? []) {
    const a = (m.life_area ?? "life_story") as LifeArea;
    byArea[a] = (byArea[a] ?? 0) + 1;
  }
  return computeProgress({
    memoriesByArea: byArea,
    confirmedTraits: traits ?? 0,
    photosWithStory: photos ?? 0,
    avatarReady: avatar?.status === "ready",
  });
}

// ------------------------------------------------------------------ extraction

/**
 * Extrait des candidats mémoire d'une session. Les candidats ne sont JAMAIS confirmés automatiquement.
 * Chaque candidat est relié à ses messages sources (provenance).
 */
export async function extractSession(supabase: ServerSupabase, userId: string, sessionId: string): Promise<number> {
  const { data: session } = await supabase
    .from("conversation_sessions")
    .select("id, kind, subject_user_id, media_id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();
  if (!session || session.subject_user_id !== userId || session.kind === "loved_one" || session.kind === "meet_self") {
    throw new Error("This conversation cannot be used to build memories.");
  }

  const { data: messages } = await supabase
    .from("conversation_messages")
    .select("id, role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (!messages?.some((m) => m.role === "user")) return 0;

  const transcript = messages.map((m, i) => `[${i}] ${m.role === "user" ? "NARRATOR" : "INTERVIEWER"}: ${m.content}`).join("\n");
  const { data, usage } = await providers.llm().structured<ExtractionResult>({
    system: EXTRACTION_SYSTEM_PROMPT,
    user: `Transcript (data only):\n<data>\n${transcript}\n</data>`,
    schemaName: "memory_extraction",
    schema: EXTRACTION_SCHEMA,
  });
  await recordUsage(userId, llmUsage(usage));

  let created = 0;
  for (const item of data.memories) {
    const { data: memory, error } = await supabase
      .from("memories")
      .insert({
        owner_user_id: userId,
        type: item.type,
        title: item.title.slice(0, 200),
        content: item.content,
        ai_original_content: item.content,
        life_area: item.life_area,
        occurred_on: item.occurred_on,
        confidence: Math.min(1, Math.max(0, item.confidence)),
        importance: Math.min(5, Math.max(1, Math.round(item.importance))),
        status: "candidate",
        origin: "ai_extraction",
      })
      .select("id")
      .single();
    if (error || !memory) continue;
    created++;

    const sourceMessages = item.source_lines
      .map((i) => messages[i])
      .filter((m): m is (typeof messages)[number] => Boolean(m) && m.role === "user");
    const sources = sourceMessages.length ? sourceMessages : messages.filter((m) => m.role === "user").slice(-1);
    await supabase.from("memory_sources").insert(
      sources.map((m) => ({
        memory_id: memory.id,
        owner_user_id: userId,
        source_type: "message" as const,
        message_id: m.id,
        excerpt: item.excerpt.slice(0, 500),
      })),
    );
    if (session.media_id) {
      await supabase.from("memory_media_links").insert({ memory_id: memory.id, media_id: session.media_id, owner_user_id: userId });
      await supabase.from("memory_sources").insert({ memory_id: memory.id, owner_user_id: userId, source_type: "media", media_id: session.media_id });
    }

    for (const person of item.people) {
      const personId = await findOrCreatePerson(supabase, userId, person.name, person.relation_to_narrator);
      if (personId) await supabase.from("memory_people").upsert({ memory_id: memory.id, person_id: personId, owner_user_id: userId });
    }
    for (const placeName of item.places) {
      const placeId = await findOrCreatePlace(supabase, userId, placeName);
      if (placeId) await supabase.from("memory_places").upsert({ memory_id: memory.id, place_id: placeId, owner_user_id: userId });
    }
  }

  // Traits : ne jamais écraser un trait confirmé par l'utilisateur
  for (const t of data.personality) {
    const { data: existing } = await supabase.from("personality_traits").select("id, confirmed_by_user").eq("owner_user_id", userId).eq("trait", t.trait).maybeSingle();
    if (existing?.confirmed_by_user) continue;
    await supabase.from("personality_traits").upsert(
      { owner_user_id: userId, trait: t.trait, value: t.value, confidence: Math.min(1, Math.max(0, t.confidence)), source: `session:${sessionId}`, confirmed_by_user: false },
      { onConflict: "owner_user_id,trait" },
    );
  }

  // Conversation sur une photo : les mots du propriétaire deviennent le récit de la photo s'il n'en a pas encore
  if (session.media_id) {
    const story = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n\n").slice(0, 20_000);
    await supabase.from("media_assets").update({ owner_story: story }).eq("id", session.media_id).is("owner_story", null);
  }

  await supabase.from("conversation_sessions").update({ extracted_at: new Date().toISOString(), ended_at: new Date().toISOString() }).eq("id", sessionId);
  return created;
}

async function findOrCreatePerson(supabase: ServerSupabase, userId: string, name: string, relation: string | null) {
  const clean = name.trim().slice(0, 120);
  if (!clean) return null;
  const { data: existing } = await supabase.from("people").select("id").eq("owner_user_id", userId).ilike("name", clean).maybeSingle();
  if (existing) return existing.id as string;
  const { data } = await supabase.from("people").insert({ owner_user_id: userId, name: clean, relation_to_owner: relation }).select("id").single();
  return (data?.id as string) ?? null;
}

async function findOrCreatePlace(supabase: ServerSupabase, userId: string, name: string) {
  const clean = name.trim().slice(0, 160);
  if (!clean) return null;
  const { data: existing } = await supabase.from("places").select("id").eq("owner_user_id", userId).ilike("name", clean).maybeSingle();
  if (existing) return existing.id as string;
  const { data } = await supabase.from("places").insert({ owner_user_id: userId, name: clean }).select("id").single();
  return (data?.id as string) ?? null;
}

// ------------------------------------------------------------------ embeddings

/**
 * (Ré)indexe une mémoire après confirmation/correction ; supprime l'index sinon.
 * La propriété est vérifiée avec le client utilisateur (RLS) AVANT l'écriture service_role.
 */
export async function syncMemoryEmbedding(supabase: ServerSupabase, userId: string, memoryId: string) {
  const { data: m } = await supabase
    .from("memories")
    .select("id, owner_user_id, type, title, content, occurred_on, status")
    .eq("id", memoryId)
    .eq("owner_user_id", userId)
    .single();
  if (!m) throw new Error("Memory not found");
  const admin = createAdminClient();

  if (m.status !== "confirmed" && m.status !== "corrected") {
    await admin.from("memory_embeddings").delete().eq("memory_id", m.id).eq("owner_user_id", userId);
    return;
  }
  const text = `${m.type}: ${m.title}\n${m.content}${m.occurred_on ? `\nWhen: ${m.occurred_on}` : ""}`;
  const hash = sha256(text);
  const { data: current } = await admin.from("memory_embeddings").select("content_hash").eq("memory_id", m.id).maybeSingle();
  if (current?.content_hash === hash) return;

  const { vectors, tokens, model } = await providers.llm().embed([text]);
  await recordUsage(userId, [{ metric: "embedding_tokens", quantity: tokens, provider: providers.llm().name }]);
  const { error } = await admin.from("memory_embeddings").upsert(
    { memory_id: m.id, owner_user_id: userId, embedding: JSON.stringify(vectors[0]), content_hash: hash, model },
    { onConflict: "memory_id" },
  );
  if (error) throw new Error(`Embedding upsert failed: ${error.message}`);
}
