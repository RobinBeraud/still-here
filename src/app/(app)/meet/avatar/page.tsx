import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/services/entitlements-repo";
import { PageHeader } from "@/components/ui";
import { AvatarWorkflow } from "./workflow";

export const metadata = { title: "My avatar & voice" };

export default async function AvatarPage() {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, ent] = await Promise.all([
    supabase.from("avatar_profiles").select("status").eq("owner_user_id", user.id).maybeSingle(),
    getEntitlements(user.id),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/meet" className="text-sm text-ink-soft hover:text-ink">← Meet My Still Here</Link>
      <div className="mt-6">
        <PageHeader eyebrow="Avatar & voice" title="Create your avatar">
          Give your Still Here your face and voice, so your loved ones can talk with it face to face.
        </PageHeader>
      </div>
      <AvatarWorkflow status={(profile?.status ?? "none") as never} userId={user.id} canCreate={ent.can_create_avatar} />
    </div>
  );
}
