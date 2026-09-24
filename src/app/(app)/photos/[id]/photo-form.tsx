"use client";
import { useActionState, useState, useTransition } from "react";
import { deletePhoto, updatePhoto } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { PRIVACY_LABELS, PRIVACY_LEVELS, type PrivacyLevel } from "@/lib/constants";

export function PhotoForm({
  photo,
  lovedOnes,
  allowed,
}: {
  photo: { id: string; owner_story: string | null; taken_on: string | null; location: string | null; privacy_level: PrivacyLevel };
  lovedOnes: { id: string; name: string }[];
  allowed: string[];
}) {
  const [state, action] = useActionState(updatePhoto.bind(null, photo.id), undefined);
  const [privacy, setPrivacy] = useState<PrivacyLevel>(photo.privacy_level);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  return (
    <form action={action} className="card space-y-4">
      <div>
        <label className="label" htmlFor="owner_story">The story, in your words</label>
        <textarea className="input" id="owner_story" name="owner_story" rows={5} defaultValue={photo.owner_story ?? ""} placeholder="Who is there? What was happening? Why does it matter?" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="taken_on">When</label>
          <input className="input" id="taken_on" name="taken_on" defaultValue={photo.taken_on ?? ""} placeholder="e.g. Christmas 1994" />
        </div>
        <div>
          <label className="label" htmlFor="location">Where</label>
          <input className="input" id="location" name="location" defaultValue={photo.location ?? ""} />
        </div>
      </div>
      <fieldset>
        <legend className="label">Who can see this photo</legend>
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
      {state?.ok && <p className="text-sm text-ok">Saved.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubmitButton>Save</SubmitButton>
        {confirmDelete ? (
          <span className="flex items-center gap-2 text-sm">
            Delete this photo permanently?
            <button type="button" className="btn-danger py-1.5" disabled={pending} onClick={() => start(() => deletePhoto(photo.id))}>Delete</button>
            <button type="button" className="btn-ghost py-1.5" onClick={() => setConfirmDelete(false)}>Keep</button>
          </span>
        ) : (
          <button type="button" className="text-sm text-danger" onClick={() => setConfirmDelete(true)}>Delete photo</button>
        )}
      </div>
    </form>
  );
}
