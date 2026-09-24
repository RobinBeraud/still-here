import { requireUser } from "@/lib/supabase/server";
import { getConsentStatus } from "@/lib/consents";
import { CONSENTS, type ConsentType } from "@/lib/constants";
import { Logo } from "@/components/ui";
import { OnboardingForm } from "./form";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { supabase, user } = await requireUser();
  const [{ data: profile }, status] = await Promise.all([
    supabase.from("profiles").select("first_name, last_name, preferred_name, language").eq("id", user.id).single(),
    getConsentStatus(supabase, user.id),
  ]);

  const consents = (Object.keys(CONSENTS) as ConsentType[]).map((t) => ({
    type: t,
    label: CONSENTS[t].label,
    required: CONSENTS[t].required,
    accepted: status[t].accepted,
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Logo />
      <header className="my-10">
        <p className="eyebrow mb-2">Welcome</p>
        <h1 className="text-4xl">Let&apos;s set up your Still Here</h1>
        <p className="mt-3 text-ink-soft">
          Still Here is private by default. Nothing you say becomes a memory until you confirm it, and you decide who can ever see it.
        </p>
      </header>
      <OnboardingForm profile={profile ?? { first_name: null, last_name: null, preferred_name: null, language: "en" }} consents={consents} next={next} />
    </div>
  );
}
