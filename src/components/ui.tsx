import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent">
        <span className="h-3.5 w-3.5 rounded-full border-2 border-accent-ink" />
      </span>
      <span className="font-serif text-xl">Still Here</span>
    </Link>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="mb-8">
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h1 className="text-3xl sm:text-4xl">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-ink-soft">{children}</div>}
    </header>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "ok" | "warn" | "danger"; children: React.ReactNode }) {
  const tones = {
    info: "border-line bg-paper-2 text-ink-soft",
    ok: "border-ok/30 bg-ok/10 text-ok",
    warn: "border-warn/30 bg-warn/10 text-warn",
    danger: "border-danger/30 bg-danger/10 text-danger",
  };
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-2">
      <div className="h-full rounded-full bg-glow transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card text-center">
      <p className="font-serif text-xl">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

export function AiDisclosure({ name }: { name: string }) {
  return (
    <p className="text-xs text-muted">
      You are talking with an AI representation built from what {name} chose to share. It is not {name} and may be wrong.
    </p>
  );
}
