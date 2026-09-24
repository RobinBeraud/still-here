import Link from "next/link";
import { SignupForm } from "../forms";

export const metadata = { title: "Create your Still Here" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="mb-2 text-3xl">Begin your Still Here</h1>
      <p className="mb-8 text-ink-soft">A private place to tell your story, in your own words.</p>
      <SignupForm next={next} />
      <p className="mt-8 text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link className="text-ink underline" href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
          Sign in
        </Link>
      </p>
    </>
  );
}
