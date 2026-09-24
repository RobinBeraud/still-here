export const MEMORY_TYPES = ["PERSON", "RELATIONSHIP", "MEMORY", "EVENT", "PLACE", "VALUE", "PREFERENCE", "OPINION", "ADVICE", "QUOTE", "LIFE_PERIOD"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const PRIVACY_LEVELS = ["OWNER_ONLY", "ALL_AUTHORIZED_LOVED_ONES", "SPECIFIC_PEOPLE"] as const;
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];

export const PRIVACY_LABELS: Record<PrivacyLevel, string> = {
  OWNER_ONLY: "Only me",
  ALL_AUTHORIZED_LOVED_ONES: "All my loved ones",
  SPECIFIC_PEOPLE: "Specific people",
};

export const MEMORY_STATUSES = ["candidate", "confirmed", "corrected", "rejected"] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export const LIFE_AREAS = ["life_story", "childhood", "family", "relationships", "career", "values", "advice", "personality", "photos", "voice"] as const;
export type LifeArea = (typeof LIFE_AREAS)[number];

export const LIFE_AREA_LABELS: Record<LifeArea, string> = {
  life_story: "Life Story",
  childhood: "Childhood",
  family: "Family",
  relationships: "Relationships",
  career: "Career",
  values: "Values",
  advice: "Advice",
  personality: "Personality",
  photos: "Photos",
  voice: "Voice",
};

export const PERSONALITY_TRAITS = ["humour", "verbosity", "formality", "optimism", "directness", "emotional_style", "language_style", "favorite_expressions", "topics_loved", "topics_avoided"] as const;
export type PersonalityTrait = (typeof PERSONALITY_TRAITS)[number];

/** Consentements. Incrémenter une version force une nouvelle acceptation. */
export const CONSENTS = {
  terms: { version: "2026-09-v1", required: true, label: "I accept the Terms of Service." },
  privacy: { version: "2026-09-v1", required: true, label: "I have read the Privacy Policy." },
  ai_processing: {
    version: "2026-09-v1",
    required: true,
    label: "I agree that my conversations are processed by AI providers to build my Still Here. My data is never used to train external models.",
  },
  memory_storage: {
    version: "2026-09-v1",
    required: true,
    label: "I agree that Still Here stores my conversations, memories and their sources, with encrypted off-site backups.",
  },
  media: { version: "2026-09-v1", required: false, label: "I agree that my photos and audio are stored and analysed to enrich my memories." },
  avatar: { version: "2026-09-v1", required: false, label: "I agree to the creation of a personal video avatar from my likeness." },
  voice: { version: "2026-09-v1", required: false, label: "I agree to the creation of a synthetic voice based on my own voice." },
} as const;
export type ConsentType = keyof typeof CONSENTS;

export const INVITATION_TTL_DAYS = 14;
export const DELETION_DELAY_DAYS = 7;
export const EXPORT_URL_TTL_SECONDS = 60 * 60;
export const SIGNED_MEDIA_TTL_SECONDS = 60 * 10;

export const LANGUAGES = [
  ["en", "English"],
  ["fr", "Français"],
  ["es", "Español"],
  ["de", "Deutsch"],
  ["it", "Italiano"],
  ["pt", "Português"],
  ["nl", "Nederlands"],
] as const;
