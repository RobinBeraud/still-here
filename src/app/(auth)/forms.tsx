"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { requestPasswordReset, sendMagicLink, signIn, signUp, updatePassword, type AuthState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Notice } from "@/components/ui";

function Feedback({ state }: { state: AuthState }) {
  if (state?.error) return <Notice tone="danger">{state.error}</Notice>;
  if (state?.message) return <Notice tone="ok">{state.message}</Notice>;
  return null;
}

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [pwState, pwAction] = useActionState(signIn, undefined);
  const [mlState, mlAction] = useActionState(sendMagicLink, undefined);

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-full bg-paper-2 p-1 text-sm">
        {(["password", "magic"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-full px-3 py-1.5 ${mode === m ? "bg-card shadow-sm" : "text-ink-soft"}`}
          >
            {m === "password" ? "Password" : "Email me a link"}
          </button>
        ))}
      </div>
      {mode === "password" ? (
        <form action={pwAction} className="space-y-4">
          <input type="hidden" name="next" value={next ?? ""} />
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <Feedback state={pwState} />
          <SubmitButton className="btn-primary w-full">Sign in</SubmitButton>
          <p className="text-center text-sm">
            <Link className="text-ink-soft underline" href="/forgot-password">Forgot your password?</Link>
          </p>
        </form>
      ) : (
        <form action={mlAction} className="space-y-4">
          <input type="hidden" name="next" value={next ?? ""} />
          <div>
            <label className="label" htmlFor="ml-email">Email</label>
            <input className="input" id="ml-email" name="email" type="email" autoComplete="email" required />
          </div>
          <Feedback state={mlState} />
          <SubmitButton className="btn-primary w-full">Send me a sign-in link</SubmitButton>
        </form>
      )}
    </div>
  );
}

export function SignupForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signUp, undefined);
  if (state?.message) return <Notice tone="ok">{state.message}</Notice>;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label className="label" htmlFor="first_name">First name</label>
        <input className="input" id="first_name" name="first_name" autoComplete="given-name" required />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        <p className="mt-1 text-xs text-muted">At least 10 characters.</p>
      </div>
      <Feedback state={state} />
      <SubmitButton className="btn-primary w-full">Create my Still Here</SubmitButton>
    </form>
  );
}

export function ForgotForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" required />
      </div>
      <Feedback state={state} />
      <SubmitButton className="btn-primary w-full">Send reset link</SubmitButton>
    </form>
  );
}

export function ResetForm() {
  const [state, action] = useActionState(updatePassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">New password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <Feedback state={state} />
      <SubmitButton className="btn-primary w-full">Save new password</SubmitButton>
    </form>
  );
}
