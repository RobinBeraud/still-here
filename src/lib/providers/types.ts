/**
 * Abstractions fournisseurs. Aucun code spécifique OpenAI / LiveAvatar / Resend / Stripe
 * ne doit apparaître ailleurs que dans les implémentations de ce dossier.
 */

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type TokenUsage = { inputTokens: number; outputTokens: number };

export interface LLMProvider {
  readonly name: string;
  chat(opts: { system: string; messages: ChatMessage[]; maxOutputTokens?: number }): Promise<{ text: string; usage: TokenUsage }>;
  structured<T>(opts: {
    system: string;
    user: string;
    schemaName: string;
    schema: Record<string, unknown>;
    maxOutputTokens?: number;
  }): Promise<{ data: T; usage: TokenUsage }>;
  describeImage(opts: { imageUrl: string; prompt: string }): Promise<{ text: string; usage: TokenUsage }>;
  embed(texts: string[]): Promise<{ vectors: number[][]; tokens: number; model: string }>;
  transcribe(file: File, language?: string): Promise<{ text: string }>;
}

export interface VoiceProvider {
  readonly name: string;
  synthesize(opts: { text: string; voiceId?: string | null; instructions?: string }): Promise<{ audio: ArrayBuffer; contentType: string }>;
}

export interface AvatarProvider {
  readonly name: string;
  isConfigured(): boolean;
  /**
   * Session temps réel. Le fournisseur n'utilise PAS son propre LLM :
   * l'application lui fait prononcer des réponses grounded (repeat).
   */
  createLiveSession(opts: {
    avatarId: string;
    voiceId?: string | null;
    language?: string;
    maxSessionSeconds: number;
  }): Promise<{ sessionId: string; sessionToken: string }>;
  stopSession(sessionId: string): Promise<void>;
}

export interface EmailProvider {
  readonly name: string;
  send(opts: { to: string; subject: string; html: string; text: string }): Promise<{ id: string | null }>;
}

// ------------------------------------------------------------------ billing

export type CheckoutLine = { priceId: string; quantity: number };

export type BillingDomainEvent =
  | {
      kind: "checkout_completed";
      userId: string;
      planCode: string;
      customerId: string;
      subscriptionId: string | null;
      paymentId: string;
      amount: number;
      currency: string;
      paid: boolean;
    }
  | {
      kind: "invoice_paid";
      customerId: string;
      subscriptionId: string | null;
      paymentId: string;
      amount: number;
      currency: string;
      receiptUrl: string | null;
    }
  | { kind: "invoice_payment_failed"; customerId: string; subscriptionId: string | null }
  | { kind: "subscription_changed"; customerId: string; subscriptionId: string }
  | { kind: "refund"; customerId: string | null; paymentId: string; amountRefunded: number; currency: string; fullyRefunded: boolean }
  | { kind: "ignored" };

export type ProviderEvent = { id: string; type: string; event: BillingDomainEvent };

export type ProviderSubscription = {
  id: string;
  customerId: string;
  status: string; // active, past_due, canceled, unpaid, incomplete...
  planCode: string | null;
  userId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export interface PaymentProvider {
  readonly name: string;
  ensureCustomer(opts: { userId: string; email: string; existingCustomerId: string | null }): Promise<string>;
  createCheckout(opts: {
    userId: string;
    customerId: string;
    planCode: string;
    mode: "payment" | "subscription";
    lines: CheckoutLine[];
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  createPortalSession(opts: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  /** Vérifie la signature et normalise l'événement. Lève une erreur si la signature est invalide. */
  parseWebhook(rawBody: string, signature: string): ProviderEvent;
  /** Relecture d'un événement (réconciliation des événements en échec). */
  retrieveEvent(eventId: string): Promise<ProviderEvent>;
  /** Relecture de l'état réel : rend le traitement insensible à l'ordre des webhooks. */
  getSubscription(subscriptionId: string): Promise<ProviderSubscription>;
  /** Utilisé uniquement lors de l'exécution d'une suppression de compte demandée par l'utilisateur. */
  cancelSubscription(subscriptionId: string): Promise<void>;
}
