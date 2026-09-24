"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { reviewMemory } from "@/app/(app)/memories/actions";
import { PRIVACY_LABELS, type PrivacyLevel } from "@/lib/constants";

export type MemoryCardData = {
  id: string;
  type: string;
  title: string;
  content: string;
  occurred_on: string | null;
  status: string;
  privacy_level: PrivacyLevel;
  excerpt?: string | null;
};

const STATUS_LABEL: Record<string, string> = { candidate: "To review", confirmed: "Confirmed", corrected: "Corrected by you", rejected: "Rejected" };

export function MemoryCard({ memory }: { memory: MemoryCardData }) {
  const [status, setStatus] = useState(memory.status);
  const [privacy, setPrivacy] = useState(memory.privacy_level);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function act(action: "confirm" | "reject" | "private" | "restore") {
    setError(null);
    start(async () => {
      const res = await reviewMemory(memory.id, action);
      if (!res.ok) return setError(res.error);
      if (action === "confirm") setStatus(status === "corrected" ? "corrected" : "confirmed");
      if (action === "reject") setStatus("rejected");
      if (action === "restore") setStatus("candidate");
      if (action === "private") {
        setPrivacy("OWNER_ONLY");
        if (status === "candidate") setStatus("confirmed");
      }
    });
  }

  const rejected = status === "rejected";
  return (
    <article className={`card flex flex-col gap-3 ${rejected ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip">{memory.type.replace("_", " ").toLowerCase()}</span>
        <span className={`chip ${status === "candidate" ? "border-glow text-glow" : ""}`}>{STATUS_LABEL[status]}</span>
        <span className="chip">{PRIVACY_LABELS[privacy]}</span>
        {memory.occurred_on && <span className="text-xs text-muted">{memory.occurred_on}</span>}
      </div>
      <h3 className="text-xl">{memory.title}</h3>
      <p className="text-ink-soft">{memory.content}</p>
      {memory.excerpt && <p className="border-l-2 border-line pl-3 text-sm text-muted italic">&ldquo;{memory.excerpt}&rdquo;</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="mt-1 flex flex-wrap gap-2">
        {status === "candidate" && (
          <button className="btn-primary py-1.5" disabled={pending} onClick={() => act("confirm")}>Confirm</button>
        )}
        <Link href={`/memories/${memory.id}`} className="btn-ghost py-1.5">Edit</Link>
        {!rejected && privacy !== "OWNER_ONLY" && (
          <button className="btn-ghost py-1.5" disabled={pending} onClick={() => act("private")}>Make private</button>
        )}
        {!rejected ? (
          <button className="btn-ghost py-1.5 text-danger" disabled={pending} onClick={() => act("reject")}>Reject</button>
        ) : (
          <button className="btn-ghost py-1.5" disabled={pending} onClick={() => act("restore")}>Restore</button>
        )}
      </div>
    </article>
  );
}
