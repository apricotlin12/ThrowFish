import { readService } from './score-service';

export interface Leader { nickname: string; score: number }
interface LeaderResponse { ok?: boolean; leaders?: unknown[] }
export function parseLeaders(response: LeaderResponse): Leader[] {
  if (!response?.ok || !Array.isArray(response.leaders)) throw new Error('排行榜讀取失敗');
  return response.leaders.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string,unknown>;
    if (typeof row.score !== 'number' || !Number.isSafeInteger(row.score) || row.score <= 0) return [];
    return [{nickname:typeof row.nickname === 'string' ? row.nickname.trim() : '',score:row.score}];
  // Stable sorting preserves the service's newer-first order for equal scores.
  }).sort((a,b)=>b.score-a.score).slice(0,3);
}
export async function loadLeaders(): Promise<Leader[]> {
  return parseLeaders(await readService<LeaderResponse>('leaderboard'));
}
