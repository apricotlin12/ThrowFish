import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScore, TrickTracker, type FinishState } from '../src/scoring';

const state = (override: Partial<FinishState> = {}): FinishState => ({
  vertices: [{ x:706,y:370 },{ x:818,y:370 },{ x:818,y:402 },{ x:706,y:402 }],
  center:{ x:762,y:386 },angle:0,trayContact:true,otherSupport:false,settled:true,timedOut:false,
  turns:0,highLob:false,bounce:false,...override,
});
test('ordinary complete tray landing passes; each rotation earns ten points without a cap',()=>{
  assert.equal(evaluateScore(state({center:{x:720,y:386}})).total,60);
  const score=evaluateScore(state({turns:3,highLob:true,bounce:true}));
  assert.equal(score.total,110);assert.equal(score.route,10);assert.equal(score.flip,30);
  assert.equal(score.base+score.flip+score.route+score.landing,score.total);
  assert.equal(evaluateScore(state({turns:20.9})).flip,200);
  assert.equal(evaluateScore(state({turns:20.9})).total,270);
});
test('tail hanging outside tray invalidates all tricks even when fish centre is above it',()=>{
  const score=evaluateScore(state({vertices:[{x:644,y:380},{x:756,y:380},{x:756,y:402},{x:644,y:402}],turns:2,highLob:true}));
  assert.equal(score.total,40);assert.equal(score.onTray,false);assert.equal(score.flip,0);assert.equal(score.route,0);
});
test('touching then sliding away, underneath tray, wall-supported and timeout are not valid landings',()=>{
  for(const change of [{trayContact:false},{otherSupport:true},{settled:false},{timedOut:true},
    {center:{x:762,y:430},vertices:[{x:706,y:412},{x:818,y:412},{x:818,y:444},{x:706,y:444}]}]) {
    const score=evaluateScore(state({...change,turns:2,highLob:true}));
    assert.equal(score.onTray,false);assert.equal(score.total,40);
  }
});
test('whole fish is required inside oven, not only its centre',()=>{
  assert.equal(evaluateScore(state({vertices:[{x:600,y:380},{x:712,y:380},{x:712,y:402},{x:600,y:402}]})).total,0);
  assert.equal(evaluateScore(state({vertices:[]})).total,0);
});
test('horizontal upside-down fish can receive beautiful landing; vertical fish cannot',()=>{
  assert.equal(evaluateScore(state({angle:Math.PI})).landing,10);
  assert.equal(evaluateScore(state({angle:Math.PI/2})).landing,0);
});
test('signed rotations count complete turns; oscillations and post-contact motion cannot farm points',()=>{
  const tracker=new TrickTracker();
  for(let n=0;n<20;n++){tracker.update(Math.PI,300);tracker.update(0,300);}
  assert.equal(tracker.turns,0);
  tracker.update(Math.PI*2-.01,300);assert.equal(tracker.turns,0);
  tracker.update(Math.PI*2,300);assert.equal(tracker.turns,1);
  tracker.update(Math.PI*4,170);assert.equal(tracker.turns,2);assert.equal(tracker.highLob,true);
  tracker.stopped=true;tracker.update(Math.PI*10,100);assert.equal(tracker.turns,2);
});
