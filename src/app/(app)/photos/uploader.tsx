"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { registerPhoto } from "./actions";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

export function PhotoUploader({ userId }: { userId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const supabase = createClient();
    let lastId: string | null = null;
    for (const [i, file] of [...files].entries()) {
      setStatus(`Adding ${i + 1} of ${files.length}…`);
      const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const type = file.type || (ext === "heic" ? "image/heic" : "image/jpeg");
      const { error: upErr } = await supabase.storage.from("media").upload(path, file, { contentType: type });
      if (upErr) {
        setError(`${file.name}: ${upErr.message}`);
        continue;
      }
      const res = await registerPhoto({ path, filename: file.name.slice(0, 255), mime: type, size: file.size });
      if (!res.ok) setError(`${file.name}: ${res.error}`);
      else lastId = res.id;
    }
    setStatus(null);
    if (input.current) input.current.value = "";
    if (files.length === 1 && lastId) router.push(`/photos/${lastId}`);
    else router.refresh();
  }

  return (
    <div className="card mb-8 border-dashed text-center">
      <p className="font-serif text-xl">Add photos</p>
      <p className="mt-1 text-sm text-ink-soft">JPG, PNG, WEBP or HEIC, up to 25 MB each. Stored privately.</p>
      <input ref={input} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      <button type="button" className="btn-primary mt-4" disabled={Boolean(status)} onClick={() => input.current?.click()}>
        {status ?? "Choose photos"}
      </button>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
