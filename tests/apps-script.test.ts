import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../google-apps-script/Code.gs', import.meta.url), 'utf8');
const headers = ['暱稱','分數','空中翻轉','高拋路線','完美落盤'];
const id = 'a1234567-1234-1234-1234-123456789012';
const payload = (overrides: Record<string,unknown> = {}) => ({id,nickname:'',total:140,flip:60,route:10,landing:10,...overrides});
function service(initial: unknown[][] = [headers]) {
  const rows = initial.map(row=>[...row]);
  const notes = new Map<string,string>(), cache = new Map<string,string>();
  let locked = false;
  const range = (r:number,c:number,nr=1,nc=1) => ({
    getValues: () => Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>rows[r+i-1]?.[c+j-1] ?? '')),
    getValue: () => rows[r-1]?.[c-1] ?? '',
    getNotes: () => Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>notes.get(`${r+i}:${c+j}`) ?? '')),
    setNote: (value:string) => notes.set(`${r}:${c}`,value),
    setNumberFormat: (_value:string) => undefined,
    setValues: (values:unknown[][]) => {
      values.forEach((row,i)=>{
        rows[r+i-1] ??= [];
        row.forEach((value,j)=>rows[r+i-1][c+j-1]=value);
      });
    },
  });
  const sheet = {getSheetId:()=>0,getLastRow:()=>rows.length,getLastColumn:()=>rows[0].length,
    getMaxRows:()=>1000,insertRowsAfter:()=>undefined,getRange:range};
  const context = createContext({
    console:{log:()=>undefined,error:()=>undefined},
    SpreadsheetApp:{openById:()=>({getSheets:()=>[sheet]}),flush:()=>undefined},
    CacheService:{getScriptCache:()=>({get:(key:string)=>cache.get(key),put:(key:string,value:string)=>cache.set(key,value),remove:(key:string)=>cache.delete(key)})},
    LockService:{getScriptLock:()=>({tryLock:()=>{locked=true;return true;},hasLock:()=>locked,releaseLock:()=>{locked=false;}})},
    ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:(text:string)=>({text,setMimeType(){return this;}})},
  });
  runInContext(source,context);
  const post = (value:unknown) => JSON.parse(context.doPost({postData:{contents:JSON.stringify(value)}}).text);
  const get = (parameter:Record<string,string>={}) => JSON.parse(context.doGet({parameter}).text);
  return {rows,notes,post,get,context,locked:()=>locked};
}

test('Apps Script setup and health inspect the supplied headers without writing records',()=>{
  const s=service();s.context.setupThrowFish();
  assert.deepEqual(s.get({action:'health'}),{ok:true,service:'ThrowFish',version:1});
  assert.equal(s.rows.length,1);
  assert.equal(s.get().leaders.length,0);
});
test('Apps Script writes the five fields with no score cap and confirms a persistent receipt',()=>{
  const s=service();
  assert.equal(s.get({action:'receipt',id}).state,'pending');
  assert.equal(s.post(payload()).state,'saved');
  assert.deepEqual(s.rows[1],['',140,60,10,10]);
  assert.deepEqual(s.rows[0],headers);
  assert.deepEqual(s.get({action:'receipt',id}),{ok:true,id,state:'saved',total:140});
  assert.equal(s.locked(),false);
});
test('Apps Script rejects zero and inconsistent scores before touching the sheet',()=>{
  const s=service();
  assert.equal(s.post(payload({total:0,flip:0,route:0,landing:0})).error,'zero_score');
  assert.equal(s.get({action:'receipt',id}).state,'failed');
  for(const data of [payload({total:141}),payload({flip:61}),payload({total:40,flip:10}),payload({nickname:'x'.repeat(31)})]) {
    assert.equal(s.post(data).ok,false);
  }
  assert.equal(s.rows.length,1); assert.equal(s.notes.size,0);
});
test('Apps Script retries reuse the row; an ID cannot replace a different submitted score',()=>{
  const s=service();
  s.post(payload());
  assert.equal(s.post(payload()).duplicate,true);
  assert.equal(s.rows.length,2);
  assert.equal(s.post(payload({total:150,flip:70})).error,'duplicate_conflict');
  assert.deepEqual(s.rows[1],['',140,60,10,10]);
  assert.equal(s.locked(),false);
});
test('Apps Script maps reordered headers and returns only positive top-three nickname/score pairs',()=>{
  const s=service([
    ['分數','暱稱','完美落盤','高拋路線','空中翻轉'],
    [9,'低分',0,0,0],[180,'高分',10,10,100],[0,'零分',0,0,0],
    [100,'中分',10,10,20],[-1,'無效',0,0,0],
  ]);
  s.post(payload());
  assert.deepEqual(s.rows.at(-1),[140,'',10,10,60]);
  assert.deepEqual(s.get().leaders,[{nickname:'高分',score:180},{nickname:'',score:140},{nickname:'中分',score:100}]);
  assert.equal(s.get({action:'submit'}).error,'unknown_action');
  assert.equal(s.rows.length,7);
});
test('Apps Script nicknames remain text and JSONP callbacks cannot inject executable expressions',()=>{
  const s=service();
  s.post(payload({nickname:'=IMPORTXML("url","x")'}));
  assert.ok(String(s.rows[1][0]).startsWith("'="));
  assert.equal(s.post(payload({nickname:'=IMPORTXML("url","x")'})).duplicate,true);
  const invalid=s.context.doGet({parameter:{callback:'alert(1)//'}}).text;
  assert.equal(JSON.parse(invalid).error,'invalid_callback');
  const valid=s.context.doGet({parameter:{callback:'throwfish_test'}}).text;
  assert.ok(valid.startsWith('throwfish_test('));
});
test('Apps Script does not overwrite data when the existing headers are wrong',()=>{
  const s=service([['名字','總分','翻轉','高拋','落盤']]);
  assert.equal(s.post(payload()).error,'headers_mismatch');
  assert.equal(s.rows.length,1);
});
