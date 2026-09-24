"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

export type AuthState = { error?: string; message?: string } | undefined;

/** Empêche les redirections ouvertes : uniquement des chemins relatifs internes. */
function safeNext(value: FormDataEntryValue | null, fallback = "/dashboard") {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : fallback;
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  });
  if (error) return { error: "Email or password is incorrect, or your email is not verified yet." };
  redirect(safeNext(form.get("next")));
}

export async function sendMagicLink(_: AuthState, form: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const next = safeNext(form.get("next"));
  const { error } = await supabase.auth.signInWithOtp({
    email: String(form.get("email") ?? "").trim(),
    options: { shouldCreateUser: false, emailRedirectTo: `${publicEnv.appUrl}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: "We couldn't send a link to this address." };
  return { message: "Check your inbox: we sent you a sign-in link." };
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 10) return { error: "Please choose a password of at least 10 characters." };
  const supabase = await createClient();
  const next = safeNext(form.get("next"), "/onboarding");
  const { error } = await supabase.auth.signUp({
    email: String(form.get("email") ?? "").trim(),
    password,
    options: {
      data: { first_name: String(form.get("first_name") ?? "").trim() },
      emailRedirectTo: `${publicEnv.appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: error.message };
  return { message: "Almost there: please confirm your email address using the link we just sent you." };
}

export async function requestPasswordReset(_: AuthState, form: FormData): Promise<AuthState> {
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(String(form.get("email") ?? "").trim(), {
    redirectTo: `${publicEnv.appUrl}/auth/callback?next=/reset-password`,
  });
  return { message: "If an account exists for this address, you will receive a reset link." };
}

export async function updatePassword(_: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 10) return { error: "Please choose a password of at least 10 characters." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect("/dashboard");
}
