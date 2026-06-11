import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

function client() {
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

/** Ensure there is always a signed-in user. Call once at app startup. */
export async function ensureUser(): Promise<User> {
  const sb = client();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session) return session.user;

  const { data, error } = await sb.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error('Anonymous sign-in failed');
  return data.user;
}

/** True if the current user has not linked a permanent identity yet. */
export function isAnonymous(user: User): boolean {
  return user.is_anonymous === true;
}

/**
 * Read the profile row, normally created by the DB signup trigger.
 * If the trigger hasn't run (row missing), create the row with a
 * placeholder username so the app can proceed.
 */
export async function getProfile(userId: string): Promise<{ id: string; username: string }> {
  const sb = client();
  const { data, error } = await sb
    .from('profiles')
    .select('id, username')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  const placeholder = { id: userId, username: `player_${userId.slice(0, 8)}` };
  const { error: insertError } = await sb.from('profiles').insert(placeholder);
  if (insertError && (insertError as { code?: string }).code !== '23505') throw insertError;
  return placeholder;
}

/** Save the nickname chosen by the player. RLS allows only own row. */
export async function setNickname(userId: string, username: string): Promise<void> {
  const { error } = await client().from('profiles').update({ username }).eq('id', userId);
  if (error) {
    // 23505 = unique violation -> nickname taken
    if ((error as { code?: string }).code === '23505') throw new Error('NICKNAME_TAKEN');
    throw error;
  }
}

/**
 * Link a Google account to the CURRENT anonymous user.
 * linkIdentity keeps the SAME user id, so every row in `scores` (keyed on
 * user_id) is preserved. Do NOT use signInWithOAuth here: that would
 * create/switch to a different user and orphan the scores.
 */
export async function linkGoogle(): Promise<void> {
  const { error } = await client().auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
  });
  if (error) throw error;
  // Browser now redirects to Google and back; nothing to do after this line.
}

/** The email of the linked Google identity, if any. */
export function googleEmail(user: User): string | null {
  const identity = user.identities?.find((i) => i.provider === 'google');
  return identity?.identity_data?.email ?? user.email ?? null;
}

/** React to auth changes (e.g. after the OAuth redirect returns). */
export function onAuth(cb: (user: User | null) => void): void {
  client().auth.onAuthStateChange((_event, session) => cb(session?.user ?? null));
}
