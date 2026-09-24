import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Notice } from "@/components/ui";

const DOCS: Record<string, { title: string; sections: [string, string][] }> = {
  privacy: {
    title: "Privacy Policy",
    sections: [
      ["Your memories belong to you", "Still Here stores your conversations, memories, photos, audio and the choices you make about them, only to build and operate your Still Here. We never sell them and never use them to train external AI models."],
      ["Processors", "We rely on Supabase (database and storage, EU region), OpenAI (conversation, extraction, transcription, speech), LiveAvatar by HeyGen (video avatar), Resend (email) and Stripe (payments). Each processes only the data needed for its function."],
      ["Loved ones", "Loved ones only see memories you explicitly shared with them, and only after signing in. Their own conversations with your Still Here are private to them."],
      ["Export and deletion", "You can download a complete archive at any time. Account deletion takes effect after a 7-day cancellation window. Encrypted backups containing your data are purged within their retention schedule (up to 12 months)."],
      ["Payments", "Card data is handled by Stripe. Still Here never stores card numbers or security codes. Payment records are kept as required by accounting law."],
    ],
  },
  terms: {
    title: "Terms of Service",
    sections: [
      ["An AI representation", "Your Still Here is an AI representation built from what you share. It is not you, may be wrong, and always says it is an AI."],
      ["Your responsibilities", "Only share content you have the right to share, and be mindful of the privacy of the people in your stories."],
      ["Payments and preservation", "A failed payment never triggers the immediate deletion of your memories. After a grace period, your Still Here switches to Preservation mode, where your data stays readable and exportable."],
    ],
  },
};

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const content = DOCS[doc];
  if (!content) notFound();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="mb-6 text-4xl">{content.title}</h1>
        <Notice tone="warn">Draft summary. The full legal text must be reviewed by counsel before public launch.</Notice>
        <div className="mt-8 space-y-8">
          {content.sections.map(([h, p]) => (
            <section key={h}>
              <h2 className="text-2xl">{h}</h2>
              <p className="mt-2 text-ink-soft">{p}</p>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
