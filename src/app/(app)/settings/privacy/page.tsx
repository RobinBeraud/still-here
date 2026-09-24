import { requireUser } from "@/lib/supabase/server";
import { DeleteAccount, ExportButton } from "../settings-ui";

export const metadata = { title: "Data & privacy" };

const ACTION_LABELS: Record<string, string> = {
  "sharing.invited": "Invitation sent",
  "sharing.invitation_accepted": "A loved one joined",
  "sharing.revoked": "Access revoked",
  "sharing.removed": "Loved one removed",
  "consent.accepted": "Consent given",
  "consent.revoked": "Consent revoked",
  "account.export": "Data exported",
  "account.deletion_requested": "Deletion requested",
  "account.deletion_cancelled": "Deletion cancelled",
  "avatar.consent_given": "Avatar consent given",
  "avatar.video_uploaded": "Avatar video uploaded",
  "avatar.disabled": "Avatar disabled",
  "billing.plan_activated": "Plan activated",
  "billing.preservation_mode": "Preservation mode",
  "billing.refund": "Refund",
};

export default async function PrivacyPage() {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, { data: logs }] = await Promise.all([
    supabase.from("profiles").select("deletion_scheduled_for").eq("id", user.id).single(),
    supabase.from("audit_logs").select("id, action, created_at").eq("subject_user_id", user.id).order("created_at", { ascending: false }).limit(30),
  ]);

  return (
    <div className="space-y-8">
      <section className="card space-y-3">
        <h2 className="text-xl">Your archive</h2>
        <p className="text-sm text-ink-soft">
          A ZIP with your profile, memories and their sources, people, places, personality, every conversation, photos, audio and a README. Readable without
          Still Here.
        </p>
        <ExportButton />
      </section>

      <section className="card">
        <h2 className="mb-3 text-xl">Recent activity</h2>
        {logs?.length ? (
          <ul className="divide-y divide-line text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex justify-between py-2">
                <span>{ACTION_LABELS[l.action] ?? l.action}</span>
                <span className="text-muted">{new Date(l.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing yet.</p>
        )}
      </section>

      <section className="card space-y-3 border-danger/30">
        <h2 className="text-xl text-danger">Delete my Still Here</h2>
        <DeleteAccount scheduledFor={profile?.deletion_scheduled_for ?? null} />
      </section>
    </div>
  );
}
