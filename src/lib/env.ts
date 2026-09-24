import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

/** Secrets serveur. Ne jamais importer depuis un composant client. */
export const serverEnv = {
  get supabaseServiceRoleKey() { return required("SUPABASE_SERVICE_ROLE_KEY"); },
  get openaiApiKey() { return required("OPENAI_API_KEY"); },
  get openaiChatModel() { return optional("OPENAI_CHAT_MODEL", "gpt-5-mini"); },
  get openaiExtractionModel() { return optional("OPENAI_EXTRACTION_MODEL", "gpt-5-mini"); },
  get openaiEmbeddingModel() { return optional("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"); },
  get openaiTranscribeModel() { return optional("OPENAI_TRANSCRIBE_MODEL", "gpt-4o-transcribe"); },
  get openaiTtsModel() { return optional("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"); },
  get openaiTtsVoice() { return optional("OPENAI_TTS_VOICE", "alloy"); },
  get liveAvatarApiKey() { return optional("LIVEAVATAR_API_KEY"); },
  get liveAvatarDefaultAvatarId() { return optional("LIVEAVATAR_DEFAULT_AVATAR_ID"); },
  get liveAvatarSandbox() { return optional("LIVEAVATAR_SANDBOX", "false") === "true"; },
  get resendApiKey() { return optional("RESEND_API_KEY"); },
  get emailFrom() { return optional("EMAIL_FROM", "Still Here <hello@example.com>"); },
  get adminAlertEmail() { return optional("ADMIN_ALERT_EMAIL"); },
  get stripeSecretKey() { return required("STRIPE_SECRET_KEY"); },
  get stripeWebhookSecret() { return required("STRIPE_WEBHOOK_SECRET"); },
  get gracePeriodDays() { return Number(optional("BILLING_GRACE_PERIOD_DAYS", "30")); },
  get cronSecret() { return required("CRON_SECRET"); },
};

export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
};
