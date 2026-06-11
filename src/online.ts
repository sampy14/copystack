// Online layer: anonymous auth, nickname, Google linking, leaderboard.
// Everything here is fire-and-forget from the game's point of view —
// gameplay must work identically when Supabase is unreachable or unconfigured.
import type { User } from '@supabase/supabase-js';
import type { DifficultyId } from './game';
import { ensureUser, getProfile, googleEmail, isAnonymous, linkGoogle, onAuth, setNickname } from './lib/auth';
import {
  flushQueue,
  myBestWithRank,
  saveScore,
  topScores,
  type LeaderboardEntry,
  type ScoreRow,
} from './lib/scores';
import { supabase } from './lib/supabase';

const BANNER_DISMISSED_KEY = 'copystack.linkBannerDismissed';
const NICKNAME_ASKED_KEY = 'copystack.nicknameAsked';

// Flip to true once the Google provider is configured in the Supabase dashboard
// (OAuth credentials + "Allow manual linking" + URL whitelist).
const GOOGLE_LINKING_ENABLED = false;

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
    // First launch on this device: ask for a player name (once).
    if (!localStorage.getItem(NICKNAME_ASKED_KEY) || username.startsWith('player_')) {
      showNicknamePrompt();
    }
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
  const input = $<HTMLInputElement>('nickname-input');
  if (username && !username.startsWith('player_')) input.value = username;
  $('nickname-overlay').classList.remove('hidden');
  $('nickname-error').textContent = '';
}

function markNicknameAsked(): void {
  try {
    localStorage.setItem(NICKNAME_ASKED_KEY, '1');
  } catch {
    // ignore
  }
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
    if (name !== username) await setNickname(user.id, name);
    username = name;
    markNicknameAsked();
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
  if (!GOOGLE_LINKING_ENABLED) return;
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
    linkBtn.classList.toggle('hidden', !GOOGLE_LINKING_ENABLED);
  } else {
    status.textContent = `Signed in with Google (${googleEmail(user) ?? 'linked'})`;
    linkBtn.classList.add('hidden');
  }
}

export async function renderLeaderboard(): Promise<void> {
  const el = $('leaderboard');
  if (!supabase) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = '<p class="leaderboard-note">Loading top scores…</p>';
  try {
    const [rows, mine] = await Promise.all([
      topScores(3),
      user ? myBestWithRank(user.id) : Promise.resolve(null),
    ]);
    if (rows.length === 0) {
      el.innerHTML = '<p class="leaderboard-note">No scores yet — be the first!</p>';
      return;
    }
    el.innerHTML = '';
    rows.forEach((r, i) => appendLeaderboardRow(el, r, i + 1));
    // My best position, when outside the visible top 3.
    if (mine && mine.rank > 3) {
      const gap = document.createElement('div');
      gap.className = 'lb-gap';
      gap.textContent = '…';
      el.appendChild(gap);
      appendLeaderboardRow(el, mine, mine.rank);
    }
  } catch {
    el.innerHTML = '<p class="leaderboard-note">Leaderboard unavailable.</p>';
  }
}

function appendLeaderboardRow(el: HTMLElement, r: LeaderboardEntry, rank: number): void {
  const level = r.difficulty[0].toUpperCase() + r.difficulty.slice(1);
  const isMe = user !== null && r.user_id === user.id;
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'lb-row' + (isMe ? ' me' : '');
  row.innerHTML =
    `<span class="lb-name">${rank}. ${escapeHtml(r.profiles?.username ?? 'anonymous')}${isMe ? ' (you)' : ''}</span>` +
    `<span class="pts">${r.score} pts</span><span class="lb-chevron">▾</span>`;
  const detail = document.createElement('div');
  detail.className = 'lb-detail hidden';
  detail.textContent = `${level} · ${r.moves} moves · ${(r.time_ms / 1000).toFixed(1)}s`;
  row.addEventListener('click', () => {
    detail.classList.toggle('hidden');
    row.classList.toggle('open', !detail.classList.contains('hidden'));
  });
  el.appendChild(row);
  el.appendChild(detail);
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ---------- Wiring ----------
export function wireOnlineUi(): void {
  $('nickname-save').addEventListener('click', () => void submitNickname());
  $('nickname-skip').addEventListener('click', () => {
    markNicknameAsked();
    $('nickname-overlay').classList.add('hidden');
  });
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
