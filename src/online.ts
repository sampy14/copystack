// Online layer: anonymous auth, nickname, Google linking, leaderboard.
// Everything here is fire-and-forget from the game's point of view —
// gameplay must work identically when Supabase is unreachable or unconfigured.
import type { User } from '@supabase/supabase-js';
import type { DifficultyId } from './game';
import { ensureUser, getProfile, googleEmail, isAnonymous, linkGoogle, onAuth, setNickname } from './lib/auth';
import { flushQueue, saveScore, topTen, type ScoreRow } from './lib/scores';
import { supabase } from './lib/supabase';

const BANNER_DISMISSED_KEY = 'copystack.linkBannerDismissed';

let user: User | null = null;
let username: string | null = null;
let bannerShownThisSession = false;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export async function initOnline(): Promise<void> {
  if (!supabase) return;
  try {
    user = await ensureUser();
    onAuth((u) => {
      user = u;
      renderAccount();
    });
    const profile = await getProfile(user.id);
    username = profile.username;
    void flushQueue();
    window.addEventListener('online', () => void flushQueue());
    // First launch: placeholder username from the DB trigger -> offer a nickname.
    if (username.startsWith('player_')) showNicknamePrompt();
  } catch (err) {
    console.error('Online init failed; playing local-only', err);
  }
}

export function reportScore(difficulty: DifficultyId, score: number, timeMs: number, moves: number): void {
  if (!user) return;
  const row: ScoreRow = { userId: user.id, difficulty, score, timeMs, moves };
  void saveScore(row);
  maybeShowLinkBanner();
}

// ---------- Nickname prompt ----------
function showNicknamePrompt(): void {
  $('nickname-overlay').classList.remove('hidden');
  $('nickname-error').textContent = '';
}

async function submitNickname(): Promise<void> {
  if (!user) return;
  const input = $<HTMLInputElement>('nickname-input');
  const name = input.value.trim();
  if (name.length < 3 || name.length > 20) {
    $('nickname-error').textContent = 'Nickname must be 3–20 characters.';
    return;
  }
  try {
    await setNickname(user.id, name);
    username = name;
    $('nickname-overlay').classList.add('hidden');
    renderAccount();
  } catch (err) {
    $('nickname-error').textContent =
      err instanceof Error && err.message === 'NICKNAME_TAKEN'
        ? 'That nickname is taken — try another.'
        : 'Could not save the nickname. Try again.';
  }
}

// ---------- Google link banner ----------
function maybeShowLinkBanner(): void {
  if (!user || !isAnonymous(user) || bannerShownThisSession) return;
  if (localStorage.getItem(BANNER_DISMISSED_KEY)) return;
  bannerShownThisSession = true;
  $('link-banner').classList.remove('hidden');
}

async function doLinkGoogle(): Promise<void> {
  try {
    await linkGoogle();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    alert(
      msg.includes('already')
        ? 'This Google account is already linked to another player.'
        : 'Could not link the Google account. Try again later.'
    );
  }
}

// ---------- Account panel + leaderboard (inside the Best overlay) ----------
export function renderAccount(): void {
  const section = $('account-section');
  if (!supabase || !user) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  $<HTMLInputElement>('account-username').value = username ?? '';
  const status = $('account-status');
  const linkBtn = $('account-link-google');
  if (isAnonymous(user)) {
    status.textContent = 'Guest account — scores are tied to this device.';
    linkBtn.classList.remove('hidden');
  } else {
    status.textContent = `Signed in with Google (${googleEmail(user) ?? 'linked'})`;
    linkBtn.classList.add('hidden');
  }
}

export async function renderLeaderboard(difficulty: DifficultyId): Promise<void> {
  const el = $('leaderboard');
  if (!supabase) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = '<p class="leaderboard-note">Loading top 10…</p>';
  try {
    const rows = await topTen(difficulty);
    if (rows.length === 0) {
      el.innerHTML = '<p class="leaderboard-note">No scores yet — be the first!</p>';
      return;
    }
    el.innerHTML = rows
      .map(
        (r, i) =>
          `<div class="best-row"><span>${i + 1}. ${escapeHtml(r.profiles?.username ?? 'anonymous')}</span>` +
          `<span>${r.score} pts · ${(r.time_ms / 1000).toFixed(1)}s</span></div>`
      )
      .join('');
  } catch {
    el.innerHTML = '<p class="leaderboard-note">Leaderboard unavailable.</p>';
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ---------- Wiring ----------
export function wireOnlineUi(): void {
  $('nickname-save').addEventListener('click', () => void submitNickname());
  $('nickname-skip').addEventListener('click', () => $('nickname-overlay').classList.add('hidden'));
  $('link-banner-btn').addEventListener('click', () => void doLinkGoogle());
  $('link-banner-dismiss').addEventListener('click', () => {
    $('link-banner').classList.add('hidden');
    try {
      localStorage.setItem(BANNER_DISMISSED_KEY, '1');
    } catch {
      // ignore
    }
  });
  $('account-link-google').addEventListener('click', () => void doLinkGoogle());
  $('account-save-username').addEventListener('click', async () => {
    if (!user) return;
    const name = $<HTMLInputElement>('account-username').value.trim();
    if (name.length < 3 || name.length > 20 || name === username) return;
    try {
      await setNickname(user.id, name);
      username = name;
      $('account-status').textContent = 'Nickname saved.';
    } catch (err) {
      $('account-status').textContent =
        err instanceof Error && err.message === 'NICKNAME_TAKEN'
          ? 'That nickname is taken — try another.'
          : 'Could not save the nickname.';
    }
  });
}
