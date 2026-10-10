import './style.css';
import { Simulation } from './physics';
import { Renderer, type Drag } from './renderer';
import { Sound } from './audio';
import { WORLD, type Score } from './scoring';
import { canRegisterScore, makeRecord, type ScoreRecord } from './records';
import { loadLeaders } from './leaderboard';
import { submitScore } from './score-service';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('canvas');
const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Playing remains available when storage is blocked. */ } };
const savedBest = Number(read('throwfish.best'));
let best = Number.isFinite(savedBest) ? Math.max(0, Math.floor(savedBest)) : 0;
const sound = new Sound(read('throwfish.sound') === 'on');
const renderer = new Renderer(canvas);
let sim = new Simulation();
let drag: Drag | null = null;
let paused = document.hidden;
let last = performance.now(), accumulator = 0;
let shownResult = false, trickKey = '';
let leaderRequest = 0;
let submission: { id: string; record?: ScoreRecord; pending: boolean; saved: boolean } = { id: crypto.randomUUID(), pending: false, saved: false };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
async function refreshLeaders() {
  const request = ++leaderRequest;
  el<HTMLButtonElement>('refresh-leaders').disabled = true;
  el('leader-status').textContent = '正在讀取排行榜…';
  try {
    const leaders = await loadLeaders();
    if (request !== leaderRequest) return;
    el('leader-list').replaceChildren(...leaders.map((leader,index) => {
      const item = document.createElement('li');
      const rank = document.createElement('span'); rank.className = 'leader-rank'; rank.textContent = String(index + 1).padStart(2,'0');
      const name = document.createElement('span'); name.className = 'leader-name'; name.textContent = leader.nickname || '無名丟魚手';
      const score = document.createElement('strong'); score.textContent = `${leader.score} 分`;
      item.append(rank,name,score); return item;
    }));
    el('leader-status').textContent = leaders.length ? '依排行榜已收錄的分數排序' : '還沒有紀錄，第一名正在等你。';
  } catch {
    if (request !== leaderRequest) return;
    el('leader-status').textContent = '排行榜暫時無法更新，請稍後重試。';
  } finally {
    if (request === leaderRequest) el<HTMLButtonElement>('refresh-leaders').disabled = false;
  }
}
el('registration-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!canRegisterScore(sim.score) || sim.phase !== 'result' || submission.pending || submission.saved) return;
  const current = submission;
  current.record ??= makeRecord(current.id,el<HTMLInputElement>('nickname').value,sim.score);
  current.pending = true;
  el<HTMLButtonElement>('register-score').disabled = true;
  el<HTMLInputElement>('nickname').disabled = true;
  el('register-score').textContent = '登記中…';
  el('registration-status').textContent = '正在寫入分數，請稍候…';
  try {
    await submitScore(current.record);
    current.saved = true;
    if (submission === current) {
      el('register-score').textContent = '已登記';
      el('registration-status').textContent = '分數已寫入，正在更新排行榜…';
    }
    await refreshLeaders();
    if (submission === current) el('registration-status').textContent = '分數已寫入。';
  } catch (error) {
    if (submission === current) {
      el<HTMLButtonElement>('register-score').disabled = false;
      el('register-score').textContent = '重試登記';
      el('registration-status').textContent = error instanceof Error ? error.message : '登記失敗，請稍後重試。';
    }
  } finally { current.pending = false; }
});
el('refresh-leaders').addEventListener('click', () => void refreshLeaders());

function updateSound() {
  el('sound').textContent = `音效 ${sound.enabled ? 'ON' : 'OFF'}`;
  el('sound').setAttribute('aria-pressed', String(sound.enabled));
  el('sound').setAttribute('aria-label', sound.enabled ? '關閉音效' : '開啟音效');
}
function toggleSound() { sound.enabled = !sound.enabled; write('throwfish.sound', sound.enabled ? 'on' : 'off'); sound.unlock(); updateSound(); }
function cancelDrag() {
  const old = drag; drag = null;
  if (sim.phase === 'dragging') sim.phase = 'ready';
  canvas.classList.remove('dragging');
  if (old && canvas.hasPointerCapture(old.id)) canvas.releasePointerCapture(old.id);
  el('power').textContent = '抓中間直飛 · 抓頭尾翻轉';
  if (sim.phase === 'ready') { el('status').textContent = '準備好了，抓住魚！'; el('grab-hint').style.opacity = '1'; }
}
function reset() {
  cancelDrag(); sim.dispose(); sim = new Simulation(); renderer.clear();
  shownResult = false; trickKey = ''; accumulator = 0;
  submission = { id: crypto.randomUUID(), pending: false, saved: false };
  el('registration').hidden = true;
  el<HTMLButtonElement>('register-score').disabled = true;
  el('register-score').textContent = '登記這次分數';
  el('registration-status').textContent = '';
  el<HTMLInputElement>('nickname').disabled = false;
  el('result').hidden = true; el('tricks').replaceChildren();
  el('score').textContent = '—'; el('score').classList.remove('new-best');
  el('grab-hint').style.opacity = '1'; el('status').textContent = '準備好了，抓住魚！';
  el('instruction').textContent = '↖ 按住魚 → 往後拉 → 放開丟出';
  el('power').textContent = '抓中間直飛 · 抓頭尾翻轉';
  canvas.classList.remove('flying');
}
function point(event: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width * WORLD.width, y: (event.clientY - rect.top) / rect.height * WORLD.height };
}
canvas.addEventListener('pointerdown', event => {
  if (paused || sim.phase !== 'ready' || !event.isPrimary || event.button !== 0) return;
  const p = point(event), f = sim.fish.position;
  const rect = canvas.getBoundingClientRect();
  const hitX = event.pointerType === 'touch' ? Math.max(65, 22 * WORLD.width / rect.width) : 65;
  const hitY = event.pointerType === 'touch' ? Math.max(32, 22 * WORLD.height / rect.height) : 32;
  if (Math.abs(p.x - f.x) > hitX || Math.abs(p.y - f.y) > hitY) return;
  event.preventDefault(); sound.unlock(); sound.play('grab');
  drag = { id: event.pointerId, anchor: p, current: p, grab: { x: Math.max(-52,Math.min(52,p.x-f.x)), y: Math.max(-16,Math.min(16,p.y-f.y)) } };
  sim.phase = 'dragging'; canvas.setPointerCapture(event.pointerId); canvas.classList.add('dragging');
  el('status').textContent = '往後拉，放開出手'; el('grab-hint').style.opacity = '0';
});
canvas.addEventListener('pointermove', event => {
  if (!drag || drag.id !== event.pointerId) return;
  drag.current = point(event);
  const power = Math.min(100,Math.round(Math.hypot(drag.anchor.x-drag.current.x,drag.anchor.y-drag.current.y)/WORLD.maxPull*100));
  el('power').textContent = `力道 ${power}% · ${Math.abs(drag.grab.x) > 20 || Math.abs(drag.grab.y) > 9 ? '花式抓法' : '穩定抓法'}`;
});
canvas.addEventListener('pointerup', event => {
  if (!drag || drag.id !== event.pointerId) return;
  drag.current = point(event); const d = drag;
  drag = null; canvas.classList.remove('dragging');
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (sim.launch({ x: d.anchor.x-d.current.x, y: d.anchor.y-d.current.y }, d.grab)) {
    sound.play('throw'); canvas.classList.add('flying');
    el('status').textContent = '魚正在飛，落盤才算數';
    el('instruction').textContent = '✧ 花式暫存中 · 等魚完整停在烤盤上'; el('power').textContent = '這一丟，交給物理';
  } else { el('grab-hint').style.opacity = '1'; el('status').textContent = '拉遠一點，再試一次'; el('power').textContent = '抓中間直飛 · 抓頭尾翻轉'; }
});
canvas.addEventListener('pointercancel', cancelDrag);
canvas.addEventListener('lostpointercapture', () => { if (drag) cancelDrag(); });
canvas.addEventListener('contextmenu', e => e.preventDefault());
el('restart').addEventListener('click', reset); el('again').addEventListener('click', reset); el('sound').addEventListener('click', toggleSound);
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (event.key.toLowerCase() === 'r') reset();
  if (event.key.toLowerCase() === 'm') toggleSound();
});
function pause(value: boolean) { paused = value; cancelDrag(); last = performance.now(); accumulator=0; el('paused').hidden = !value || sim.phase !== 'flying'; }
document.addEventListener('visibilitychange', () => pause(document.hidden));
window.addEventListener('blur', () => pause(true)); window.addEventListener('focus', () => pause(document.hidden));
function updateTricks() {
  const t=sim.tracker, labels:string[]=[];
  if(t.turns) labels.push(`翻轉 ×${t.turns} +${t.turns*10}`);
  if(t.highLob || t.bounce) labels.push(`${t.highLob ? '高拋' : '彈跳'} +10`);
  const key=labels.join('|'); if(key===trickKey)return;trickKey=key;
  el('tricks').replaceChildren(...labels.map(text=>{const tag=document.createElement('span');tag.className='trick';tag.textContent=`${text} · 暫存`;return tag;}));
}
function result(score: Score) {
  shownResult=true;
  const record = score.total > best;
  if(record){ best=score.total; write('throwfish.best',String(best)); el('score').classList.add('new-best'); }
  el('score').textContent = String(score.total).padStart(2,'0'); el('best').textContent=String(best).padStart(2,'0');
  el('result-kicker').textContent=record?'NEW BEST / 新紀錄':'本次投擲 / RESULT';
  const missedTitle = sim.finishLocation === 'floor' ? '在地料理，先不要。' :
    sim.finishLocation === 'oven-top' ? '烤箱上面，不是裡面。' :
    sim.finishLocation === 'out-of-view' ? '魚飛出畫面了！' :
    sim.finishLocation === 'counter' ? '魚還在料理台上。' : '還差一點，沒進烤箱。';
  el('result-title').textContent=score.total>=100?'飛行高手！':score.total>=80?'魚體操選手！':score.onTray?'魚上盤了！':score.timedOut?'還沒落穩。':score.inside?'入爐了，但沒上盤。':missedTitle;
  el('result-description').textContent=score.onTray ? (score.total>=100?'轉幾圈就算幾圈，繼續挑戰更高分。':score.total>=80?'動作漂亮，最後也收得住。':'及格！下一條，試著加點花式。') : score.timedOut ? '等了十秒還在動，這次花式不入帳。' : sim.tracker.turns || sim.tracker.highLob || sim.tracker.bounce ? '動作很好，魚沒上盤。花式不入帳。':'整條魚停在烤盤上，才能拿到 60 分。';
  const rows: [string,number][]=[['基礎分',score.base],['空中翻轉',score.flip],[sim.tracker.highLob?'高拋路線':'彈跳路線',score.route],['漂亮落盤',score.landing]];
  el('breakdown').replaceChildren(...rows.map(([label,value])=>{const row=document.createElement('div');if(!value)row.className='muted';const name=document.createElement('span');name.textContent=label;const number=document.createElement('span');number.textContent=`${value===0?'': '+'}${value}`;row.append(name,number);return row;}));
  for(const tag of el('tricks').children){tag.textContent=tag.textContent!.replace(' · 暫存',score.onTray?' ✓':' · 未入帳');if(!score.onTray)tag.classList.add('invalid');}
  el('result').hidden=false;
  el('registration').hidden=!canRegisterScore(score);
  el<HTMLButtonElement>('register-score').disabled = !canRegisterScore(score);
  el('registration-score').textContent = String(score.total);
  el('status').textContent=score.onTray?'成功落盤，分數入帳':'投擲結束，再來一條';
  el('instruction').textContent = score.onTray ? '✓ 整條魚完整落盤 · 花式有效' : '↻ 再試一次，讓整條魚停在烤盤上';
  el('power').textContent='R 快速重來';
  sound.play(score.onTray?'success':'fail');if(score.onTray)renderer.celebrate();
}
function frame(now: number) {
  const dt=Math.min(.05,Math.max(0,(now-last)/1000)); last=now;
  if(!paused){
    accumulator+=dt;
    while(accumulator>=1/60){sim.step();accumulator-=1/60;}
    while(sim.impacts.length){const hit=sim.impacts.shift()!;renderer.impact(hit);sound.play('hit');}
    if(sim.phase==='flying'){updateTricks();if(sim.stableTime>.1)el('status').textContent='等一下，讓魚停穩…';}
    if(sim.score && !shownResult){updateTricks();result(sim.score);}
    renderer.draw(sim,drag,dt,reduced.matches);
  }
  requestAnimationFrame(frame);
}
el('best').textContent=String(best).padStart(2,'0');void refreshLeaders();updateSound();renderer.draw(sim,null,0,reduced.matches);requestAnimationFrame(frame);
