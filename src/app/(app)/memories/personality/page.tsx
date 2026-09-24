import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { PERSONALITY_TRAITS } from "@/lib/constants";
import { PageHeader } from "@/components/ui";
import { TraitRow } from "./trait-row";

export const metadata = { title: "How I speak" };

const TRAIT_LABELS: Record<string, string> = {
  humour: "Humour",
  verbosity: "How much I talk",
  formality: "Formality",
  optimism: "Outlook",
  directness: "Directness",
  emotional_style: "How I show emotions",
  language_style: "Way of speaking",
  favorite_expressions: "Expressions I use",
  topics_loved: "Topics I love",
  topics_avoided: "Topics I avoid",
};

export default async function PersonalityPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("personality_traits").select("trait, value, confidence, confirmed_by_user").eq("owner_user_id", user.id);
  const byTrait = new Map((data ?? []).map((t) => [t.trait, t]));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/memories" className="text-sm text-ink-soft hover:text-ink">← My Memories</Link>
      <div className="mt-6">
        <PageHeader eyebrow="Personality" title="How you speak">
          This only describes your communication style, never a psychological assessment. Loved ones&apos; conversations only use the traits you confirm.
        </PageHeader>
      </div>
      <div className="space-y-3">
        {PERSONALITY_TRAITS.map((t) => (
          <TraitRow key={t} trait={t} label={TRAIT_LABELS[t]} current={byTrait.get(t) ?? null} />
        ))}
      </div>
    </div>
  );
}
