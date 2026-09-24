"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { disableAvatar, giveAvatarConsent, registerTrainingVideo } from "./actions";

type Status = "none" | "draft" | "consented" | "video_uploaded" | "processing" | "ready" | "failed" | "disabled";

const STEPS = ["Consent", "Record", "Processing", "Ready"];

export function AvatarWorkflow({ status, userId, canCreate }: { status: Status; userId: string; canCreate: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const step = status === "ready" ? 3 : status === "processing" || status === "video_uploaded" ? 2 : status === "consented" ? 1 : 0;

  if (!canCreate && status !== "ready") {
    return (
      <div className="card text-center">
        <p className="font-serif text-xl">Your personal avatar is part of the Still Here plans.</p>
        <Link href="/pricing" className="btn-primary mt-4">See plans</Link>
      </div>
    );
  }

  async function upload(f: File | undefined) {
    if (!f) return;
    setError(null);
    setUploading("Uploading your video…");
    const ext = f.name.split(".").pop()?.toLowerCase() || "mp4";
    const path = `${userId}/training-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await createClient().storage.from("avatar-training").upload(path, f, { contentType: f.type || "video/mp4" });
    if (upErr) {
      setUploading(null);
      return setError(upErr.message);
    }
    const res = await registerTrainingVideo(path);
    setUploading(null);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <ol className="flex gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex-1 rounded-full px-3 py-1.5 text-center ${i <= step ? "bg-accent text-accent-ink" : "bg-paper-2 text-muted"}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {(status === "none" || status === "draft" || status === "disabled" || status === "failed") && (
        <section className="card space-y-4">
          <h2 className="text-2xl">Your likeness, your consent</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
            <li>We create a video avatar and a synthetic voice from a short recording of you.</li>
            <li>They are only used for your Still Here, by you and the loved ones you choose. Never for advertising.</li>
            <li>Your avatar always presents itself as an AI representation, never as you.</li>
            <li>The avatar is produced by our provider LiveAvatar (HeyGen). Your memories stay with Still Here.</li>
            <li>You can disable your avatar and delete the source video at any time.</li>
          </ul>
          {status === "failed" && <p className="text-sm text-danger">The last attempt failed. Please record a new video.</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await giveAvatarConsent();
                if (!res.ok) setError(res.error);
                else router.refresh();
              })
            }
          >
            I agree to the creation of my avatar and voice
          </button>
        </section>
      )}

      {status === "consented" && (
        <section className="card space-y-4">
          <h2 className="text-2xl">Record a 2-minute video</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
            <li>Face the camera, head and shoulders visible, in a quiet and well-lit room.</li>
            <li>Speak naturally for about two minutes: tell a story you like, as you would to a friend.</li>
            <li>Pause with your mouth closed for a few seconds at the start and at the end.</li>
            <li>MP4, MOV or WEBM, up to 500 MB.</li>
          </ul>
          <input ref={file} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button className="btn-primary" disabled={Boolean(uploading)} onClick={() => file.current?.click()}>
            {uploading ?? "Upload my video"}
          </button>
        </section>
      )}

      {(status === "processing" || status === "video_uploaded") && (
        <section className="card">
          <h2 className="text-2xl">We&apos;re creating your avatar</h2>
          <p className="mt-2 text-ink-soft">This usually takes up to 48 hours. We&apos;ll email you when it&apos;s ready. Meanwhile, keep telling your story.</p>
        </section>
      )}

      {status === "ready" && (
        <section className="card space-y-3">
          <h2 className="text-2xl">Your avatar is ready</h2>
          <p className="text-ink-soft">Open Meet My Still Here and choose Video to talk with it face to face.</p>
          <Link href="/meet" className="btn-primary">Meet my Still Here</Link>
        </section>
      )}

      {status !== "none" && status !== "disabled" && (
        <button className="text-sm text-danger" disabled={pending} onClick={() => start(() => disableAvatar())}>
          Disable my avatar and delete my video
        </button>
      )}
    </div>
  );
}
