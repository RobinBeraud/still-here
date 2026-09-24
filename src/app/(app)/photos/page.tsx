import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getConsentStatus } from "@/lib/consents";
import { SIGNED_MEDIA_TTL_SECONDS } from "@/lib/constants";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { PhotoUploader } from "./uploader";

export const metadata = { title: "My Photos" };

export default async function PhotosPage() {
  const { supabase, user } = await requireUser();
  const [{ data: photos }, consents] = await Promise.all([
    supabase.from("media_assets").select("id, path, bucket, filename, owner_story, taken_on").eq("owner_user_id", user.id).order("created_at", { ascending: false }).limit(200),
    getConsentStatus(supabase, user.id),
  ]);

  const paths = (photos ?? []).map((p) => p.path);
  const { data: signed } = paths.length ? await supabase.storage.from("media").createSignedUrls(paths, SIGNED_MEDIA_TTL_SECONDS) : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <>
      <PageHeader eyebrow="My Photos" title="The stories behind your pictures">
        Add a photo, then tell Still Here what was happening. Your own words always come first; the AI&apos;s description is only a guess.
      </PageHeader>
      {consents.media.accepted ? (
        <PhotoUploader userId={user.id} />
      ) : (
        <div className="mb-8">
          <Notice tone="warn">
            To add photos, please accept photo storage in <Link href="/settings" className="underline">Settings</Link>.
          </Notice>
        </div>
      )}
      {photos?.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((p) => (
            <Link key={p.id} href={`/photos/${p.id}`} className="group relative overflow-hidden rounded-2xl border border-line bg-paper-2">
              {urlByPath.get(p.path) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urlByPath.get(p.path)!} alt={p.filename} className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" />
              )}
              <span className={`absolute bottom-2 left-2 chip ${p.owner_story ? "" : "border-glow text-glow"}`}>{p.owner_story ? "Story told" : "Tell its story"}</span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="No photo yet">Start with the photo you would save first.</EmptyState>
      )}
    </>
  );
}
