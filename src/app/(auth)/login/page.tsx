import Link from "next/link";
import { LoginForm } from "../forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="mb-2 text-3xl">Welcome back</h1>
      <p className="mb-8 text-ink-soft">Your stories are waiting for you.</p>
      {error && <p className="mb-4 text-sm text-danger">This link is invalid or has expired. Please try again.</p>}
      <LoginForm next={next} />
      <p className="mt-8 text-center text-sm text-ink-soft">
        New here?{" "}
        <Link className="text-ink underline" href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
          Create your Still Here
        </Link>
      </p>
    </>
  );
}
