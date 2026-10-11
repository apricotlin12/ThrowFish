import { WORLD, type Point } from './scoring';
import { Simulation, type Impact } from './physics';
export interface Drag { anchor: Point; current: Point; grab: Point; id: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string }
const COOKED_COLORS: Record<string, string> = {
  '#395956': '#6a4434', '#6b9a8d': '#a66b42', '#80ad9d': '#c7905a',
  '#8bb6a4': '#d7a567', '#84b2a2': '#cf955b', '#9ac5af': '#e1b879',
  '#c9d7b7': '#f4d7a1', '#659488': '#ad7445', '#527b73': '#865c3d',
  '#6c9f91': '#b67a48', '#5f8e82': '#9d693d',
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private background = document.createElement('canvas');
  private particles: Particle[] = [];
  private trail: Point[] = [];
  private hit = 0;
  private clock = 0;
  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.background.width = 960; this.background.height = 540;
    this.drawKitchen(this.background.getContext('2d')!);
  }
  clear() { this.particles = []; this.trail = []; this.hit = 0; }
  impact(i: Impact) {
    this.hit = Math.min(1, i.strength / 12);
    for (let n = 0; n < Math.min(12, i.strength * 2); n++) {
      const angle = -Math.PI * (n / 12), speed = 30 + Math.random() * 75;
      this.particles.push({ x: i.x, y: i.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: .3 + Math.random() * .2, color: i.tray ? '#edc78b' : '#a6bbb0' });
    }
  }
  celebrate() {
    for (let n = 0; n < 28; n++) this.particles.push({ x: 762, y: 360,
      vx: (Math.random() - .5) * 260, vy: -70 - Math.random() * 140,
      life: .7 + Math.random() * .5, color: ['#e5a366','#c9d888','#f4d7a4'][n % 3] });
  }
  draw(sim: Simulation, drag: Drag | null, dt: number, reduced: boolean) {
    const c = this.ctx;
    this.clock += dt; this.hit = Math.max(0, this.hit - dt * 4);
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, 960, 540); c.drawImage(this.background, 0, 0);
    const f = sim.fish;
    const r = (x:number,y:number,w:number,h:number,color:string) => { c.fillStyle=color;c.fillRect(Math.round(x/2)*2,Math.round(y/2)*2,w,h); };
    // Sparse dust motes in the window, kept quiet around the aiming area.
    if (!reduced) for (let n=0;n<5;n++) r(74+n*34,150+Math.sin(this.clock*.45+n)*14,2,2,'#eef3d9');
    if (sim.phase === 'flying' && !reduced) {
      this.trail.push({ ...f.position }); if (this.trail.length > 12) this.trail.shift();
      this.trail.forEach((p,n) => { c.globalAlpha = n / 12 * .2; r(p.x-2,p.y-2,4,4,'#617f75'); }); c.globalAlpha = 1;
    }
    if (sim.phase === 'ready' || sim.phase === 'dragging') {
      const bob = reduced ? 0 : Math.round(Math.sin(this.clock * 2.5) * 2);
      r(173,397,104,4,'#abb699');
      this.drawFish(c,f.position.x,f.position.y+bob,0,0);
      if (!drag) { c.globalAlpha=.6;r(222,330+bob,4,8,'#db956a');r(218,334+bob,12,4,'#db956a');c.globalAlpha=1; }
    } else {
      c.globalAlpha = .16;
      const shadowY = f.position.x >= 628 && f.position.x <= 886 ? 446 : 478;
      r(f.position.x - 42, shadowY,84,4,'#253e3d'); c.globalAlpha=1;
      this.drawFish(c, f.position.x, f.position.y, f.angle, reduced ? 0 : this.hit, sim.score?.inside === true);
    }
    if (drag) {
      let dx = drag.anchor.x - drag.current.x, dy = drag.anchor.y - drag.current.y;
      const length = Math.hypot(dx,dy), k = Math.min(1,WORLD.maxPull / Math.max(1,length)); dx*=k;dy*=k;
      c.lineWidth=3;c.strokeStyle='#d08659';c.setLineDash([5,6]);c.beginPath();c.moveTo(drag.anchor.x-dx,drag.anchor.y-dy);c.lineTo(drag.anchor.x,drag.anchor.y);c.stroke();c.setLineDash([]);
      const unit=Math.max(1,Math.hypot(dx,dy)), ax=f.position.x+dx/unit*68, ay=f.position.y+dy/unit*68;
      c.strokeStyle='#d78250';c.lineWidth=4;c.beginPath();c.moveTo(f.position.x,f.position.y);c.lineTo(ax,ay);c.stroke();
      const a=Math.atan2(dy,dx);c.fillStyle='#d78250';c.beginPath();c.moveTo(ax+Math.cos(a)*10,ay+Math.sin(a)*10);c.lineTo(ax+Math.cos(a+2.5)*9,ay+Math.sin(a+2.5)*9);c.lineTo(ax+Math.cos(a-2.5)*9,ay+Math.sin(a-2.5)*9);c.fill();
      r(f.position.x-36,f.position.y+34,72,6,'#acbda3');r(f.position.x-36,f.position.y+34,72*Math.min(1,length/145),6,'#dc9567');
    }
    this.particles = this.particles.filter(p=>p.life>0);
    for (const p of this.particles) { p.life-=dt;if(!reduced){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=180*dt;c.globalAlpha=Math.min(1,Math.max(0,p.life*4));r(p.x,p.y,4,4,p.color);} } c.globalAlpha=1;
    // A narrow tray front lip foreground makes the landing surface legible.
    r(660,408,204,4,'#829998');r(664,412,196,4,'#567976');
    if (sim.score?.inside && !reduced) {
      c.globalAlpha=.35;
      for(let n=0;n<3;n++){const y=370-((this.clock*20+n*12)%45);r(f.position.x-22+n*20+Math.sin(y/12)*4,y,4,8,'#f3eccf');}c.globalAlpha=1;
    }
  }
  private drawFish(c: CanvasRenderingContext2D,x:number,y:number,a:number,hit:number,cooked=false) {
    c.save();c.translate(Math.round(x),Math.round(y));c.rotate(a);
    c.scale(1+hit*.08,1-hit*.12);
    const p=(x:number,y:number,w:number,h:number,color:string)=>{c.fillStyle=cooked ? COOKED_COLORS[color] ?? color : color;c.fillRect(x,y,w,h);};
    // Pixel silhouette: tail, body, fins and an unnecessarily serious eye.
    p(-56,-12,8,24,'#395956');p(-48,-8,8,16,'#395956');p(-40,-12,12,24,'#395956');
    p(-28,-16,60,32,'#395956');p(32,-12,12,24,'#395956');p(44,-8,8,16,'#395956');p(52,-4,4,12,'#395956');
    p(-52,-8,4,16,'#6b9a8d');p(-48,-4,12,8,'#80ad9d');p(-36,-8,12,16,'#8bb6a4');
    p(-24,-12,56,24,'#84b2a2');p(32,-8,12,16,'#9ac5af');p(44,-4,8,8,'#9ac5af');
    p(-20,4,52,8,'#c9d7b7');p(28,4,16,4,'#c9d7b7');p(-24,-12,44,4,'#659488');
    p(-16,-20,20,4,'#527b73');p(-12,-16,24,4,'#659488');p(-12,12,16,8,'#659488');
    p(-16,-4,4,4,'#6c9f91');p(-4,0,4,4,'#6c9f91');p(8,-4,4,4,'#6c9f91');p(-28,0,4,4,'#6c9f91');
    p(24,-8,12,12,'#eaf0d5');p(28,-8,8,12,'#2c4746');p(28,-8,4,4,'#f9f8e8');
    p(44,4,8,4,'#395956');p(16,-4,4,12,'#5f8e82');
    c.restore();
  }
  private drawKitchen(c: CanvasRenderingContext2D) {
    const r=(x:number,y:number,w:number,h:number,color:string)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
    r(0,0,960,540,'#dee7d2');r(0,0,960,12,'#d3dfc5');
    // Wall tiles and gentle blocky sunlight.
    for(let y=36;y<470;y+=48){r(0,y,960,2,'#d3dfc7');for(let x=(y%96===36?0:48);x<960;x+=96)r(x,y-46,2,46,'#d6e1cb');}
    r(44,64,212,204,'#c5d5b8');r(48,68,204,196,'#b0c5a7');r(56,76,188,180,'#edf0d4');
    r(64,84,172,164,'#c8dbbb');r(64,158,172,90,'#b7d0ad');
    r(72,174,28,74,'#a0c09d');r(80,162,12,12,'#a0c09d');r(108,190,32,58,'#a3c59c');r(116,178,16,12,'#a3c59c');
    r(160,154,36,94,'#accba0');r(168,142,20,12,'#accba0');r(208,192,28,56,'#9dbc96');
    r(84,110,36,12,'#edf0d4');r(92,102,20,8,'#edf0d4');r(182,104,28,8,'#e2ebcb');
    r(144,76,8,180,'#edf0d4');r(56,164,188,8,'#edf0d4');r(40,260,220,8,'#b6c9a8');r(36,268,228,8,'#c7d5b9');
    // Shelf, jars and houseplant.
    r(294,144,202,8,'#a0b292');r(302,152,6,20,'#adbc9c');r(478,152,6,20,'#adbc9c');
    r(312,112,28,32,'#c3ceb1');r(308,108,36,8,'#718f75');r(316,120,20,16,'#e5e6c8');r(356,122,20,22,'#e7c2a0');r(354,118,24,4,'#b08c68');
    r(426,120,40,24,'#c7976d');r(430,144,32,4,'#a88763');r(438,90,4,30,'#719675');r(450,84,4,36,'#6e9372');r(424,96,16,8,'#7b9d77');r(418,88,12,8,'#7b9d77');r(452,92,20,8,'#87a87d');r(462,84,12,8,'#87a87d');
    // Hanging kitchen utensils.
    r(322,226,152,4,'#a0b298');for(let x=336;x<=464;x+=40){r(x,230,4,12,'#849e87');r(x,242,4,34,'#6e8980');}
    r(332,274,12,16,'#829b8b');r(372,274,12,20,'#a1b3a0');r(376,274,4,20,'#c6d1b6');r(450,274,30,22,'#6f897c');r(454,270,22,4,'#6f897c');r(454,280,22,12,'#94ab94');
    // Left counter / cutting board. The fish starts just above it.
    r(24,400,172,12,'#ad9972');r(24,404,172,4,'#c2b08a');r(32,412,156,68,'#aabc9e');r(36,418,148,58,'#c1ceb0');r(106,418,4,58,'#a5b698');r(90,432,8,4,'#7f967c');r(118,432,8,4,'#7f967c');
    r(44,388,120,12,'#d0b68b');r(52,388,108,4,'#e2c99b');r(144,392,8,4,'#baa27c');
    r(54,360,24,28,'#a6b7a0');r(50,356,32,4,'#829b85');r(62,344,4,12,'#7b937c');r(74,342,4,14,'#7b937c');
    // Range hood and oven shell. Open side faces the incoming fish.
    r(688,40,108,44,'#c7d5bb');r(692,40,100,44,'#d1ddc3');r(656,84,172,16,'#b9c9ae');r(640,100,204,16,'#a2b79f');r(644,116,196,8,'#d0dac1');
    r(626,160,286,308,'#59786b');r(630,160,278,8,'#98ad8e');r(622,168,290,40,'#829982');r(630,174,278,28,'#95aa8f');
    r(650,182,36,8,'#405f55');r(654,184,26,4,'#dbddbd');r(710,178,16,16,'#526f60');r(714,178,8,4,'#c5d0af');r(750,178,16,16,'#526f60');r(754,178,8,4,'#c5d0af');r(868,182,8,8,'#e2a575');
    r(614,210,286,16,'#4c6e60');r(628,226,258,222,'#2c4943');r(636,234,250,206,'#304f47');r(648,242,230,184,'#38584a');
    r(870,234,16,214,'#253f3c');r(628,440,258,8,'#263f3b');r(612,422,16,36,'#78947d');r(886,210,16,252,'#476858');r(902,208,10,260,'#6f8c76');
    // Interior rails and oven light.
    r(650,312,220,4,'#486951');r(650,356,220,4,'#486951');r(650,396,220,4,'#486951');r(852,254,8,8,'#d0b76f');r(848,262,16,4,'#6c7350');
    // The visible top and full rim width are also the collision/scoring surface.
    const tray = WORLD.tray;
    r(tray.left,tray.top,tray.right-tray.left,4,'#c1d1bb');r(660,402,204,10,'#9fb8ac');r(672,402,178,4,'#c8d5bc');r(660,408,204,4,'#829998');r(664,412,196,4,'#567976');
    // Open oven door, lower plinth and legs.
    r(522,450,100,8,'#729181');r(532,450,72,4,'#a7b9a0');r(514,458,112,8,'#476b5c');r(522,466,100,4,'#a8b89b');
    r(626,462,286,12,'#8ca388');r(636,474,14,8,'#507461');r(880,474,14,8,'#507461');
    // Small towel and flooring with tile seams.
    r(922,302,26,72,'#d0ad83');r(926,306,18,64,'#ead0a4');r(926,324,18,4,'#c79672');r(926,352,18,4,'#c79672');
    r(0,480,960,60,'#c2ccad');r(0,480,960,4,'#a4b396');r(0,504,960,2,'#b2be9e');
    for(let x=0;x<960;x+=128){r(x,484,2,20,'#b3bf9e');r(x+64,506,2,34,'#b3bf9e');}
    r(38,514,16,2,'#d4dac1');r(344,522,32,2,'#d4dac1');r(572,490,20,2,'#d4dac1');
    // Little stitched signature in the corner, part of the scene.
    c.font='10px monospace';c.fillStyle='#94a48c';c.fillText('KITCHEN / 01',32,38);
  }
}
