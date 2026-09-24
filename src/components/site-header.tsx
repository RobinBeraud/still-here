import Link from "next/link";
import { Logo } from "./ui";
import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
      <Logo />
      <nav className="flex items-center gap-2 text-sm sm:gap-4">
        <Link href="/pricing" className="hidden text-ink-soft hover:text-ink sm:inline">Pricing</Link>
        {user ? (
          <Link href="/dashboard" className="btn-primary">Open Still Here</Link>
        ) : (
          <>
            <Link href="/login" className="text-ink-soft hover:text-ink">Sign in</Link>
            <Link href="/signup" className="btn-primary">Begin</Link>
          </>
        )}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-24 w-full max-w-6xl border-t border-line px-4 py-10 text-sm text-muted sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row">
        <p>Your stories. Your voice. Still here.</p>
        <div className="flex gap-5">
          <Link href="/pricing">Pricing</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/terms">Terms</Link>
        </div>
      </div>
    </footer>
  );
}
