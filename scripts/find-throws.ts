import { Simulation } from '../src/physics';
// Developer tuning tool: discover real input trajectories, not fabricated scores.
const found = new Map<number,unknown>();
let tries=0;
outer:for(let x=60;x<=145;x+=5)for(let y=-140;y<=10;y+=5)for(const grabX of [0,-48,48,-32,32]){
  const sim=new Simulation();sim.launch({x,y},{x:grabX,y:0});
  while(sim.phase==='flying')sim.step();tries++;
  const score=sim.score!;
  if(score.onTray&&!found.has(score.total)){const item={pull:{x,y},grab:{x:grabX,y:0},score,position:sim.fish.position,angle:sim.fish.angle};found.set(score.total,item);console.log(JSON.stringify(item));}
  sim.dispose();
  if(found.has(60)&&found.has(100))break outer;
}
console.log(JSON.stringify({tries,scores:[...found.keys()]}));
