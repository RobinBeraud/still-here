"use client";
import { useActionState, useState, useTransition } from "react";
import { deleteAccount, exportData, setConsent, undoDeletion, updateProfile } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Notice } from "@/components/ui";
import { LANGUAGES, type ConsentType } from "@/lib/constants";

export function ProfileForm({ profile }: { profile: { first_name: string | null; last_name: string | null; preferred_name: string | null; language: string } }) {
  const [state, action] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="card space-y-4">
      <h2 className="text-xl">Profile</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="first_name">First name</label>
          <input className="input" id="first_name" name="first_name" defaultValue={profile.first_name ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="last_name">Last name</label>
          <input className="input" id="last_name" name="last_name" defaultValue={profile.last_name ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="preferred_name">Preferred name</label>
          <input className="input" id="preferred_name" name="preferred_name" defaultValue={profile.preferred_name ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="language">Language</label>
          <select className="input" id="language" name="language" defaultValue={profile.language}>
            {LANGUAGES.map(([c, l]) => (
              <option key={c} value={c}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm text-ok">Saved.</p>}
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}

export function ConsentToggle({ type, label, required, accepted, acceptedAt }: { type: ConsentType; label: string; required: boolean; accepted: boolean; acceptedAt: string | null }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-4 last:border-0">
      <div className="text-sm">
        <p>{label}</p>
        <p className="mt-1 text-xs text-muted">
          {accepted ? `Accepted on ${new Date(acceptedAt!).toLocaleDateString()}` : "Not accepted"}
          {required && " · required to use Still Here"}
        </p>
      </div>
      {!required && (
        <button className="btn-ghost shrink-0 py-1.5" disabled={pending} onClick={() => start(() => setConsent(type, !accepted))}>
          {accepted ? "Revoke" : "Accept"}
        </button>
      )}
    </div>
  );
}

export function ExportButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ url?: string; error?: string } | null>(null);
  return (
    <div className="space-y-3">
      <button
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await exportData();
            setResult(res.ok ? { url: res.url } : { error: res.error });
          })
        }
      >
        {pending ? "Preparing your archive…" : "Download everything Still Here knows about me"}
      </button>
      {result?.url && (
        <Notice tone="ok">
          Your archive is ready. <a href={result.url} className="underline">Download it</a> (link valid for one hour).
        </Notice>
      )}
      {result?.error && <Notice tone="danger">{result.error}</Notice>}
    </div>
  );
}

export function DeleteAccount({ scheduledFor }: { scheduledFor: string | null }) {
  const [state, action] = useActionState(deleteAccount, undefined);
  const [pending, start] = useTransition();
  if (scheduledFor) {
    return (
      <div className="space-y-3">
        <Notice tone="danger">Your Still Here will be permanently deleted on {new Date(scheduledFor).toLocaleString()}.</Notice>
        <button className="btn-ghost" disabled={pending} onClick={() => start(() => undoDeletion())}>Cancel deletion</button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-ink-soft">
        Your memories, conversations, photos, avatar and loved ones&apos; access will be permanently deleted after a 7-day cancellation window. Download your
        archive first if you want to keep a copy.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="password">Your password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Type DELETE to confirm</label>
          <input className="input" id="confirm" name="confirm" autoComplete="off" />
        </div>
      </div>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      <SubmitButton className="btn-danger">Delete my Still Here</SubmitButton>
    </form>
  );
}
