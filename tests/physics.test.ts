import { test } from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
import { Simulation } from '../src/physics';
function run(x:number,y:number,grabX=0) {
  const s=new Simulation();assert.equal(s.launch({x,y},{x:grabX,y:0}),true);
  let steps=0;
  while(s.phase==='flying' && steps++<610){s.step();assert.ok(Number.isFinite(s.fish.position.x));assert.ok(Number.isFinite(s.fish.angle));}
  assert.equal(s.phase,'result');
  const result={score:s.score!,location:s.finishLocation,x:s.fish.position.x,y:s.fish.position.y,time:s.time,turns:s.tracker.turns};s.dispose();return result;
}
test('ordinary user input can land a whole fish for exactly 60 points',()=>{
  const r=run(75,-90);assert.equal(r.score.total,60);assert.equal(r.score.onTray,true);assert.ok(r.time<10);
});
test('a real off-centre throw earns ten points for every airborne rotation',()=>{
  const r=run(60,-80,-32);assert.ok(r.turns>=2);assert.equal(r.score.total,80+r.turns*10);assert.equal(r.score.flip,r.turns*10);assert.equal(r.score.route,10);assert.equal(r.score.landing,10);
});
test('identical throws are deterministic',()=>{
  assert.deepEqual(run(60,-80,-32),run(60,-80,-32));
});
test('short drag cancels and cannot relaunch while airborne',()=>{
  const s=new Simulation();assert.equal(s.launch({x:1,y:1}),false);assert.equal(s.phase,'ready');
  assert.equal(s.launch({x:75,y:-90}),true);assert.equal(s.launch({x:75,y:-90}),false);s.dispose();
});
test('hard throws and bad angles remain finite and finish with consistent scores',()=>{
  for(const [x,y,grab] of [[145,0,0],[145,-145,52],[-145,-90,-52],[0,-145,32],[145,145,0]]) {
    const r=run(x,y,grab);assert.ok(Number.isFinite(r.score.total)&&r.score.total>=0);
    assert.equal(r.score.total,r.score.base+r.score.flip+r.score.route+r.score.landing);
    if(!r.score.onTray)assert.equal(r.score.flip+r.score.route+r.score.landing,0);
  }
});
test('floor landings and throws out of view receive different finish locations',()=>{
  assert.equal(run(20,0).location,'floor');
  assert.equal(run(-145,0).location,'out-of-view');
});
test('resting on the oven roof is distinct from floor food and does not count as inside',()=>{
  const s=new Simulation();
  Matter.Body.setPosition(s.fish,{x:760,y:180});s.launch({x:0,y:8});
  while(s.phase==='flying')s.step();
  assert.equal(s.finishLocation,'oven-top');assert.equal(s.score!.inside,false);assert.equal(s.score!.total,0);
  s.dispose();
});
test('fish inside the oven is recognized with complete and incomplete tray landings',()=>{
  assert.equal(run(75,-90).location,'oven');
  const s=new Simulation();
  Matter.Body.setPosition(s.fish,{x:706,y:360});s.launch({x:0,y:8});
  while(s.phase==='flying')s.step();
  assert.equal(s.finishLocation,'oven');assert.equal(s.score!.inside,true);assert.equal(s.score!.onTray,false);assert.equal(s.score!.total,40);
  s.dispose();
});

test('a whole fish resting near either visible tray rim receives tray points',()=>{
  for(const x of [714,810]) {
    const s=new Simulation();
    Matter.Body.setPosition(s.fish,{x,y:350});s.launch({x:0,y:8});
    while(s.phase==='flying')s.step();
    assert.equal(s.score!.onTray,true,`visible rim landing at x=${x}`);
    assert.equal(s.score!.base,60);
    s.dispose();
  }
});
