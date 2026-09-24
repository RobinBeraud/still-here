"use client";
import { useActionState, useEffect, useState } from "react";
import { completeOnboarding } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Notice } from "@/components/ui";
import { LANGUAGES } from "@/lib/constants";

type ConsentDef = { type: string; label: string; required: boolean; accepted: boolean };


export function OnboardingForm({
  profile,
  consents,
  next,
}: {
  profile: { first_name: string | null; last_name: string | null; preferred_name: string | null; language: string };
  consents: ConsentDef[];
  next?: string;
}) {
  const [state, action] = useActionState(completeOnboarding, undefined);
  const [tz, setTz] = useState("UTC");
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"), []);

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="timezone" value={tz} />
      <input type="hidden" name="next" value={next ?? ""} />
      <section className="card space-y-4">
        <h2 className="text-xl">About you</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="first_name">First name</label>
            <input className="input" id="first_name" name="first_name" defaultValue={profile.first_name ?? ""} required />
          </div>
          <div>
            <label className="label" htmlFor="last_name">Last name</label>
            <input className="input" id="last_name" name="last_name" defaultValue={profile.last_name ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="preferred_name">What should we call you?</label>
            <input className="input" id="preferred_name" name="preferred_name" defaultValue={profile.preferred_name ?? ""} placeholder="e.g. Robin, Grandpa Joe" />
          </div>
          <div>
            <label className="label" htmlFor="language">Language</label>
            <select className="input" id="language" name="language" defaultValue={profile.language}>
              {LANGUAGES.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="text-xl">Your agreements</h2>
          <p className="mt-1 text-sm text-ink-soft">You can revoke optional agreements at any time in Settings.</p>
        </div>
        {consents.map((c) => (
          <label key={c.type} className="flex gap-3 text-sm">
            <input type="checkbox" name={`consent_${c.type}`} defaultChecked={c.accepted} className="mt-1 h-4 w-4 accent-[var(--glow)]" />
            <span>
              {c.label} {c.required ? <span className="text-muted">(required)</span> : <span className="text-muted">(optional)</span>}
            </span>
          </label>
        ))}
      </section>

      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <SubmitButton className="btn-primary w-full sm:w-auto">Continue</SubmitButton>
    </form>
  );
}
