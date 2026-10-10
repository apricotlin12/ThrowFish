import type { ScoreRecord } from './records';

export const SCORE_SERVICE_URL = 'https://script.google.com/macros/s/AKfycbwvPjQSMQ-UzFmX5ncQ5bVA5S8T4JWiu1GQ3KJdLHoirqqwGP8PSnlIxpnz8OQoy3-ryQ/exec';
export interface Receipt { ok: boolean; id?: string; state?: string; total?: number; error?: string }
export function serviceUrl(action: 'leaderboard' | 'receipt', callback: string, id?: string): string {
  const url = new URL(SCORE_SERVICE_URL);
  url.searchParams.set('action',action); url.searchParams.set('callback',callback);
  if (id) url.searchParams.set('id',id);
  url.searchParams.set('_',String(Date.now()));
  return url.href;
}
export function readService<T>(action: 'leaderboard' | 'receipt', id?: string): Promise<T> {
  return new Promise((resolve,reject) => {
    const callback = 'throwfish_' + crypto.randomUUID().replaceAll('-','');
    const globals = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');
    let finished = false;
    const cleanup = () => { clearTimeout(timer); script.remove(); };
    const fail = () => {
      if (finished) return; finished = true; cleanup();
      globals[callback] = () => undefined;
      setTimeout(() => delete globals[callback],60000);
      reject(new Error('目前無法連線，請稍後再試。'));
    };
    const timer = setTimeout(fail,12000);
    globals[callback] = (response: T) => {
      if (finished) return; finished = true; cleanup(); delete globals[callback]; resolve(response);
    };
    script.src = serviceUrl(action,callback,id); script.referrerPolicy = 'no-referrer'; script.onerror = fail;
    document.head.append(script);
  });
}
async function postScore(record: ScoreRecord): Promise<void> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(),20000);
  try {
    // An opaque response is not proof of success. Confirm the durable receipt separately.
    await fetch(SCORE_SERVICE_URL,{method:'POST',mode:'no-cors',credentials:'omit',referrerPolicy:'no-referrer',
      headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(record),signal:controller.signal});
  } finally { clearTimeout(timer); }
}
interface SubmissionTransport {
  post(record: ScoreRecord): Promise<void>;
  receipt(id: string): Promise<Receipt>;
  wait(): Promise<void>;
}
const transport: SubmissionTransport = {
  post: postScore,
  receipt: id => readService<Receipt>('receipt',id),
  wait: () => new Promise(resolve => setTimeout(resolve,1200)),
};
export async function submitScore(record: ScoreRecord, io: SubmissionTransport = transport): Promise<void> {
  if (!Number.isSafeInteger(record.total) || record.total <= 0) throw new Error('0 分不能登記。');
  try { await io.post(record); } catch { /* The server may have saved before the connection broke. */ }
  for (let attempt=0;attempt<4;attempt++) {
    let receipt: Receipt | undefined;
    try { receipt = await io.receipt(record.id); } catch { /* Retry transient read failures. */ }
    if (receipt?.ok && receipt.state === 'saved' && receipt.id === record.id && receipt.total === record.total) return;
    if (receipt && !receipt.ok) {
      if (receipt.error === 'zero_score') throw new Error('0 分不能登記。');
      if (receipt.error === 'invalid_score' || receipt.error === 'invalid_nickname') throw new Error('登記資料不正確，請重新投擲。');
      throw new Error('分數尚未登記成功，請稍後重試。');
    }
    if (attempt<3) await io.wait();
  }
  throw new Error('尚未確認寫入，請按重試；同一筆不會重複登記。');
}
