import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { startInterview } from "../actions";

export const metadata = { title: "New conversation" };

export default async function NewTalkPage({ searchParams }: { searchParams: Promise<{ prompt?: string }> }) {
  const { prompt } = await searchParams;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="New conversation" title={prompt ? "Today's question" : "Ready when you are"}>
        {prompt ? <span className="font-serif text-2xl text-ink">{prompt}</span> : "Your interviewer will ask one question at a time. Answer by text or voice, and take all the time you need."}
      </PageHeader>
      <form action={startInterview}>
        <input type="hidden" name="prompt" value={prompt ?? ""} />
        <SubmitButton pendingLabel="Preparing your interviewer…">Begin</SubmitButton>
      </form>
    </div>
  );
}
