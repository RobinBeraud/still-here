"use client";
import { useActionState, useState, useTransition } from "react";
import { confirmTrait, removeTrait, saveTrait } from "../actions";
import { SubmitButton } from "@/components/submit-button";

export function TraitRow({
  trait,
  label,
  current,
}: {
  trait: string;
  label: string;
  current: { value: string; confirmed_by_user: boolean } | null;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(saveTrait, undefined);
  const [pending, start] = useTransition();

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1">
          <p className="eyebrow mb-1">{label}</p>
          {current ? <p>{current.value}</p> : <p className="text-muted">Not known yet.</p>}
          {current && !current.confirmed_by_user && <p className="mt-1 text-xs text-glow">Suggested by AI, not confirmed</p>}
        </div>
        <div className="flex gap-2">
          {current && !current.confirmed_by_user && (
            <button className="btn-primary py-1.5" disabled={pending} onClick={() => start(() => confirmTrait(trait))}>Confirm</button>
          )}
          <button className="btn-ghost py-1.5" onClick={() => setEditing((e) => !e)}>{current ? "Edit" : "Describe"}</button>
          {current && (
            <button className="btn-ghost py-1.5 text-danger" disabled={pending} onClick={() => start(() => removeTrait(trait))}>Remove</button>
          )}
        </div>
      </div>
      {(editing || (state && !state.ok)) && (
        <form action={action} className="mt-4 flex gap-2">
          <input type="hidden" name="trait" value={trait} />
          <input className="input" name="value" defaultValue={current?.value ?? ""} required />
          <SubmitButton>Save</SubmitButton>
        </form>
      )}
      {state && !state.ok && <p className="mt-2 text-sm text-danger">{state.error}</p>}
    </div>
  );
}
