import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // Non-fatal: the UI surfaces a "connect Supabase" state instead of crashing.
  console.warn(
    "[asterion] Supabase env not set. Copy .env.example to .env and fill VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.",
  );
}

export const supabase: SupabaseClient = createClient(
  url ?? "http://localhost:54321",
  anonKey ?? "public-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

// Per-device identity uses Supabase anonymous sign-in (no login UI). RLS on the
// user-data tables is scoped to auth.uid(), so we need a session before reads.
export async function ensureAnonymousSession(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;

  const { data: signedIn, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.warn("[asterion] anonymous sign-in failed:", error.message);
    return null;
  }
  return signedIn.user?.id ?? null;
}
