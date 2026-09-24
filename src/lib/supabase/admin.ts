import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Client service_role : contourne RLS.
 * Réservé aux webhooks, jobs cron, workflows serveur explicitement contrôlés.
 * JAMAIS pour le retrieval RAG ni pour lire des données au nom d'un viewer.
 */
export function createAdminClient() {
  return createClient(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminSupabase = ReturnType<typeof createAdminClient>;
