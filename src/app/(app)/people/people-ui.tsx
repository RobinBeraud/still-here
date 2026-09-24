"use client";
import { useActionState, useTransition } from "react";
import { invite, removePerson, resendInvite, revokeAccess } from "./actions";
import { SubmitButton } from "@/components/submit-button";

export function InviteForm({ disabled }: { disabled: boolean }) {
  const [state, action] = useActionState(invite, undefined);
  return (
    <form action={action} className="card space-y-4">
      <h2 className="text-xl">Invite a loved one</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input className="input" id="name" name="name" required disabled={disabled} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required disabled={disabled} />
        </div>
        <div>
          <label className="label" htmlFor="relationship">Relationship</label>
          <input className="input" id="relationship" name="relationship" placeholder="e.g. daughter" disabled={disabled} />
        </div>
      </div>
      <p className="text-xs text-muted">
        They will need to sign in with this email. They will only see memories you share with all loved ones or with them specifically.
      </p>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm text-ok">Invitation sent.</p>}
      <SubmitButton>Send invitation</SubmitButton>
    </form>
  );
}

export function PersonActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {(status === "invited" || status === "pending") && (
        <button className="btn-ghost py-1.5" disabled={pending} onClick={() => start(() => resendInvite(id))}>Resend</button>
      )}
      {status !== "revoked" && (
        <button className="btn-ghost py-1.5 text-danger" disabled={pending} onClick={() => start(() => revokeAccess(id))}>Revoke access</button>
      )}
      {status === "revoked" && (
        <button className="btn-ghost py-1.5" disabled={pending} onClick={() => start(() => removePerson(id))}>Remove</button>
      )}
    </div>
  );
}
