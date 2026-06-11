import type { DifficultyId } from '../game';
import { supabase } from './supabase';

export interface ScoreRow {
  userId: string;
  difficulty: DifficultyId;
  score: number;
  timeMs: number;
  moves: number;
}

export interface LeaderboardEntry {
  user_id: string;
  score: number;
  time_ms: number;
  moves: number;
  difficulty: DifficultyId;
  profiles: { username: string } | null;
}

export interface RankedEntry extends LeaderboardEntry {
  rank: number;
}

const QUEUE_KEY = 'copystack.scoreQueue';

function readQueue(): ScoreRow[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writeQueue(queue: ScoreRow[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage unavailable — drop silently, gameplay must never break.
  }
}

async function insert(row: ScoreRow): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('scores').insert({
    user_id: row.userId,
    difficulty: row.difficulty,
    score: row.score,
    time_ms: row.timeMs,
    moves: row.moves,
  });
  if (error) console.error('saveScore failed', error);
  return !error;
}

/** Save a score; on failure queue it and retry when back online. Never throws. */
export async function saveScore(row: ScoreRow): Promise<void> {
  try {
    if (!(await insert(row))) writeQueue([...readQueue(), row]);
  } catch {
    writeQueue([...readQueue(), row]);
  }
}

/** Retry queued scores. Called at startup and on the `online` event. */
export async function flushQueue(): Promise<void> {
  const queue = readQueue();
  if (queue.length === 0) return;
  const remaining: ScoreRow[] = [];
  for (const row of queue) {
    try {
      if (!(await insert(row))) remaining.push(row);
    } catch {
      remaining.push(row);
    }
  }
  writeQueue(remaining);
}

/** Global top N across all difficulties. */
export async function topScores(limit: number): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('scores')
    .select('user_id, score, time_ms, moves, difficulty, profiles(username)')
    .order('score', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as LeaderboardEntry[];
}

/** The given user's best score and its global rank, or null if they have none. */
export async function myBestWithRank(userId: string): Promise<RankedEntry | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('scores')
    .select('user_id, score, time_ms, moves, difficulty, profiles(username)')
    .eq('user_id', userId)
    .order('score', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const best = data as unknown as LeaderboardEntry;
  const { count, error: countError } = await supabase
    .from('scores')
    .select('*', { count: 'exact', head: true })
    .gt('score', best.score);
  if (countError) throw countError;
  return { ...best, rank: (count ?? 0) + 1 };
}
