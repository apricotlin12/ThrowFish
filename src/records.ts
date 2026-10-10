import type { Score } from './scoring';

export const RECORD_KEY = 'throwfish.records.v1';
export interface ScoreRecord {
  id: string;
  nickname: string;
  total: number;
  flip: number;
  route: number;
  landing: number;
  createdAt: string;
}
export function makeRecord(id: string, nickname: string, score: Score, createdAt = new Date().toISOString()): ScoreRecord {
  return { id, nickname: nickname.trim().slice(0, 30), total: score.total,
    flip: score.flip, route: score.route, landing: score.landing, createdAt };
}
function valid(record: unknown): record is ScoreRecord {
  if (!record || typeof record !== 'object') return false;
  const r = record as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.nickname === 'string' && typeof r.createdAt === 'string' &&
    ['total','flip','route','landing'].every(key => Number.isSafeInteger(r[key]) && Number(r[key]) >= 0);
}
export function readRecords(raw: string | null): ScoreRecord[] {
  try {
    const values: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    return values.filter(valid).filter(record => {
      if (seen.has(record.id)) return false;
      seen.add(record.id); return true;
    });
  } catch { return []; }
}
/** One registration per throw, including when the button is clicked repeatedly. */
export function appendRecord(records: ScoreRecord[], record: ScoreRecord): ScoreRecord[] {
  return records.some(r => r.id === record.id) ? records : [...records, record];
}
