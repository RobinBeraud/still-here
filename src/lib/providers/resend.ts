import "server-only";
import { Resend } from "resend";
import { serverEnv } from "@/lib/env";
import type { EmailProvider } from "./types";

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  async send(opts: { to: string; subject: string; html: string; text: string }) {
    if (!serverEnv.resendApiKey) {
      console.warn(`[email] RESEND_API_KEY missing — email "${opts.subject}" not sent`);
      return { id: null };
    }
    const resend = new Resend(serverEnv.resendApiKey);
    const { data, error } = await resend.emails.send({
      from: serverEnv.emailFrom,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
    return { id: data?.id ?? null };
  }
}
