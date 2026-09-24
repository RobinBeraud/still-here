"use client";
import { useActionState, useState } from "react";
import { createMemory } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { MEMORY_TYPES, PRIVACY_LABELS, PRIVACY_LEVELS } from "@/lib/constants";

export function NewMemoryForm() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createMemory, undefined);
  if (!open) {
    return (
      <button type="button" className="btn-ghost mb-6" onClick={() => setOpen(true)}>
        + Write a memory yourself
      </button>
    );
  }
  return (
    <form action={action} className="card mb-8 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="title">Title</label>
          <input className="input" id="title" name="title" required />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="content">The memory</label>
          <textarea className="input" id="content" name="content" rows={4} required />
        </div>
        <div>
          <label className="label" htmlFor="type">Kind</label>
          <select className="input" id="type" name="type" defaultValue="MEMORY">
            {MEMORY_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace("_", " ").toLowerCase()}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="occurred_on">When</label>
          <input className="input" id="occurred_on" name="occurred_on" placeholder="e.g. summer 1987" />
        </div>
        <div>
          <label className="label" htmlFor="privacy_level">Who can see it</label>
          <select className="input" id="privacy_level" name="privacy_level" defaultValue="OWNER_ONLY">
            {PRIVACY_LEVELS.filter((p) => p !== "SPECIFIC_PEOPLE").map((p) => (
              <option key={p} value={p}>{PRIVACY_LABELS[p]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="importance">Importance</label>
          <select className="input" id="importance" name="importance" defaultValue="3">
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm text-ok">Saved.</p>}
      <div className="flex gap-2">
        <SubmitButton>Save memory</SubmitButton>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Close</button>
      </div>
    </form>
  );
}
