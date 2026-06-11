import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Null when env vars are not configured: the game then runs fully local
// (no accounts, no online leaderboard) instead of breaking.
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
