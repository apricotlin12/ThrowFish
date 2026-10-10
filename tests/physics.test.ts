import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/physics';
function run(x:number,y:number,grabX=0) {
  const s=new Simulation();assert.equal(s.launch({x,y},{x:grabX,y:0}),true);
  let steps=0;
  while(s.phase==='flying' && steps++<610){s.step();assert.ok(Number.isFinite(s.fish.position.x));assert.ok(Number.isFinite(s.fish.angle));}
  assert.equal(s.phase,'result');
  const result={score:s.score!,x:s.fish.position.x,y:s.fish.position.y,time:s.time,turns:s.tracker.turns};s.dispose();return result;
}
test('ordinary user input can land a whole fish for exactly 60 points',()=>{
  const r=run(75,-90);assert.equal(r.score.total,60);assert.equal(r.score.onTray,true);assert.ok(r.time<10);
});
test('a real off-centre throw can earn all 100 points without synthetic scoring state',()=>{
  const r=run(60,-80,-32);assert.equal(r.score.total,100);assert.equal(r.score.flip,20);assert.equal(r.score.route,10);assert.equal(r.score.landing,10);
});
test('identical throws are deterministic',()=>{
  assert.deepEqual(run(60,-80,-32),run(60,-80,-32));
});
test('short drag cancels and cannot relaunch while airborne',()=>{
  const s=new Simulation();assert.equal(s.launch({x:1,y:1}),false);assert.equal(s.phase,'ready');
  assert.equal(s.launch({x:75,y:-90}),true);assert.equal(s.launch({x:75,y:-90}),false);s.dispose();
});
test('hard throws and bad angles remain finite, finish, and obey scoring cap',()=>{
  for(const [x,y,grab] of [[145,0,0],[145,-145,52],[-145,-90,-52],[0,-145,32],[145,145,0]]) {
    const r=run(x,y,grab);assert.ok(r.score.total>=0&&r.score.total<=100);
    if(!r.score.onTray)assert.equal(r.score.flip+r.score.route+r.score.landing,0);
  }
});
