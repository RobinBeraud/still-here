"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { syncMemoryEmbedding } from "@/lib/services/memory";
import { getEntitlements } from "@/lib/services/entitlements-repo";
import { MEMORY_TYPES, PERSONALITY_TRAITS, PRIVACY_LEVELS } from "@/lib/constants";

type Result = { ok: true } | { ok: false; error: string };

async function ensureCapacity(userId: string, supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]): Promise<string | null> {
  const ent = await getEntitlements(userId);
  if (!ent.can_add_content) return "Your Still Here is in Preservation mode. Reactivate a plan to confirm new memories.";
  if (ent.max_memories === null) return null;
  const { count } = await supabase
    .from("memories")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId)
    .in("status", ["confirmed", "corrected"]);
  return (count ?? 0) >= ent.max_memories
    ? `Your plan keeps up to ${ent.max_memories} memories. Upgrade to preserve your whole story.`
    : null;
}

/** Transition de statut décidée par le propriétaire. Aucune extraction IA ne se confirme seule. */
export async function reviewMemory(memoryId: string, action: "confirm" | "reject" | "private" | "restore"): Promise<Result> {
  const { supabase, user } = await requireUser();
  const { data: m } = await supabase.from("memories").select("status").eq("id", memoryId).eq("owner_user_id", user.id).single();
  if (!m) return { ok: false, error: "Memory not found." };

  let patch: Record<string, unknown>;
  if (action === "confirm") {
    if (m.status !== "confirmed" && m.status !== "corrected") {
      const blocked = await ensureCapacity(user.id, supabase);
      if (blocked) return { ok: false, error: blocked };
    }
    patch = { status: m.status === "corrected" ? "corrected" : "confirmed", confirmed_at: new Date().toISOString() };
  } else if (action === "reject") {
    patch = { status: "rejected" };
  } else if (action === "restore") {
    patch = { status: "candidate", confirmed_at: null };
  } else {
    patch = { privacy_level: "OWNER_ONLY" };
    if (m.status === "candidate") {
      const blocked = await ensureCapacity(user.id, supabase);
      if (blocked) return { ok: false, error: blocked };
      patch = { ...patch, status: "confirmed", confirmed_at: new Date().toISOString() };
    }
  }
  const { error } = await supabase.from("memories").update(patch).eq("id", memoryId).eq("owner_user_id", user.id);
  if (error) return { ok: false, error: error.message };
  await syncMemoryEmbedding(supabase, user.id, memoryId);
  revalidatePath("/memories");
  return { ok: true };
}

const MemoryEdit = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(10_000),
  occurred_on: z.string().trim().max(100).optional(),
  type: z.enum(MEMORY_TYPES),
  privacy_level: z.enum(PRIVACY_LEVELS),
  importance: z.coerce.number().int().min(1).max(5),
});

/** Correction par l'utilisateur : statut « corrected ». La source originale n'est jamais modifiée. */
export async function editMemory(memoryId: string, _: unknown, form: FormData): Promise<Result> {
  const { supabase, user } = await requireUser();
  const parsed = MemoryEdit.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Please check the fields." };

  const { data: m } = await supabase.from("memories").select("status").eq("id", memoryId).eq("owner_user_id", user.id).single();
  if (!m) return { ok: false, error: "Memory not found." };
  if (m.status !== "confirmed" && m.status !== "corrected") {
    const blocked = await ensureCapacity(user.id, supabase);
    if (blocked) return { ok: false, error: blocked };
  }
  const { error } = await supabase
    .from("memories")
    .update({ ...parsed.data, occurred_on: parsed.data.occurred_on || null, status: "corrected", confirmed_at: new Date().toISOString() })
    .eq("id", memoryId)
    .eq("owner_user_id", user.id);
  if (error) return { ok: false, error: error.message };

  // Permissions nominatives (SPECIFIC_PEOPLE)
  const allowed = form.getAll("allowed_people").map(String);
  await supabase.from("access_permissions").delete().eq("owner_user_id", user.id).eq("memory_id", memoryId);
  if (parsed.data.privacy_level === "SPECIFIC_PEOPLE" && allowed.length) {
    await supabase.from("access_permissions").insert(allowed.map((tp) => ({ owner_user_id: user.id, trusted_person_id: tp, memory_id: memoryId })));
  }

  await syncMemoryEmbedding(supabase, user.id, memoryId);
  revalidatePath(`/memories/${memoryId}`);
  revalidatePath("/memories");
  return { ok: true };
}

export async function createMemory(_: unknown, form: FormData): Promise<Result> {
  const { supabase, user } = await requireUser();
  const parsed = MemoryEdit.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Please check the fields." };
  const blocked = await ensureCapacity(user.id, supabase);
  if (blocked) return { ok: false, error: blocked };
  const { data, error } = await supabase
    .from("memories")
    .insert({
      ...parsed.data,
      occurred_on: parsed.data.occurred_on || null,
      owner_user_id: user.id,
      status: "confirmed",
      origin: "user",
      confidence: 1,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save." };
  await supabase.from("memory_sources").insert({ memory_id: data.id, owner_user_id: user.id, source_type: "user", excerpt: parsed.data.content.slice(0, 500) });
  await syncMemoryEmbedding(supabase, user.id, data.id);
  revalidatePath("/memories");
  return { ok: true };
}

/**
 * Feedback « Sounds like me / Doesn't sound like me / Correct this » sur Meet My Still Here.
 * Une correction crée un CANDIDAT mémoire (à valider) ; les sources historiques ne sont pas modifiées.
 */
export async function submitFeedback(messageId: string, rating: "sounds_like_me" | "not_like_me" | "correction", correction: string | null) {
  const { supabase, user } = await requireUser();
  const { data: msg } = await supabase
    .from("conversation_messages")
    .select("id, content, role, conversation_sessions(kind, subject_user_id)")
    .eq("id", messageId)
    .single();
  const session = msg?.conversation_sessions as unknown as { kind: string; subject_user_id: string } | null;
  if (!msg || msg.role !== "assistant" || session?.kind !== "meet_self" || session.subject_user_id !== user.id) return;

  await supabase.from("avatar_feedback").insert({
    owner_user_id: user.id,
    message_id: messageId,
    rating,
    correction_text: correction?.slice(0, 4000) ?? null,
  });

  if (rating === "correction" && correction?.trim()) {
    const { data: memory } = await supabase
      .from("memories")
      .insert({
        owner_user_id: user.id,
        type: "MEMORY",
        title: "Correction from Meet My Still Here",
        content: correction.trim(),
        status: "candidate",
        origin: "feedback",
        confidence: 0.9,
        life_area: "life_story",
      })
      .select("id")
      .single();
    if (memory) {
      await supabase.from("memory_sources").insert({
        memory_id: memory.id,
        owner_user_id: user.id,
        source_type: "feedback",
        message_id: messageId,
        excerpt: `Still Here said: "${msg.content.slice(0, 300)}"`,
      });
    }
  }
}

// ------------------------------------------------------------------ personnalité

const TraitEdit = z.object({ trait: z.enum(PERSONALITY_TRAITS), value: z.string().trim().min(1).max(1000) });

export async function saveTrait(_: unknown, form: FormData): Promise<Result> {
  const { supabase, user } = await requireUser();
  const parsed = TraitEdit.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Please check the fields." };
  const { error } = await supabase.from("personality_traits").upsert(
    { owner_user_id: user.id, trait: parsed.data.trait, value: parsed.data.value, confidence: 1, source: "user", confirmed_by_user: true },
    { onConflict: "owner_user_id,trait" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/memories/personality");
  return { ok: true };
}

export async function confirmTrait(trait: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("personality_traits").update({ confirmed_by_user: true }).eq("owner_user_id", user.id).eq("trait", trait);
  revalidatePath("/memories/personality");
}

export async function removeTrait(trait: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("personality_traits").delete().eq("owner_user_id", user.id).eq("trait", trait);
  revalidatePath("/memories/personality");
}
