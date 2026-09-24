import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { SIGNED_MEDIA_TTL_SECONDS, type PrivacyLevel } from "@/lib/constants";
import { SubmitButton } from "@/components/submit-button";
import { startInterview } from "../../talk/actions";
import { PhotoForm } from "./photo-form";

export const metadata = { title: "Photo" };

export default async function PhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: photo } = await supabase
    .from("media_assets")
    .select("id, path, bucket, filename, owner_story, ai_description, taken_on, location, privacy_level")
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!photo) notFound();

  const [{ data: signed }, { data: lovedOnes }, { data: perms }, { data: links }] = await Promise.all([
    supabase.storage.from(photo.bucket).createSignedUrl(photo.path, SIGNED_MEDIA_TTL_SECONDS),
    supabase.from("trusted_people").select("id, name").eq("owner_user_id", user.id).neq("status", "revoked"),
    supabase.from("access_permissions").select("trusted_person_id").eq("media_id", id),
    supabase.from("memory_media_links").select("memories(id, title, status)").eq("media_id", id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/photos" className="text-sm text-ink-soft hover:text-ink">← My Photos</Link>
      {signed?.signedUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signed.signedUrl} alt={photo.filename} className="max-h-[70vh] w-full rounded-2xl object-contain bg-paper-2" />
      )}

      <section className="card bg-paper-2">
        <p className="font-serif text-2xl">Tell me the story behind this photo.</p>
        <p className="mt-2 text-sm text-ink-soft">Your interviewer will ask you about it, and suggest memories linked to this picture.</p>
        <form action={startInterview} className="mt-4">
          <input type="hidden" name="media_id" value={photo.id} />
          <SubmitButton pendingLabel="Preparing…">Talk about this photo</SubmitButton>
        </form>
      </section>

      <PhotoForm
        photo={{ ...photo, privacy_level: photo.privacy_level as PrivacyLevel }}
        lovedOnes={lovedOnes ?? []}
        allowed={(perms ?? []).map((p) => p.trusted_person_id)}
      />

      {photo.ai_description && (
        <section className="card p-4">
          <p className="eyebrow mb-1">What the AI sees (a guess, not a fact)</p>
          <p className="text-sm text-ink-soft">{photo.ai_description}</p>
        </section>
      )}

      {links?.length ? (
        <section>
          <h2 className="mb-3 text-xl">Memories linked to this photo</h2>
          <ul className="space-y-2">
            {links.map((l, i) => {
              const m = l.memories as unknown as { id: string; title: string; status: string };
              return (
                <li key={i}>
                  <Link href={`/memories/${m.id}`} className="underline">{m.title}</Link> <span className="text-xs text-muted">({m.status})</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
