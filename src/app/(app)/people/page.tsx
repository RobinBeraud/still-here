import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/services/entitlements-repo";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { InviteForm, PersonActions } from "./people-ui";

export const metadata = { title: "My People" };

const STATUS: Record<string, string> = { pending: "Not invited", invited: "Invited", active: "Has access", revoked: "Access revoked" };

export default async function PeoplePage() {
  const { supabase, user } = await requireUser();
  const [{ data: people }, ent, { count: shared }] = await Promise.all([
    supabase.from("trusted_people").select("id, name, email, relationship, status, created_at").eq("owner_user_id", user.id).order("created_at"),
    getEntitlements(user.id),
    supabase.from("memories").select("id", { count: "exact", head: true }).eq("owner_user_id", user.id).in("status", ["confirmed", "corrected"]).neq("privacy_level", "OWNER_ONLY"),
  ]);
  const activeCount = (people ?? []).filter((p) => p.status !== "revoked").length;
  const atLimit = activeCount >= ent.max_loved_ones;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader eyebrow="My People" title="Who can explore your Still Here">
        Loved ones can talk with your Still Here once they sign in. Right now, {shared ?? 0} of your memories are shared. Private memories are never used in
        their conversations.
      </PageHeader>

      {ent.max_loved_ones === 0 ? (
        <Notice>
          Sharing with loved ones is part of the paid plans. <Link className="underline" href="/pricing">See plans</Link>
        </Notice>
      ) : (
        <>
          {atLimit && <Notice tone="warn">You have reached the {ent.max_loved_ones} loved one(s) included in your plan.</Notice>}
          <InviteForm disabled={atLimit} />
        </>
      )}

      {people?.length ? (
        <ul className="space-y-3">
          {people.map((p) => (
            <li key={p.id} className="card flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="font-medium">
                  {p.name} {p.relationship && <span className="text-ink-soft">· {p.relationship}</span>}
                </p>
                <p className="text-sm text-muted">{p.email}</p>
                <span className="chip mt-2">{STATUS[p.status]}</span>
              </div>
              <PersonActions id={p.id} status={p.status} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No loved one yet">Who would you like to hear your stories one day?</EmptyState>
      )}
    </div>
  );
}
