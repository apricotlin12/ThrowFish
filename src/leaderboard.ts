export interface Leader { nickname: string; score: number }
interface QueryResponse {
  status?: string;
  table?: { rows?: { c?: ({ v?: unknown } | null)[] }[] };
}
export const SHEET_ID = '1R_YjVopuqSth7HJ-48nnZGfl6KBnGZO0Pse6GI93PTg';
export function parseLeaders(response: QueryResponse): Leader[] {
  if (response.status !== 'ok' || !response.table || !Array.isArray(response.table.rows)) {
    throw new Error('排行榜讀取失敗');
  }
  return response.table.rows.flatMap(row => {
    const name = row.c?.[0]?.v, value = row.c?.[1]?.v;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return [];
    return [{ nickname: typeof name === 'string' ? name.trim() : '', score: value }];
  }).sort((a,b) => b.score - a.score).slice(0,3);
}
export function leaderboardUrl(callback: string): string {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`);
  url.searchParams.set('gid','0');
  url.searchParams.set('headers','1');
  url.searchParams.set('tq','select A, B where B is not null order by B desc limit 3');
  url.searchParams.set('tqx',`out:json;responseHandler:${callback}`);
  url.searchParams.set('_',String(Date.now()));
  return url.href;
}
/** Public read-only Google Visualization query; no Google login or API key. */
export function loadLeaders(): Promise<Leader[]> {
  return new Promise((resolve,reject) => {
    const callback = 'throwfish_leaders_' + crypto.randomUUID().replaceAll('-','');
    const globals = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');
    let finished = false;
    const cleanup = () => { clearTimeout(timer); script.remove(); delete globals[callback]; };
    const fail = () => { if (finished) return; finished = true; cleanup(); reject(new Error('排行榜暫時無法更新')); };
    const timer = setTimeout(fail,15000);
    globals[callback] = (response: QueryResponse) => {
      if (finished) return; finished = true; cleanup();
      try { resolve(parseLeaders(response)); } catch (error) { reject(error); }
    };
    script.src = leaderboardUrl(callback); script.referrerPolicy = 'no-referrer'; script.onerror = fail;
    document.head.append(script);
  });
}
