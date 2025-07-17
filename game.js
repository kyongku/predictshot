 * ========================= *//* --------------------------------------------------
 * Bullet Hell Mathlab
 * --------------------------------------------------
 * - No faint curve preview. HUD text announces next function.
 * - Curve appears as an immediate, static laser for active duration.
 * - Edge bullets spawn from screen edges toward player with spread.
 * - Hardcore: 2 random functions every 1s, text pre 0.35s, no bullets.
 * - Presets: sine, circle, parabola, line, rose. (No custom input.)
 * -------------------------------------------------- */
'use strict';

/* =========================
 * Config
 * ========================= */
const CONFIG = {
  canvas: { w: 800, h: 600 },
  player: { radius: 5, speedEasy: 300, speedHard: 360, speedHC: 360 },
  bullets: {
    radius: 4,
    startRateEasy: 2, maxRateEasy: 5, // bullets/sec
    startRateHard: 4, maxRateHard: 10,
    spreadEasyDeg: 7, spreadHardDeg: 15,
    speedEasy: 240, speedHard: 300,
  },
  curves: {
    preEasy: 2.5, preHard: 1.25, preHC: 0.35, // seconds text-only warn
    activeEasy: 1.0, activeHard: 1.25, activeHC: 0.60, // seconds laser active
    intervalEasy: 5.0, intervalHard: 3.0, // mean seconds between curve attacks (Easy/Hard only)
  },
  startInvuln: 1.0, // all modes
  storageKey: 'bh_mathlab_scores_v0',
};

/* =========================
 * Modes
 * ========================= */
const Mode = Object.freeze({ MENU:0, PLAY:1, GAMEOVER:2 });
const Diff = Object.freeze({ EASY:'easy', HARD:'hard', HC:'hc' });

/* =========================
 * DOM
 * ========================= */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const uiMenu = document.getElementById('menu');
const uiGameOver = document.getElementById('gameover');
const btnEasy = document.getElementById('btn-easy');
const btnHard = document.getElementById('btn-hard');
const btnHC = document.getElementById('btn-hc');
const btnReturn = document.getElementById('btn-return');
const finalScoreEl = document.getElementById('final-score');
const bestScoreEl = document.getElementById('best-score');

/* =========================
 * Input
 * ========================= */
const keys = {up:false,down:false,left:false,right:false};
window.addEventListener('keydown', (e)=>{
  switch(e.code){
    case 'ArrowUp': case 'KeyW': keys.up=true; break;
    case 'ArrowDown': case 'KeyS': keys.down=true; break;
    case 'ArrowLeft': case 'KeyA': keys.left=true; break;
    case 'ArrowRight': case 'KeyD': keys.right=true; break;
    case 'KeyE': if(game.mode===Mode.MENU) startGame(Diff.EASY); break;
    case 'KeyH': if(game.mode===Mode.MENU) startGame(Diff.HARD); break;
    case 'KeyX': if(game.mode===Mode.MENU) startGame(Diff.HC); break;
  }
});
window.addEventListener('keyup', (e)=>{
  switch(e.code){
    case 'ArrowUp': case 'KeyW': keys.up=false; break;
    case 'ArrowDown': case 'KeyS': keys.down=false; break;
    case 'ArrowLeft': case 'KeyA': keys.left=false; break;
    case 'ArrowRight': case 'KeyD': keys.right=false; break;
  }
});
btnEasy.addEventListener('click',()=>startGame(Diff.EASY));
btnHard.addEventListener('click',()=>startGame(Diff.HARD));
btnHC.addEventListener('click',()=>startGame(Diff.HC));
btnReturn.addEventListener('click',returnToMenu);

/* =========================
 * Game State
 * ========================= */
const game = {
  mode: Mode.MENU,
  diff: Diff.EASY,
  time: 0,
  player: null,
  bullets: [],
  curveLasers: [],
  hp: 3,
  score: 0,
  best: loadBest(),
  nextBulletTimer: 0,
  nextCurveTimer: 0,
  pendingCurve: null,   // {name, poly}
  curvePreTimer: 0,     // countdown during pre warn
};

function loadBest(){
  try{ const raw=localStorage.getItem(CONFIG.storageKey); if(!raw) return {easy:0,hard:0,hc:0};
    const obj=JSON.parse(raw); return {easy:obj.easy||0,hard:obj.hard||0,hc:obj.hc||0}; }
  catch{ return {easy:0,hard:0,hc:0}; }
}
function saveBest(){ try{localStorage.setItem(CONFIG.storageKey,JSON.stringify(game.best));}catch{} }

/* =========================
 * Entities
class Player{constructor(x,y,r,s){this.x=x;this.y=y;this.r=r;this.s=s;}update(dt){let vx=0,vy=0; if(keys.left)vx--; if(keys.right)vx++; if(keys.up)vy--; if(keys.down)vy++; if(vx||vy){const inv=1/Math.hypot(vx,vy);vx*=inv;vy*=inv;this.x+=vx*this.s*dt;this.y+=vy*this.s*dt;} // clamp
  if(this.x<this.r)this.x=this.r; if(this.x>CONFIG.canvas.w-this.r)this.x=CONFIG.canvas.w-this.r; if(this.y<this.r)this.y=this.r; if(this.y>CONFIG.canvas.h-this.r)this.y=CONFIG.canvas.h-this.r;}
  draw(){ctx.fillStyle='#0f0';ctx.beginPath();ctx.arc(this.x,this.y,this.r,0,Math.PI*2);ctx.fill();}}

class Bullet{constructor(x,y,vx,vy,r){this.x=x;this.y=y;this.vx=vx;this.vy=vy;this.r=r;this.alive=true;}update(dt){this.x+=this.vx*dt;this.y+=this.vy*dt;const b=40;if(this.x<-b||this.x>CONFIG.canvas.w+b||this.y<-b||this.y>CONFIG.canvas.h+b)this.alive=false;}draw(){ctx.fillStyle='#ff0';ctx.beginPath();ctx.arc(this.x,this.y,this.r,0,Math.PI*2);ctx.fill();}}

// CurveLaser: static polyline laser with active clock
class CurveLaser{constructor(name,poly,activeDur){this.name=name;this.poly=poly;this.activeDur=activeDur;this.t=0;this.dead=false;}update(dt){this.t+=dt;if(this.t>=this.activeDur)this.dead=true;}draw(){if(this.dead)return;ctx.strokeStyle='rgba(255,0,255,0.9)';ctx.lineWidth=4;ctx.beginPath();for(let i=0;i<this.poly.length;i++){const p=this.poly[i];if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}ctx.stroke();}}

/* =========================
 * Preset Curves → polyline in canvas space
 * ========================= */
function genCurve(name,W,H){
  switch(name){
    case 'sine': return genSine(W,H);
    case 'circle': return genCircle(W,H);
    case 'parabola': return genParabola(W,H);
    case 'line': return genLine(W,H);
    case 'rose': return genRose(W,H);
    default: return genLine(W,H); // fallback
  }
}

function genSine(W,H){
  const A = H*0.3; // amplitude
  const k = 2+Math.floor(Math.random()*3); // 2~4 periods across screen
  const mid = H*0.5;
  const poly=[]; const N=200;
  for(let i=0;i<=N;i++){const x=(i/N)*W; const y=mid + A*Math.sin((k*2*Math.PI*x)/W); poly.push({x,y});}
  return {text:`y=A*sin(${k}x)+B`,poly};
}

function genCircle(W,H){
  const R = Math.min(W,H)*0.4;
  const xc=W/2, yc=H/2;
  const top = Math.random()<0.5; // top arc or bottom arc
  const poly=[]; const N=200;
  const start=top?Math.PI:0; const end=top?2*Math.PI:Math.PI; // half circle
  for(let i=0;i<=N;i++){const t=start+(i/N)*(end-start); const x=xc+R*Math.cos(t); const y=yc+R*Math.sin(t); poly.push({x,y});}
  return {text:`(x-xc)^2+(y-yc)^2=${R|0}^2`,poly};
}

function genParabola(W,H){
  const openUp = Math.random()<0.5;
  const xc=W/2; const yc=openUp?H*0.2:H*0.8; // vertex
  const a=(openUp?1:-1)*(H*0.6)/(Math.pow(W/2,2)); // scale so edges near opposite side
  const poly=[]; const N=200;
  for(let i=0;i<=N;i++){const x=(i/N)*W; const dx=x-xc; let y=yc + a*dx*dx; poly.push({x, y});}
  return {text:`y=a(x-xc)^2+yc`,poly:clipPoly(poly,H)};
}

function genLine(W,H){
  // random slope & intercept ensuring line crosses screen bounds
  const x1=Math.random()*W, y1=Math.random()*H;
  const ang=Math.random()*Math.PI; // 0..180deg
  const len=Math.max(W,H)*1.5;
  const x2=x1+Math.cos(ang)*len;
  const y2=y1+Math.sin(ang)*len;
  const poly=[{x:x1,y:y1},{x:x2,y:y2}];
  return {text:`line`, poly:clipPoly(poly,H,W)};
}

function genRose(W,H){
  const k = 5; // petals
  const R = Math.min(W,H)*0.45;
  const poly=[]; const N=400;
  for(let i=0;i<=N;i++){
    const th=(i/N)*Math.PI*2;
    const r=R*Math.cos(k*th);
    const x=W/2 + r*Math.cos(th);
    const y=H/2 + r*Math.sin(th);
    poly.push({x,y});
  }
  return {text:`rose(k=${k})`,poly};
}

function clipPoly(poly,H,W=CONFIG.canvas.w){
  // crude clip: drop points out of bounds; if all drop, return center line
  const res=[]; for(const p of poly){ if(p.x>=0&&p.x<=W&&p.y>=0&&p.y<=H) res.push(p); }
  if(res.length<2) return [{x:0,y:H/2},{x:W,y:H/2}];
  return res;
}

/* =========================
 * Edge Bullet Spawning
 * ========================= */
function currentEdgeRate(){
  const t=game.time; if(game.diff===Diff.EASY){const s=CONFIG.bullets.startRateEasy,m=CONFIG.bullets.maxRateEasy;return s+(m-s)*Math.min(t/45,1);} else {const s=CONFIG.bullets.startRateHard,m=CONFIG.bullets.maxRateHard;return s+(m-s)*Math.min(t/45,1);} }
function edgeSpreadRad(){
  const deg=(game.diff===Diff.EASY)?CONFIG.bullets.spreadEasyDeg:CONFIG.bullets.spreadHardDeg; return deg*Math.PI/180; }
function edgeBulletSpeed(){ return (game.diff===Diff.EASY)?CONFIG.bullets.speedEasy:CONFIG.bullets.speedHard; }

function scheduleNextBullet(){const rate=currentEdgeRate(); game.nextBulletTimer=1/rate;}
function spawnEdgeBullets(dt){
  if(game.diff===Diff.HC) return; // no bullets in hardcore
  game.nextBulletTimer-=dt; while(game.nextBulletTimer<=0){emitEdgeBullet(); scheduleNextBullet();}
}

function emitEdgeBullet(){
  const W=CONFIG.canvas.w,H=CONFIG.canvas.h; const p=game.player; if(!p)return;
  const side=Math.floor(Math.random()*4); //0t 1b 2l 3r
  let x,y; const buf=10;
  if(side===0){x=Math.random()*W;y=-buf;} else if(side===1){x=Math.random()*W;y=H+buf;} else if(side===2){x=-buf;y=Math.random()*H;} else {x=W+buf;y=Math.random()*H;}
  // aim at player
  let dx=p.x-x,dy=p.y-y; const ang0=Math.atan2(dy,dx);
  const spread=edgeSpreadRad(); const ang=ang0 + (Math.random()*2-1)*spread; const v=edgeBulletSpeed();
  const vx=Math.cos(ang)*v, vy=Math.sin(ang)*v;
  game.bullets.push(new Bullet(x,y,vx,vy,CONFIG.bullets.radius));
}

/* =========================
 * Curve Attack Scheduling (Easy/Hard)
 * ========================= */
function scheduleNextCurve(){
  if(game.diff===Diff.HC) return; // handled separately
  const mean=(game.diff===Diff.EASY)?CONFIG.curves.intervalEasy:CONFIG.curves.intervalHard;
  game.nextCurveTimer = -Math.log(Math.random())*mean; // exponential spacing
}

function updateCurveTimer(dt){
  if(game.diff===Diff.HC) return; // n/a
  if(game.curvePreTimer>0){
    game.curvePreTimer-=dt; if(game.curvePreTimer<=0){ activatePendingCurve(); }
    return;
  }
  game.nextCurveTimer-=dt;
  if(game.nextCurveTimer<=0){
    // pick a new curve
    const name=choose(PRESET_NAMES);
    const c=genCurve(name,CONFIG.canvas.w,CONFIG.canvas.h);
    game.pendingCurve={name,poly:c.poly,text:c.text};
    game.curvePreTimer=(game.diff===Diff.EASY)?CONFIG.curves.preEasy:CONFIG.curves.preHard;
  }
}

function activatePendingCurve(){
  if(!game.pendingCurve) return;
  const active=(game.diff===Diff.EASY)?CONFIG.curves.activeEasy:CONFIG.curves.activeHard;
  game.curveLasers.push(new CurveLaser(game.pendingCurve.name,game.pendingCurve.poly,active));
  game.pendingCurve=null;
  scheduleNextCurve();
}

/* =========================
 * Hardcore Curve Loop (no bullets)
 * ========================= */
const HC_CYCLE = 1.0; // seconds
function updateHardcore(dt){
  // Use nextCurveTimer as cycle timer
  game.nextCurveTimer-=dt;
  if(game.curvePreTimer>0){
    game.curvePreTimer-=dt; if(game.curvePreTimer<=0){ activatePendingCurveHC(); }
  } else if(game.nextCurveTimer<=0){
    // pick two distinct curves
    let n1=choose(PRESET_NAMES), n2=choose(PRESET_NAMES); if(n2===n1) n2=choose(PRESET_NAMES);
    const c1=genCurve(n1,CONFIG.canvas.w,CONFIG.canvas.h);
    const c2=genCurve(n2,CONFIG.canvas.w,CONFIG.canvas.h);
    game.pendingCurve={hc:true,list:[{name:n1,poly:c1.poly,text:c1.text},{name:n2,poly:c2.poly,text:c2.text}]};
    game.curvePreTimer=CONFIG.curves.preHC;
    game.nextCurveTimer=HC_CYCLE; // schedule next cycle start
  }
}
function activatePendingCurveHC(){
  if(!game.pendingCurve||!game.pendingCurve.hc)return;
  const active=CONFIG.curves.activeHC;
  for(const c of game.pendingCurve.list){ game.curveLasers.push(new CurveLaser(c.name,c.poly,active)); }
  game.pendingCurve=null;
}

/* =========================
 * Collision
 * ========================= */
function checkCollisions(){
  if(game.time < CONFIG.startInvuln) return;
  const p=game.player; if(!p) return;
  // bullets (no bullets in HC but safe)
  for(const b of game.bullets){ if(!b.alive) continue; const dx=b.x-p.x,dy=b.y-p.y; const rr=(b.r+p.r)**2; if(dx*dx+dy*dy<=rr){ registerHit(); b.alive=false; break; } }
  // curves
  for(const L of game.curveLasers){ if(L.dead) continue; if(distPointPoly(p.x,p.y,L.poly) <= p.r+2){ registerHit(); break; } }
}

function distPointPoly(px,py,poly){
  let best=Infinity; for(let i=0;i<poly.length-1;i++){const a=poly[i],b=poly[i+1];const d=distPointSeg(px,py,a.x,a.y,b.x,b.y); if(d<best)best=d;} return best;}
function distPointSeg(px,py,x1,y1,x2,y2){
  const dx=x2-x1, dy=y2-y1; const l2=dx*dx+dy*dy; if(l2===0){const dxp=px-x1,dyp=py-y1;return Math.hypot(dxp,dyp);} let t=((px-x1)*dx+(py-y1)*dy)/l2; t=Math.max(0,Math.min(1,t)); const x=x1+t*dx, y=y1+t*dy; return Math.hypot(px-x,py-y); }

function registerHit(){
  if(game.diff===Diff.EASY){ if(--game.hp<=0) endGame(); }
  else { endGame(); }
}

/* =========================
 * Flow
 * ========================= */
function startGame(diff){
  game.mode=Mode.PLAY; game.diff=diff; game.time=0; game.score=0;
  game.player=new Player(CONFIG.canvas.w/2,CONFIG.canvas.h/2,CONFIG.player.radius,
    diff===Diff.EASY?CONFIG.player.speedEasy:(diff===Diff.HARD?CONFIG.player.speedHard:CONFIG.player.speedHC));
  game.bullets.length=0; game.curveLasers.length=0; game.hp=(diff===Diff.EASY)?3:1;
  hideMenu(); hideGameOver();
  // timers
  if(diff===Diff.HC){ game.nextCurveTimer=0; game.curvePreTimer=0; }
  else { scheduleNextCurve(); scheduleNextBullet(); }
  running=true; lastTime=performance.now(); requestAnimationFrame(loop);
}

function endGame(){
  if(game.mode!==Mode.PLAY)return; game.mode=Mode.GAMEOVER; running=false; game.score=game.time;
  if(game.diff===Diff.EASY){ if(game.score>game.best.easy){game.best.easy=game.score;saveBest();}}
  else if(game.diff===Diff.HARD){ if(game.score>game.best.hard){game.best.hard=game.score;saveBest();}}
  else { if(game.score>game.best.hc){game.best.hc=game.score;saveBest();}}
  showGameOver();
}

function returnToMenu(){ game.mode=Mode.MENU; running=false; showMenu(); hideGameOver(); }

/* =========================
 * HUD & UI
 * ========================= */
function showMenu(){uiMenu.classList.remove('hidden');}
function hideMenu(){uiMenu.classList.add('hidden');}
function showGameOver(){
  finalScoreEl.textContent=`Score: ${game.score.toFixed(1)}s`;
  let best=(game.diff===Diff.EASY)?game.best.easy:(game.diff===Diff.HARD?game.best.hard:game.best.hc);
  bestScoreEl.textContent=`Best: ${best.toFixed(1)}s`; uiGameOver.classList.remove('hidden');
}
function hideGameOver(){uiGameOver.classList.add('hidden');}

/* HUD during play */
function drawHUD(){
  if(game.mode!==Mode.PLAY)return; ctx.fillStyle='#fff'; ctx.font='16px monospace'; ctx.textAlign='left'; ctx.fillText(`Time: ${game.time.toFixed(1)}s`,8,20);
  if(game.diff===Diff.EASY) ctx.fillText(`HP: ${game.hp}`,8,40);
  // curve announce text center-top
  if(game.pendingCurve){
    ctx.textAlign='center'; ctx.font='18px monospace';
    let txt;
    if(game.pendingCurve.hc){ // hardcore bundle
      const n1=game.pendingCurve.list[0].text, n2=game.pendingCurve.list[1].text;
      txt=`NEXT: ${n1} + ${n2}`;
    } else {
      txt=`NEXT: ${game.pendingCurve.text}`;
    }
    ctx.fillStyle='#ff8'; ctx.fillText(txt,CONFIG.canvas.w/2,60);
  }
}

/* =========================
 * Loop
 * ========================= */
let running=false; let lastTime=0;
function loop(ts){ if(!running)return; const dt=clampDt((ts-lastTime)/1000); lastTime=ts; update(dt); render(); requestAnimationFrame(loop);}
function clampDt(dt){return dt>0.1?0.1:dt;}

function update(dt){
  game.time+=dt; game.player.update(dt);
  if(game.diff===Diff.HC){ updateHardcore(dt); }
  else { updateCurveTimer(dt); spawnEdgeBullets(dt); }
  // update bullets
  for(const b of game.bullets) b.update(dt);
  // update curves
  for(const c of game.curveLasers) c.update(dt);
  // gc
  game.bullets=game.bullets.filter(b=>b.alive);
  game.curveLasers=game.curveLasers.filter(c=>!c.dead);
  // collision
  checkCollisions();
}

function render(){
  ctx.clearRect(0,0,CONFIG.canvas.w,CONFIG.canvas.h);
  drawGrid();
  // draw curves
  for(const c of game.curveLasers) c.draw();
  // draw bullets
  for(const b of game.bullets) b.draw();
  // player
  game.player.draw();
  // HUD
  drawHUD();
}

function drawGrid(){
  const spacing=50; ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=1;
  for(let x=0;x<=CONFIG.canvas.w;x+=spacing){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,CONFIG.canvas.h);ctx.stroke();}
  for(let y=0;y<=CONFIG.canvas.h;y+=spacing){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(CONFIG.canvas.w,y);ctx.stroke();}
}

/* =========================
 * Init
 * ========================= */
const PRESET_NAMES=['sine','circle','parabola','line','rose'];
showMenu(); hideGameOver();
window.addEventListener('resize',()=>{});
