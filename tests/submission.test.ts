import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submitScore, type Receipt } from '../src/score-service';
import type { ScoreRecord } from '../src/records';

const record: ScoreRecord = {id:'a1234567-1234-1234-1234-123456789012',nickname:'',total:140,flip:60,route:10,landing:10,createdAt:''};
test('submission does not treat an opaque POST completion as success; it waits for the matching saved receipt',async()=>{
  let reads=0, waits=0;
  await submitScore(record,{
    post:async value=>{assert.equal(value,record);},
    receipt:async id=>{assert.equal(id,record.id);reads++;return reads===1?{ok:true,state:'pending'}:{ok:true,id,state:'saved',total:140};},
    wait:async()=>{waits++;},
  });
  assert.equal(reads,2);assert.equal(waits,1);
});
test('a broken POST connection can still succeed when the server confirms it saved the score',async()=>{
  await submitScore(record,{
    post:async()=>{throw new Error('connection broke after save');},
    receipt:async id=>({ok:true,id,state:'saved',total:140}),wait:async()=>undefined,
  });
});
test('missing receipts and mismatched IDs or totals cannot announce successful registration',async()=>{
  for(const receipt of [{ok:true,state:'pending'},{ok:true,state:'saved',id:'other',total:140},
    {ok:true,state:'saved',id:record.id,total:100}] as Receipt[]) {
    let reads=0;
    await assert.rejects(submitScore(record,{post:async()=>undefined,receipt:async()=>{reads++;return receipt;},wait:async()=>undefined}),/尚未確認寫入/);
    assert.equal(reads,4);
  }
});
test('server rejection is reported and zero scores never make a network request',async()=>{
  let posts=0;
  const io={post:async()=>{posts++;},receipt:async()=>({ok:false,state:'failed',error:'zero_score'}),wait:async()=>undefined};
  await assert.rejects(submitScore({...record,total:0},io),/0 分不能登記/);
  assert.equal(posts,0);
  await assert.rejects(submitScore(record,io),/0 分不能登記/);
  assert.equal(posts,1);
});
test('transient receipt errors are retried without resubmitting another record',async()=>{
  let posts=0, reads=0;
  await submitScore(record,{post:async()=>{posts++;},receipt:async id=>{
    if(++reads===1)throw new Error('temporary read outage');
    return {ok:true,id,state:'saved',total:140};
  },wait:async()=>undefined});
  assert.equal(posts,1);assert.equal(reads,2);
});
