import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acceptInvitation, checkInvitation } from "@/lib/services/sharing";
import { Logo, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Invitation" };

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const check = await checkInvitation(token);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const here = `/invite/${token}`;

  async function accept() {
    "use server";
    const sb = await createClient();
    const { data: { user: u } } = await sb.auth.getUser();
    if (!u) redirect(`/login?next=${encodeURIComponent(here)}`);
    let ownerId: string;
    try {
      ownerId = await acceptInvitation(token, { id: u.id, email: u.email });
    } catch (e) {
      redirect(`${here}?error=${encodeURIComponent(e instanceof Error ? e.message : "error")}`);
    }
    redirect(`/shared/${ownerId}`);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-8">
      <Logo />
      <main className="flex flex-1 flex-col justify-center py-10">
        {!check.ok ? (
          <>
            <h1 className="text-3xl">This invitation is no longer valid</h1>
            <p className="mt-3 text-ink-soft">
              {check.reason === "expired" ? "It has expired." : check.reason === "used" ? "It has already been used." : "It may have been cancelled."} Please ask
              for a new one.
            </p>
          </>
        ) : (
          <>
            <p className="eyebrow mb-3">An invitation</p>
            <h1 className="text-4xl">{check.ownerName} would like to share their Still Here with you</h1>
            <p className="mt-4 text-ink-soft">
              You&apos;ll be able to talk with an AI representation built only from the stories and memories {check.ownerName} chose to share with you. It is
              not {check.ownerName}, and it will always tell you so.
            </p>
            {error && <div className="mt-6"><Notice tone="danger">{error}</Notice></div>}
            <div className="mt-8">
              {user ? (
                <form action={accept}>
                  <SubmitButton>Accept the invitation</SubmitButton>
                </form>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <Link href={`/signup?next=${encodeURIComponent(here)}`} className="btn-primary">Create an account</Link>
                  <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn-ghost">I already have an account</Link>
                </div>
              )}
              <p className="mt-4 text-xs text-muted">Use the address this invitation was sent to: {check.email.replace(/(.{2}).*(@.*)/, "$1…$2")}</p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
