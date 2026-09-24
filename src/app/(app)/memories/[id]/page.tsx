import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { SIGNED_MEDIA_TTL_SECONDS, type PrivacyLevel } from "@/lib/constants";
import { EditMemoryForm } from "./edit-form";

export const metadata = { title: "Memory" };

const SOURCE_LABEL: Record<string, string> = {
  message: "From your conversation",
  media: "From a photo",
  audio: "From a voice recording",
  document: "From a document",
  user: "Written by you",
  feedback: "From your correction in Meet My Still Here",
};

export default async function MemoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: memory } = await supabase
    .from("memories")
    .select("id, type, title, content, ai_original_content, occurred_on, privacy_level, importance, status, origin, created_at")
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!memory) notFound();

  const [{ data: sources }, { data: lovedOnes }, { data: perms }, { data: people }, { data: places }] = await Promise.all([
    supabase
      .from("memory_sources")
      .select("id, source_type, excerpt, created_at, message_id, conversation_messages(content, session_id, created_at), media_assets(path, bucket, filename)")
      .eq("memory_id", id),
    supabase.from("trusted_people").select("id, name").eq("owner_user_id", user.id).neq("status", "revoked"),
    supabase.from("access_permissions").select("trusted_person_id").eq("memory_id", id),
    supabase.from("memory_people").select("people(name, relation_to_owner)").eq("memory_id", id),
    supabase.from("memory_places").select("places(name)").eq("memory_id", id),
  ]);

  const sourceViews = await Promise.all(
    (sources ?? []).map(async (s) => {
      const msg = s.conversation_messages as unknown as { content: string; session_id: string; created_at: string } | null;
      const media = s.media_assets as unknown as { path: string; bucket: string; filename: string } | null;
      const imageUrl = media ? (await supabase.storage.from(media.bucket).createSignedUrl(media.path, SIGNED_MEDIA_TTL_SECONDS)).data?.signedUrl : null;
      return { ...s, msg, imageUrl };
    }),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link href="/memories?tab=kept" className="text-sm text-ink-soft hover:text-ink">← My Memories</Link>
      <EditMemoryForm
        memory={{ ...memory, privacy_level: memory.privacy_level as PrivacyLevel }}
        lovedOnes={lovedOnes ?? []}
        allowed={(perms ?? []).map((p) => p.trusted_person_id)}
      />

      {((people?.length ?? 0) > 0 || (places?.length ?? 0) > 0) && (
        <section className="flex flex-wrap gap-2">
          {(people ?? []).map((p, i) => {
            const person = p.people as unknown as { name: string; relation_to_owner: string | null };
            return <span key={`p${i}`} className="chip">{person.name}{person.relation_to_owner ? ` · ${person.relation_to_owner}` : ""}</span>;
          })}
          {(places ?? []).map((p, i) => (
            <span key={`l${i}`} className="chip">📍 {(p.places as unknown as { name: string }).name}</span>
          ))}
        </section>
      )}

      <section>
        <h2 className="mb-1 text-2xl">Why does Still Here know this?</h2>
        <p className="mb-4 text-sm text-ink-soft">The original sources are kept exactly as they were, even when you edit the memory.</p>
        <div className="space-y-3">
          {sourceViews.map((s) => (
            <div key={s.id} className="card p-4">
              <p className="eyebrow mb-2">{SOURCE_LABEL[s.source_type] ?? s.source_type}</p>
              {s.msg && (
                <>
                  <p className="font-serif text-lg">&ldquo;{s.msg.content}&rdquo;</p>
                  <Link href={`/talk/${s.msg.session_id}`} className="mt-2 inline-block text-sm underline">
                    Open the conversation ({new Date(s.msg.created_at).toLocaleDateString()})
                  </Link>
                </>
              )}
              {s.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.imageUrl} alt="" className="mt-2 max-h-56 rounded-xl object-cover" />
              )}
              {!s.msg && s.excerpt && <p className="text-ink-soft">{s.excerpt}</p>}
            </div>
          ))}
          {memory.ai_original_content && memory.ai_original_content !== memory.content && (
            <div className="card p-4">
              <p className="eyebrow mb-2">First version suggested by AI</p>
              <p className="text-sm text-ink-soft">{memory.ai_original_content}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
