import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getConsentStatus, missingRequired } from "@/lib/consents";
import { Logo } from "@/components/ui";
import { NavLinks } from "./nav-links";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, consents, { count: sharedCount }, { data: account }] = await Promise.all([
    supabase.from("profiles").select("onboarding_completed_at, deletion_scheduled_for").eq("id", user.id).single(),
    getConsentStatus(supabase, user.id),
    supabase.from("trusted_people").select("id", { count: "exact", head: true }).eq("linked_user_id", user.id).eq("status", "active"),
    supabase.from("billing_accounts").select("billing_state").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!profile?.onboarding_completed_at || missingRequired(consents).length > 0) redirect("/onboarding");

  const links = [
    { href: "/dashboard", label: "Home" },
    { href: "/talk", label: "Talk" },
    { href: "/memories", label: "Memories" },
    { href: "/photos", label: "Photos" },
    { href: "/meet", label: "Meet" },
    { href: "/people", label: "People" },
    ...((sharedCount ?? 0) > 0 ? [{ href: "/shared", label: "Shared with me" }] : []),
    { href: "/settings", label: "Settings" },
  ];
  const state = account?.billing_state;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Logo href="/dashboard" />
          <form action="/auth/signout" method="post">
            <button className="text-sm text-ink-soft hover:text-ink">Sign out</button>
          </form>
        </div>
        <NavLinks links={links} />
      </header>

      {profile.deletion_scheduled_for && (
        <div className="bg-danger/10 px-4 py-2 text-center text-sm text-danger">
          Your Still Here is scheduled for deletion on {new Date(profile.deletion_scheduled_for).toLocaleDateString()}.{" "}
          <Link href="/settings/privacy" className="underline">Cancel deletion</Link>
        </div>
      )}
      {(state === "PAST_DUE" || state === "GRACE_PERIOD") && (
        <div className="bg-warn/10 px-4 py-2 text-center text-sm text-warn">
          We couldn&apos;t process your last payment. Your memories are safe.{" "}
          <Link href="/settings/billing" className="underline">Update payment method</Link>
        </div>
      )}
      {state === "PRESERVATION_ONLY" && (
        <div className="bg-paper-2 px-4 py-2 text-center text-sm text-ink-soft">
          Preservation mode: your memories are safe and exportable. New content and video conversations are paused.{" "}
          <Link href="/pricing" className="underline">Reactivate</Link>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </div>
  );
}
