import { requireUser } from "@/lib/supabase/server";
import { getConsentStatus } from "@/lib/consents";
import { CONSENTS, type ConsentType } from "@/lib/constants";
import { ConsentToggle, ProfileForm } from "./settings-ui";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, consents] = await Promise.all([
    supabase.from("profiles").select("first_name, last_name, preferred_name, language").eq("id", user.id).single(),
    getConsentStatus(supabase, user.id),
  ]);

  return (
    <div className="space-y-8">
      <ProfileForm profile={profile ?? { first_name: null, last_name: null, preferred_name: null, language: "en" }} />
      <section className="card">
        <h2 className="text-xl">Consents</h2>
        <p className="mt-1 text-sm text-ink-soft">Each consent is versioned and dated. Revoking an optional consent stops the related processing.</p>
        <div className="mt-2">
          {(Object.keys(CONSENTS) as ConsentType[]).map((t) => (
            <ConsentToggle
              key={t}
              type={t}
              label={CONSENTS[t].label}
              required={CONSENTS[t].required}
              accepted={consents[t].accepted}
              acceptedAt={consents[t].acceptedAt}
            />
          ))}
        </div>
      </section>
      <section className="card text-sm text-ink-soft">
        <p>Signed in as {user.email}</p>
      </section>
    </div>
  );
}
