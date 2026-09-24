import "server-only";
import type { AvatarProvider, EmailProvider, LLMProvider, PaymentProvider, VoiceProvider } from "./types";
import { OpenAILLMProvider, OpenAIVoiceProvider } from "./openai";
import { LiveAvatarProvider } from "./liveavatar";
import { ResendEmailProvider } from "./resend";
import { StripePaymentProvider } from "./stripe";

/** Point unique de sélection des fournisseurs : changer de fournisseur = changer ici. */
let llm: LLMProvider | undefined;
let voice: VoiceProvider | undefined;
let avatar: AvatarProvider | undefined;
let email: EmailProvider | undefined;
let payment: PaymentProvider | undefined;

export const providers = {
  llm: () => (llm ??= new OpenAILLMProvider()),
  voice: () => (voice ??= new OpenAIVoiceProvider()),
  avatar: () => (avatar ??= new LiveAvatarProvider()),
  email: () => (email ??= new ResendEmailProvider()),
  payment: () => (payment ??= new StripePaymentProvider()),
};

export type * from "./types";
