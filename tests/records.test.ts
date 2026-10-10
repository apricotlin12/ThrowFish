import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendRecord, canRegisterScore, makeRecord, readRecords } from '../src/records';
import { parseLeaders } from '../src/leaderboard';
import { serviceUrl, SCORE_SERVICE_URL } from '../src/score-service';

const score = {total:140,base:60,flip:60,route:10,landing:10,onTray:true,inside:true,timedOut:false};
test('zero scores cannot register, even through the underlying record functions', () => {
  for (const total of [0,-1,NaN,Infinity]) {
    const invalid = {...score,total};
    assert.equal(canRegisterScore(invalid),false);
    assert.throws(() => makeRecord('zero','',invalid));
    assert.deepEqual(appendRecord([],{id:'zero',nickname:'',total,flip:0,route:0,landing:0,createdAt:''}),[]);
  }
  assert.equal(canRegisterScore(null),false);
  assert.equal(canRegisterScore({...score,total:40}),true);
  assert.equal(canRegisterScore(score),true);
});
test('nickname is optional and high scores retain their column values', () => {
  const record = makeRecord('one','  ',score,'2026-10-10T00:00:00Z');
  assert.equal(record.nickname,'');
  assert.equal(record.total,140); assert.equal(record.flip,60);
  assert.equal(record.route,10); assert.equal(record.landing,10);
  assert.equal(readRecords(JSON.stringify([record]))[0].total,140);
});
test('registering the same throw twice does not duplicate data; new throws remain independent', () => {
  const first = makeRecord('one','魚',score);
  const records = appendRecord([],first);
  assert.equal(appendRecord(records,{...first,nickname:'改名'}),records);
  assert.equal(appendRecord(records,makeRecord('two','魚',score)).length,2);
  assert.equal(readRecords(JSON.stringify([first,first])).length,1);
});
test('damaged or invalid saved records do not break the game', () => {
  assert.deepEqual(readRecords('{broken'),[]);
  assert.deepEqual(readRecords('{}'),[]);
  const valid = makeRecord('one','魚',score);
  assert.deepEqual(readRecords(JSON.stringify([null,{...valid,total:-1},valid])),[valid]);
});
test('service leaderboard is numeric, includes anonymous players, excludes zero, and displays only top three', () => {
  const response = {ok:true,leaders:[
    {nickname:'低分',score:9},{nickname:'高分',score:140},
    {nickname:'',score:110},{nickname:'零分',score:0},{nickname:'中分',score:100},
    {nickname:'壞資料',score:'不是數字'},null,
  ]};
  assert.deepEqual(parseLeaders(response),[{nickname:'高分',score:140},{nickname:'',score:110},{nickname:'中分',score:100}]);
  assert.deepEqual(parseLeaders({ok:true,leaders:[{nickname:'',score:0}]}),[]);
  assert.deepEqual(parseLeaders({ok:true,leaders:[]}),[]);
  assert.throws(() => parseLeaders({ok:false}));
});
test('leaderboard uses the deployed Apps Script instead of the spreadsheet sharing URL', () => {
  const url = new URL(serviceUrl('leaderboard','throwfish_test'));
  assert.equal(url.origin+url.pathname,SCORE_SERVICE_URL);
  assert.equal(url.searchParams.get('action'),'leaderboard');
  assert.equal(url.searchParams.get('callback'),'throwfish_test');
  assert.equal(url.searchParams.has('gid'),false);
});
