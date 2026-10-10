import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendRecord, makeRecord, readRecords } from '../src/records';
import { parseLeaders, leaderboardUrl, SHEET_ID } from '../src/leaderboard';

const score = {total:140,base:60,flip:60,route:10,landing:10,onTray:true,inside:true,timedOut:false};
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
test('leaderboard is numeric, includes anonymous and zero scores, and displays only top three', () => {
  const response = {status:'ok',table:{rows:[
    {c:[{v:'低分'},{v:9}]},{c:[{v:'高分'},{v:140}]},
    {c:[null,{v:110}]},{c:[{v:'零分'},{v:0}]},{c:[{v:'中分'},{v:100}]},
    {c:[{v:'壞資料'},{v:'不是數字'}]},{c:[null,null]},
  ]}};
  assert.deepEqual(parseLeaders(response),[{nickname:'高分',score:140},{nickname:'',score:110},{nickname:'中分',score:100}]);
  assert.deepEqual(parseLeaders({status:'ok',table:{rows:[{c:[null,{v:0}]}]}}),[{nickname:'',score:0}]);
  assert.deepEqual(parseLeaders({status:'ok',table:{rows:[]}}),[]);
  assert.throws(() => parseLeaders({status:'error'}));
});
test('public query targets the supplied spreadsheet and requests only the top three columns', () => {
  const url = new URL(leaderboardUrl('throwfish_test'));
  assert.ok(url.pathname.includes(SHEET_ID));
  assert.equal(url.searchParams.get('gid'),'0');
  assert.equal(url.searchParams.get('headers'),'1');
  assert.equal(url.searchParams.get('tq'),'select A, B where B is not null order by B desc limit 3');
  assert.equal(url.searchParams.get('tqx'),'out:json;responseHandler:throwfish_test');
});
