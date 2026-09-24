import { ForgotForm } from "../forms";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-2 text-3xl">Reset your password</h1>
      <p className="mb-8 text-ink-soft">We&apos;ll email you a secure link.</p>
      <ForgotForm />
    </>
  );
}
