"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { submitFeedback } from "@/app/(app)/memories/actions";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  answer_basis?: "KNOWN" | "INFERRED" | "UNKNOWN" | null;
  used_memory_ids?: string[];
};

type Mode = "interview" | "self" | "loved_one";
type Channel = "text" | "voice" | "avatar";

type AvatarHandle = { repeat: (t: string) => void; stop: () => Promise<void> };

const BASIS_LABEL = { KNOWN: "From a memory", INFERRED: "Uncertain", UNKNOWN: "No memory" } as const;

export function Conversation({
  sessionId,
  mode,
  initialMessages,
  ownerName,
  avatarAllowed,
  keepAudio = false,
}: {
  sessionId: string;
  mode: Mode;
  initialMessages: ChatMessage[];
  ownerName: string;
  avatarAllowed: boolean;
  keepAudio?: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>("text");
  const [recording, setRecording] = useState(false);
  const [avatarState, setAvatarState] = useState<"off" | "starting" | "on">("off");
  const [extracting, setExtracting] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordStartRef = useRef<number>(0);
  const avatarRef = useRef<AvatarHandle | null>(null);
  const liveSessionRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // ------------------------------------------------------------ output (voice / avatar)
  const speak = useCallback(
    async (msg: ChatMessage) => {
      if (channel === "avatar" && avatarRef.current) {
        avatarRef.current.repeat(msg.content);
        return;
      }
      if (channel !== "voice") return;
      const res = await fetch("/api/voice/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: msg.id }) });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      audioRef.current?.pause();
      audioRef.current = new Audio(url);
      await audioRef.current.play().catch(() => undefined);
    },
    [channel],
  );

  // ------------------------------------------------------------ send
  async function send(text: string, audioPath: string | null = null) {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    const temp: ChatMessage = { id: `tmp-${Date.now()}`, role: "user", content: clean };
    setMessages((m) => [...m, temp]);
    setInput("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, text: clean, audioPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      const assistant: ChatMessage = { ...data.assistant, used_memory_ids: data.usedMemoryIds ?? [] };
      setMessages((m) => [...m.filter((x) => x.id !== temp.id), data.userMessage, assistant]);
      void speak(assistant);
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setInput(clean);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------ microphone
  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const seconds = (Date.now() - recordStartRef.current) / 1000;
        const form = new FormData();
        form.append("audio", new File([blob], "recording", { type: blob.type }));
        form.append("seconds", String(seconds));
        form.append("keep", String(keepAudio));
        setBusy(true);
        try {
          const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setBusy(false);
          if (data.text) await send(data.text, data.audioPath ?? null);
        } catch (e) {
          setError(e instanceof Error ? e.message : "We couldn't hear that. Please try again.");
          setBusy(false);
        }
      };
      recorderRef.current = rec;
      recordStartRef.current = Date.now();
      rec.start();
      setRecording(true);
    } catch {
      setError("Microphone access is needed for voice conversations.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  // ------------------------------------------------------------ avatar
  async function startAvatar() {
    setAvatarState("starting");
    setError(null);
    try {
      const res = await fetch("/api/avatar/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationSessionId: sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      liveSessionRef.current = data.liveSessionId;

      const sdk = await import("@heygen/liveavatar-web-sdk");
      const session = new sdk.LiveAvatarSession(data.sessionToken, { voiceChat: { defaultMuted: true }, autoKeepAlive: true });
      session.on(sdk.SessionEvent.SESSION_STREAM_READY, () => {
        if (videoRef.current) session.attach(videoRef.current);
      });
      session.on(sdk.SessionEvent.SESSION_DISCONNECTED, () => void stopAvatar());
      await session.start();
      avatarRef.current = { repeat: (t) => session.repeat(t), stop: () => session.stop() };
      setAvatarState("on");
      setChannel("avatar");
      const last = [...messages].reverse().find((m) => m.role === "assistant");
      if (last && mode === "interview") session.repeat(last.content);
    } catch (e) {
      setAvatarState("off");
      setChannel("text");
      setError(e instanceof Error ? e.message : "Video conversation unavailable.");
      await endLiveSession();
    }
  }

  const endLiveSession = useCallback(async () => {
    const id = liveSessionRef.current;
    liveSessionRef.current = null;
    if (id) await fetch("/api/avatar/session/end", { method: "POST", body: JSON.stringify({ liveSessionId: id }) }).catch(() => undefined);
  }, []);

  const stopAvatar = useCallback(async () => {
    const a = avatarRef.current;
    avatarRef.current = null;
    await a?.stop().catch(() => undefined);
    await endLiveSession();
    setAvatarState("off");
    setChannel((c) => (c === "avatar" ? "text" : c));
  }, [endLiveSession]);

  useEffect(() => {
    const onUnload = () => {
      if (liveSessionRef.current) navigator.sendBeacon("/api/avatar/session/end", JSON.stringify({ liveSessionId: liveSessionRef.current }));
    };
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      onUnload();
    };
  }, []);

  function chooseChannel(c: Channel) {
    if (c === "avatar") {
      if (avatarState === "off") void startAvatar();
      return;
    }
    if (avatarState !== "off") void stopAvatar();
    setChannel(c);
  }

  // ------------------------------------------------------------ extraction
  async function finishAndReview() {
    setExtracting(true);
    setError(null);
    await stopAvatar();
    const res = await fetch(`/api/sessions/${sessionId}/extract`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "We couldn't analyse this conversation.");
      setExtracting(false);
      return;
    }
    router.push(`/talk/${sessionId}/review`);
  }

  const hasUserMessages = messages.some((m) => m.role === "user");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full bg-paper-2 p-1 text-sm">
          {(["text", "voice", ...(avatarAllowed ? (["avatar"] as const) : [])] as Channel[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => chooseChannel(c)}
              className={`rounded-full px-3.5 py-1.5 ${channel === c ? "bg-card shadow-sm" : "text-ink-soft"}`}
              disabled={c === "avatar" && avatarState === "starting"}
            >
              {c === "text" ? "Text" : c === "voice" ? "Voice" : avatarState === "starting" ? "Connecting…" : "Video"}
            </button>
          ))}
        </div>
        {mode === "interview" && hasUserMessages && (
          <button type="button" onClick={finishAndReview} className="btn-primary" disabled={extracting || busy}>
            {extracting ? "Listening back…" : "Finish & review what I learned"}
          </button>
        )}
      </div>

      {avatarState !== "off" && (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} autoPlay playsInline className="aspect-video w-full object-cover" />
          <button type="button" onClick={() => void stopAvatar()} className="btn-ghost absolute top-3 right-3 py-1.5 text-xs">End video</button>
          {mode !== "interview" && (
            <p className="absolute bottom-2 left-3 rounded bg-black/50 px-2 py-1 text-xs text-white">AI representation of {mode === "self" ? "you" : ownerName}</p>
          )}
        </div>
      )}

      <div className="card min-h-[40vh] space-y-5">
        {messages.length === 0 && <p className="text-center text-ink-soft">Say hello to begin.</p>}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} mode={mode} />
        ))}
        {busy && <p className="animate-pulse text-sm text-muted">…</p>}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-end gap-2"
      >
        <textarea
          className="input min-h-12 flex-1 resize-none"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder={mode === "interview" ? "Tell your story…" : mode === "self" ? "Ask your Still Here…" : `Ask ${ownerName}'s Still Here…`}
          disabled={busy || recording}
        />
        {channel !== "text" && (
          <button
            type="button"
            className={recording ? "btn-danger" : "btn-ghost"}
            onClick={recording ? stopRecording : startRecording}
            disabled={busy && !recording}
          >
            {recording ? "Stop" : "Speak"}
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={busy || !input.trim()}>Send</button>
      </form>
    </div>
  );
}

function MessageBubble({ message, mode }: { message: ChatMessage; mode: Mode }) {
  const [feedback, setFeedback] = useState<"none" | "done" | "correcting">("none");
  const [correction, setCorrection] = useState("");
  const isUser = message.role === "user";
  const canGiveFeedback = mode === "self" && !isUser && !message.id.startsWith("tmp-");

  async function rate(rating: "sounds_like_me" | "not_like_me" | "correction") {
    await submitFeedback(message.id, rating, rating === "correction" ? correction : null);
    setFeedback("done");
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-accent-ink" : ""}`}>
        <p className={`whitespace-pre-wrap ${isUser ? "" : "font-serif text-lg leading-relaxed"}`}>{message.content}</p>
        {!isUser && mode !== "interview" && message.answer_basis && (
          <p className="mt-1 text-xs text-muted">
            {BASIS_LABEL[message.answer_basis]}
            {mode === "self" && message.used_memory_ids && message.used_memory_ids.length > 0 && (
              <>
                {" · "}
                {message.used_memory_ids.map((id, i) => (
                  <Link key={id} href={`/memories/${id}`} className="underline">
                    source {i + 1}
                  </Link>
                )).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ", ", el] : [el]), [])}
              </>
            )}
          </p>
        )}
        {canGiveFeedback && feedback === "none" && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <button type="button" className="chip hover:border-ok" onClick={() => rate("sounds_like_me")}>👍 Sounds like me</button>
            <button type="button" className="chip hover:border-danger" onClick={() => rate("not_like_me")}>👎 Doesn&apos;t sound like me</button>
            <button type="button" className="chip hover:border-glow" onClick={() => setFeedback("correcting")}>✏️ Correct this</button>
          </div>
        )}
        {canGiveFeedback && feedback === "correcting" && (
          <div className="mt-2 space-y-2">
            <textarea className="input text-sm" rows={2} value={correction} onChange={(e) => setCorrection(e.target.value)} placeholder="What would you really say?" />
            <button type="button" className="btn-ghost py-1.5 text-xs" disabled={!correction.trim()} onClick={() => rate("correction")}>
              Save correction
            </button>
          </div>
        )}
        {feedback === "done" && <p className="mt-2 text-xs text-ok">Thank you. Your Still Here will learn from this.</p>}
      </div>
    </div>
  );
}
