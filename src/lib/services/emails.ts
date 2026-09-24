import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { providers } from "@/lib/providers";
import { publicEnv } from "@/lib/env";
import { recordUsage } from "./usage";
import type { BillingNotice } from "./billing";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, paragraphs: string[], cta?: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p)}</p>`).join("");
  const button = cta
    ? `<p style="margin:24px 0"><a href="${cta.url}" style="background:#3b2f2a;color:#fbf7f2;padding:12px 22px;border-radius:999px;text-decoration:none;display:inline-block">${escapeHtml(cta.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#fbf7f2;font-family:Georgia,serif;color:#2b2320">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <p style="font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#8a7466;margin:0 0 24px">Still Here</p>
    <h1 style="font-weight:normal;font-size:26px;margin:0 0 20px">${escapeHtml(title)}</h1>
    ${body}${button}
    <p style="font-size:12px;color:#8a7466;margin-top:40px">Your stories. Your voice. Still here.</p>
  </div></body></html>`;
  const text = [title, "", ...paragraphs, ...(cta ? ["", `${cta.label}: ${cta.url}`] : [])].join("\n");
  return { html, text };
}

export async function sendEmail(to: string, subject: string, paragraphs: string[], cta?: { label: string; url: string }, userId: string | null = null) {
  const { html, text } = layout(subject, paragraphs, cta);
  await providers.email().send({ to, subject, html, text });
  await recordUsage(userId, [{ metric: "emails", quantity: 1, provider: providers.email().name }]);
}

async function emailOf(userId: string) {
  const { data } = await createAdminClient().auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

export async function sendInvitationEmail(opts: { to: string; inviteeName: string; ownerName: string; url: string; ownerId: string }) {
  await sendEmail(
    opts.to,
    `${opts.ownerName} invited you to their Still Here`,
    [
      `Hello ${opts.inviteeName},`,
      `${opts.ownerName} has been preserving their stories, memories and voice with Still Here, and would like you to be one of the people who can explore them.`,
      "Still Here is an AI representation built from what they chose to share. It is not the person themself.",
      "This invitation is personal and expires in 14 days.",
    ],
    { label: "Accept the invitation", url: opts.url },
    opts.ownerId,
  );
}

const BILLING_COPY: Record<BillingNotice, { subject: string; paragraphs: string[]; cta: string }> = {
  payment_confirmed: {
    subject: "Your Still Here is active",
    paragraphs: ["Thank you. Your payment is confirmed and your plan is now active.", "Your memories are preserved and backed up."],
    cta: "Open Still Here",
  },
  payment_failed: {
    subject: "We couldn't process your payment",
    paragraphs: [
      "Your latest payment did not go through. Nothing has been lost: your memories are safe.",
      "Please update your payment method so we can keep every feature running.",
    ],
    cta: "Update payment method",
  },
  grace_period_started: {
    subject: "Your Still Here is in its grace period",
    paragraphs: [
      "We still couldn't collect your payment. Your Still Here stays fully available during a grace period.",
      "After that, it will switch to Preservation mode: your memories stay safe and exportable, but video conversations are paused.",
      "Your memories are never deleted because of a payment issue.",
    ],
    cta: "Update payment method",
  },
  preservation_mode: {
    subject: "Your Still Here is now in Preservation mode",
    paragraphs: [
      "Your memories, photos and conversations are preserved and you can still read and export them at any time.",
      "Video conversations and new content are paused until a plan is active again.",
    ],
    cta: "Reactivate",
  },
};

export async function sendBillingNotice(userId: string, notice: BillingNotice) {
  const to = await emailOf(userId);
  if (!to) return;
  const copy = BILLING_COPY[notice];
  await sendEmail(to, copy.subject, copy.paragraphs, { label: copy.cta, url: `${publicEnv.appUrl}/settings/billing` }, userId);
}

export async function sendSecurityNotice(userId: string, subject: string, paragraphs: string[]) {
  const to = await emailOf(userId);
  if (!to) return;
  await sendEmail(to, subject, paragraphs, { label: "Review my settings", url: `${publicEnv.appUrl}/settings` }, userId);
}
