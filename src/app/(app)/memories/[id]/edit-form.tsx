"use client";
import { useActionState, useState } from "react";
import { editMemory } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { MEMORY_TYPES, PRIVACY_LABELS, PRIVACY_LEVELS, type PrivacyLevel } from "@/lib/constants";

export function EditMemoryForm({
  memory,
  lovedOnes,
  allowed,
}: {
  memory: { id: string; type: string; title: string; content: string; occurred_on: string | null; privacy_level: PrivacyLevel; importance: number };
  lovedOnes: { id: string; name: string }[];
  allowed: string[];
}) {
  const [state, action] = useActionState(editMemory.bind(null, memory.id), undefined);
  const [privacy, setPrivacy] = useState<PrivacyLevel>(memory.privacy_level);

  return (
    <form action={action} className="card space-y-4">
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input className="input" id="title" name="title" defaultValue={memory.title} required />
      </div>
      <div>
        <label className="label" htmlFor="content">The memory</label>
        <textarea className="input" id="content" name="content" rows={5} defaultValue={memory.content} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="type">Kind</label>
          <select className="input" id="type" name="type" defaultValue={memory.type}>
            {MEMORY_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace("_", " ").toLowerCase()}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="occurred_on">When</label>
          <input className="input" id="occurred_on" name="occurred_on" defaultValue={memory.occurred_on ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="importance">Importance</label>
          <select className="input" id="importance" name="importance" defaultValue={String(memory.importance)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>
      <fieldset>
        <legend className="label">Who can see this memory</legend>
        <div className="flex flex-wrap gap-2">
          {PRIVACY_LEVELS.map((p) => (
            <label key={p} className={`chip cursor-pointer px-3 py-1.5 text-sm ${privacy === p ? "border-glow text-ink" : ""}`}>
              <input type="radio" name="privacy_level" value={p} checked={privacy === p} onChange={() => setPrivacy(p)} className="sr-only" />
              {PRIVACY_LABELS[p]}
            </label>
          ))}
        </div>
        {privacy === "SPECIFIC_PEOPLE" && (
          <div className="mt-3 space-y-2">
            {lovedOnes.length === 0 && <p className="text-sm text-muted">Add loved ones in People first.</p>}
            {lovedOnes.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="allowed_people" value={p.id} defaultChecked={allowed.includes(p.id)} className="h-4 w-4 accent-[var(--glow)]" />
                {p.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm text-ok">Saved. Your original words are kept unchanged.</p>}
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}
