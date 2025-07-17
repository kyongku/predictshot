/* Bullet Hell Mathlab – Trig/Line/Quad Edition (π, ², 좌표축, 텍스트 가독성 개선) */
'use strict';

/* ---------- Config ---------- */
const CONFIG={
  canvas:{w:800,h:600},
  grid:{unit:50},
  player:{radius:5,speedEasy:300,speedHard:360,speedHC:360},
  bullets:{
    radius:4,
    startRateEasy:2,maxRateEasy:5,
    startRateHard:4,maxRateHard:10,
    spreadEasyDeg:7,spreadHardDeg:15,
    speedEasy:240,speedHard:300,
  },
  curves:{
    preEasy:2.5,preHard:1.25,preHC:0.35,
    activeEasy:1.0,activeHard:1.25,activeHC:0.60,
    intervalEasy:5.0,intervalHard:3.0,
  },
  startInvuln:1.0,
  storageKey:'bh_mathlab_scores_v2',
};

/* ---------- Enums ---------- */
const Mode=Object.freeze({MENU:0,PLAY:1,GAMEOVER:2});
const Diff=Object.freeze({EASY:'easy',HARD:'hard',HC:'hc'});

/* ---------- DOM ---------- */
const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
const uiMenu=document.getElementById('menu');
const uiGameOver=document.getElementById('gameover');
const btnEasy=document.getElementById('btn-easy');
const btnHard=document.getElementById('btn-hard');
const btnHC=document.getElementById('btn-hc');
const btnReturn=document.getElementById('btn-return');
const finalScoreEl=document.getElementById('final-score');
const bestScoreEl=document.getElementById('best-score');
const titleEl=document.getElementById('title'); // 제목 숨김용

function showTitle(){if(titleEl)titleEl.style.display='block';}
function hideTitle(){if(titleEl)titleEl.style.display='none';}

/* ---------- Input ---------- */
const keys={up:false,down:false,left:false,right:false};
window.addEventListener('keydown',e=>{
  switch(e.code){
    case'ArrowUp':case'KeyW':keys.up=true;break;
    case'ArrowDown':case'KeyS':keys.down=true;break;
    case'ArrowLeft':case'KeyA':keys.left=true;break;
    case'ArrowRight':case'KeyD':keys.right=true;break;
    case'KeyE':if(game.mode===Mode.MENU)startGame(Diff.EASY);break;
    case'KeyH':if(game.mode===Mode.MENU)startGame(Diff.HARD);break;
    case'KeyX':if(game.mode===Mode.MENU)startGame(Diff.HC);break;
  }
});
window.addEventListener('keyup',e=>{
  switch(e.code){
    case'ArrowUp':case'KeyW':keys.up=false;break;
    case'ArrowDown':case'KeyS':keys.down=false;break;
    case'ArrowLeft':case'KeyA':keys.left=false;break;
    case'ArrowRight':case'KeyD':keys.right=false;break;
  }
});
btnEasy.addEventListener('click',()=>startGame(Diff.EASY));
btnHard.addEventListener('click',()=>startGame(Diff.HARD));
btnHC.addEventListener('click',()=>startGame(Diff.HC));
btnReturn.addEventListener('click',returnToMenu);

/* ---------- Game State ---------- */
const game={
  mode:Mode.MENU,
  diff:Diff.EASY,
  time:0,
  player:null,
  bullets:[],
  curveLasers:[],
  hp:3,
  score:0,
  best:loadBest(),
  nextBulletTimer:0,
  nextCurveTimer:0,
  pendingCurve:null, // {text,poly} or {hc:true,list:[...]}
  curvePreTimer:0,
};
function loadBest(){
  try{
    const raw=localStorage.getItem(CONFIG.storageKey);
    if(!raw)return{easy:0,hard:0,hc:0};
    const o=JSON.parse(raw);
    return{easy:o.easy||0,hard:o.hard||0,hc:o.hc||0};
  }catch{
    return{easy:0,hard:0,hc:0};
  }
}
function saveBest(){try{localStorage.setItem(CONFIG.storageKey,JSON.stringify(game.best));}catch{}}

/* ---------- Entities ---------- */
class Player{
  constructor(x,y,r,s){this.x=x;this.y=y;this.r=r;this.s=s;}
  update(dt){
    let vx=0,vy=0;
    if(keys.left)vx--;
    if(keys.right)vx++;
    if(keys.up)vy--;
    if(keys.down)vy++;
    if(vx||vy){
      const inv=1/Math.hypot(vx,vy);
      vx*=inv;vy*=inv;
      this.x+=vx*this.s*dt;
      this.y+=vy*this.s*dt;
    }
    const W=CONFIG.canvas.w,H=CONFIG.canvas.h;
    if(this.x<this.r)this.x=this.r;
    if(this.x>W-this.r)this.x=W-this.r;
    if(this.y<this.r)this.y=this.r;
    if(this.y>H-this.r)this.y=H-this.r;
  }
  draw(){
    ctx.fillStyle='#0f0';
    ctx.beginPath();
    ctx.arc(this.x,this.y,this.r,0,Math.PI*2);
    ctx.fill();
  }
}
class Bullet{
  constructor(x,y,vx,vy,r){this.x=x;this.y=y;this.vx=vx;this.vy=vy;this.r=r;this.alive=true;}
  update(dt){
    this.x+=this.vx*dt;this.y+=this.vy*dt;
    const b=40,W=CONFIG.canvas.w,H=CONFIG.canvas.h;
    if(this.x<-b||this.x>W+b||this.y<-b||this.y>H+b)this.alive=false;
  }
  draw(){
    ctx.fillStyle='#ff0';
    ctx.beginPath();
    ctx.arc(this.x,this.y,this.r,0,Math.PI*2);
    ctx.fill();
  }
}
class CurveLaser{
  constructor(text,poly,dur){this.text=text;this.poly=poly;this.dur=dur;this.t=0;this.dead=false;}
  update(dt){this.t+=dt;if(this.t>=this.dur)this.dead=true;}
  draw(){
    if(this.dead)return;
    ctx.strokeStyle='rgba(255,0,255,.9)';
    ctx.lineWidth=4;
    ctx.beginPath();
    for(let i=0;i<this.poly.length;i++){
      const p=this.poly[i];
      if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
    }
    ctx.stroke();
  }
}

/* ---------- Math coord helpers ---------- */
const Wc=CONFIG.canvas.w,Hc=CONFIG.canvas.h,UNIT=CONFIG.grid.unit;
const CX=Wc/2,CY=Hc/2;
const toX=u=>CX+u*UNIT;
const toY=v=>CY-v*UNIT; // math +y up
const XMIN=-Wc/(2*UNIT),XMAX=Wc/(2*UNIT);
const YMIN=-Hc/(2*UNIT),YMAX=Hc/(2*UNIT);

/* ---------- formatting ---------- */
const SYM_PI='π';
const SUP2='²';
function fmtNum(v){const iv=Math.round(v);return Math.abs(v-iv)<1e-6?String(iv):(+v.toFixed(2))+'';}
function fmtCoeff(v,omit1=false){if(v===1&&omit1)return'';if(v===-1&&omit1)return'-';return fmtNum(v);}
function fmtPM(v){if(v===0)return'';return v>0?`+${fmtNum(v)}`:`${fmtNum(v)}`;}
function fmtPhase(phi){
  const PI=Math.PI,eps=1e-6;
  if(Math.abs(phi)<eps)return'';
  if(Math.abs(phi-PI/4)<eps)return`+${SYM_PI}/4`;
  if(Math.abs(phi+PI/4)<eps)return`-${SYM_PI}/4`;
  if(Math.abs(phi-PI/2)<eps)return`+${SYM_PI}/2`;
  if(Math.abs(phi+PI/2)<eps)return`-${SYM_PI}/2`;
  if(Math.abs(phi-PI)<eps)return`+${SYM_PI}`;
  if(Math.abs(phi+PI)<eps)return`-${SYM_PI}`;
  return phi>0?`+${fmtNum(phi)}`:`${fmtNum(phi)}`;
}

/* ---------- RNG helpers ---------- */
const choose=a=>a[(Math.random()*a.length)|0];
const rInt=(lo,hi)=>lo+((Math.random()*(hi-lo+1))|0); // inclusive

/* ---------- curve generators ---------- */
function genCurve(name){
  switch(name){
    case'sin':return genSinLike('sin');
    case'cos':return genSinLike('cos');
    case'tan':return genTan();
    case'line':return genLine();
    case'quad':return genQuad();
    default:return genLine();
  }
}
function genSinLike(kind){
  const A=rInt(1,5);
  const B=choose([0.5,1,2,3,4]);
  const D=rInt(-3,3);
  const N=400,poly=[];
  for(let i=0;i<=N;i++){
    const x=XMIN+(i/N)*(XMAX-XMIN);
    const y=A*(kind==='sin'?Math.sin(B*x):Math.cos(B*x))+D;
    if(y<YMIN-1||y>YMAX+1)continue;
    poly.push({x:toX(x),y:toY(y)});
  }
  const txt=`y=${fmtCoeff(A,true)}${kind}(${fmtNum(B)}x)${fmtPM(D)}`;
  return{text:txt,poly:ensurePoly(poly)};
}
function genTan(){
  const A=choose([0.5,1,1.5,2]);
  const B=choose([0.5,1,2]);
  const PHI=choose([0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2]);
  const N=600;
  const segs=[];let seg=[];
  for(let i=0;i<=N;i++){
    const x=XMIN+(i/N)*(XMAX-XMIN);
    const arg=B*x+PHI;
    if(Math.abs(Math.cos(arg))<0.05){if(seg.length>1)segs.push(seg);seg=[];continue;}
    const y=A*Math.tan(arg);
    if(y<YMIN-1||y>YMAX+1)continue;
    seg.push({x:toX(x),y:toY(y)});
  }
  if(seg.length>1)segs.push(seg);
  let poly=[];let m=0;
  for(const s of segs)if(s.length>m){m=s.length;poly=s;}
  if(!poly.length)poly=[{x:0,y:CY},{x:Wc,y:CY}];
  const txt=`y=${fmtCoeff(A,true)}tan(${fmtNum(B)}x${fmtPhase(PHI)})`;
  return{text:txt,poly};
}
function genLine(){
  if(Math.random()<0.2){ // vertical
    const c=rInt(Math.ceil(XMIN+1),Math.floor(XMAX-1));
    const xpx=toX(c);
    return{text:`x=${fmtNum(c)}`,poly:[{x:xpx,y:0},{x:xpx,y:Hc}]};
  }
  const m=choose([-4,-2,-1,-0.5,0,0.5,1,2,4]);
  const b=rInt(-5,5);
  const y1=m*XMIN+b,y2=m*XMAX+b;
  const poly=[{x:toX(XMIN),y:toY(y1)},{x:toX(XMAX),y:toY(y2)}];
  const txt=`y=${fmtCoeff(m,true)}x${fmtPM(b)}`;
  return{text:txt,poly:clipPolyPx(poly)};
}
function genQuad(){
  const h=rInt(-4,4),k=rInt(-3,3);
  const a=choose([-2,-1,-0.5,0.5,1,2]);
  const N=400,poly=[];
  for(let i=0;i<=N;i++){
    const x=XMIN+(i/N)*(XMAX-XMIN);
    const y=a*(x-h)*(x-h)+k;
    if(y<YMIN-1||y>YMAX+1)continue;
    poly.push({x:toX(x),y:toY(y)});
  }
  const A=a,B=-2*a*h,C=a*h*h+k;
  const txt=`y=${fmtCoeff(A,true)}x${SUP2}${fmtPM(B)}x${fmtPM(C)}`;
  return{text:txt,poly:ensurePoly(poly)};
}
function ensurePoly(poly){return poly.length>=2?poly:[{x:0,y:CY},{x:Wc,y:CY}];}
function clipPolyPx(poly){
  const res=[];
  for(const p of poly)if(p.x>=0&&p.x<=Wc&&p.y>=0&&p.y<=Hc)res.push(p);
  return ensurePoly(res.length?res:poly);
}

/* ---------- bullets ---------- */
function currentEdgeRate(){
  const t=game.time;
  if(game.diff===Diff.EASY){
    const s=CONFIG.bullets.startRateEasy,m=CONFIG.bullets.maxRateEasy;
    return s+(m-s)*Math.min(t/45,1);
  }else{
    const s=CONFIG.bullets.startRateHard,m=CONFIG.bullets.maxRateHard;
    return s+(m-s)*Math.min(t/45,1);
  }
}
function edgeSpreadRad(){return((game.diff===Diff.EASY)?CONFIG.bullets.spreadEasyDeg:CONFIG.bullets.spreadHardDeg)*Math.PI/180;}
function edgeBulletSpeed(){return(game.diff===Diff.EASY)?CONFIG.bullets.speedEasy:CONFIG.bullets.speedHard;}
function scheduleNextBullet(){game.nextBulletTimer=1/currentEdgeRate();}
function spawnEdgeBullets(dt){
  if(game.diff===Diff.HC)return;
  game.nextBulletTimer-=dt;
  while(game.nextBulletTimer<=0){emitEdgeBullet();scheduleNextBullet();}
}
function emitEdgeBullet(){
  const p=game.player;if(!p)return;
  const side=(Math.random()*4)|0;
  const buf=10;let x,y;
  if(side===0){x=Math.random()*Wc;y=-buf;}
  else if(side===1){x=Math.random()*Wc;y=Hc+buf;}
  else if(side===2){x=-buf;y=Math.random()*Hc;}
  else{x=Wc+buf;y=Math.random()*Hc;}
  const dx=p.x-x,dy=p.y-y;
  const ang0=Math.atan2(dy,dx);
  const ang=ang0+(Math.random()*2-1)*edgeSpreadRad();
  const v=edgeBulletSpeed();
  const vx=Math.cos(ang)*v,vy=Math.sin(ang)*v;
  game.bullets.push(new Bullet(x,y,vx,vy,CONFIG.bullets.radius));
}

/* ---------- curve scheduling (Easy/Hard) ---------- */
function scheduleNextCurve(){
  if(game.diff===Diff.HC)return;
  const mean=(game.diff===Diff.EASY)?CONFIG.curves.intervalEasy:CONFIG.curves.intervalHard;
  game.nextCurveTimer=-Math.log(Math.random())*mean;
}
function updateCurveTimer(dt){
  if(game.diff===Diff.HC)return;
  if(game.curvePreTimer>0){
    game.curvePreTimer-=dt;
    if(game.curvePreTimer<=0)activatePendingCurve();
    return;
  }
  game.nextCurveTimer-=dt;
  if(game.nextCurveTimer<=0){
    const name=choose(PRESET_NAMES);
    const c=genCurve(name);
    game.pendingCurve={text:c.text,poly:c.poly};
    game.curvePreTimer=(game.diff===Diff.EASY)?CONFIG.curves.preEasy:CONFIG.curves.preHard;
  }
}
function activatePendingCurve(){
  if(!game.pendingCurve)return;
  const dur=(game.diff===Diff.EASY)?CONFIG.curves.activeEasy:CONFIG.curves.activeHard;
  game.curveLasers.push(new CurveLaser(game.pendingCurve.text,game.pendingCurve.poly,dur));
  game.pendingCurve=null;
  scheduleNextCurve();
}

/* ---------- hardcore ---------- */
const HC_CYCLE=1.0;
function updateHardcore(dt){
  game.nextCurveTimer-=dt;
  if(game.curvePreTimer>0){
    game.curvePreTimer-=dt;
    if(game.curvePreTimer<=0)activatePendingCurveHC();
  }else if(game.nextCurveTimer<=0){
    const n1=choose(PRESET_NAMES),n2=choose(PRESET_NAMES);
    const c1=genCurve(n1),c2=genCurve(n2);
    game.pendingCurve={hc:true,list:[c1,c2]};
    game.curvePreTimer=CONFIG.curves.preHC;
    game.nextCurveTimer=HC_CYCLE;
  }
}
function activatePendingCurveHC(){
  if(!game.pendingCurve||!game.pendingCurve.hc)return;
  const dur=CONFIG.curves.activeHC;
  for(const c of game.pendingCurve.list){
    game.curveLasers.push(new CurveLaser(c.text,c.poly,dur));
  }
  game.pendingCurve=null;
}

/* ---------- collision ---------- */
function checkCollisions(){
  if(game.time<CONFIG.startInvuln)return;
  const p=game.player;if(!p)return;
  for(const b of game.bullets){
    if(!b.alive)continue;
    const dx=b.x-p.x,dy=b.y-p.y;
    if(dx*dx+dy*dy<=(b.r+p.r)**2){registerHit();b.alive=false;break;}
  }
  for(const L of game.curveLasers){
    if(L.dead)continue;
    if(distPointPoly(p.x,p.y,L.poly)<=p.r+2){registerHit();break;}
  }
}
function distPointPoly(px,py,poly){
  let best=Infinity;
  for(let i=0;i<poly.length-1;i++){
    const a=poly[i],b=poly[i+1];
    const d=distPointSeg(px,py,a.x,a.y,b.x,b.y);
    if(d<best)best=d;
  }
  return best;
}
function distPointSeg(px,py,x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy;
  if(l2===0)return Math.hypot(px-x1,py-y1);
  let t=((px-x1)*dx+(py-y1)*dy)/l2;
  t=Math.max(0,Math.min(1,t));
  const x=x1+t*dx,y=y1+t*dy;
  return Math.hypot(px-x,py-y);
}
function registerHit(){
  if(game.diff===Diff.EASY){if(--game.hp<=0)endGame();}
  else endGame();
}

/* ---------- flow ---------- */
function startGame(diff){
  game.mode=Mode.PLAY;game.diff=diff;game.time=0;game.score=0;
  const speed=(diff===Diff.EASY)?CONFIG.player.speedEasy:(diff===Diff.HARD?CONFIG.player.speedHard:CONFIG.player.speedHC);
  game.player=new Player(CX,CY,CONFIG.player.radius,speed);
  game.bullets.length=0;game.curveLasers.length=0;
  game.hp=(diff===Diff.EASY)?3:1;
  hideMenu();hideGameOver();hideTitle();
  if(diff===Diff.HC){game.nextCurveTimer=0;game.curvePreTimer=0;}
  else{scheduleNextCurve();scheduleNextBullet();}
  running=true;lastTime=performance.now();requestAnimationFrame(loop);
}
function endGame(){
  if(game.mode!==Mode.PLAY)return;
  game.mode=Mode.GAMEOVER;running=false;game.score=game.time;
  if(game.diff===Diff.EASY){if(game.score>game.best.easy){game.best.easy=game.score;saveBest();}}
  else if(game.diff===Diff.HARD){if(game.score>game.best.hard){game.best.hard=game.score;saveBest();}}
  else{if(game.score>game.best.hc){game.best.hc=game.score;saveBest();}}
  showGameOver();showTitle();
}
function returnToMenu(){game.mode=Mode.MENU;running=false;showMenu();hideGameOver();showTitle();}

/* ---------- UI ---------- */
function showMenu(){uiMenu.classList.remove('hidden');}
function hideMenu(){uiMenu.classList.add('hidden');}
function showGameOver(){
  finalScoreEl.textContent=`Score: ${game.score.toFixed(1)}s`;
  const best=(game.diff===Diff.EASY)?game.best.easy:(game.diff===Diff.HARD)?game.best.hard:game.best.hc;
  bestScoreEl.textContent=`Best: ${best.toFixed(1)}s`;
  uiGameOver.classList.remove('hidden');
}
function hideGameOver(){uiGameOver.classList.add('hidden');}

/* ---------- HUD ---------- */
function drawHUD(){
  if(game.mode!==Mode.PLAY)return;
  ctx.fillStyle='#fff';ctx.font='16px monospace';ctx.textAlign='left';
  ctx.fillText(`Time: ${game.time.toFixed(1)}s`,8,20);
  if(game.diff===Diff.EASY)ctx.fillText(`HP: ${game.hp}`,8,40);

  if(game.pendingCurve){
    ctx.textAlign='center';
    ctx.font='20px monospace';
    const txts=game.pendingCurve.hc
      ? [game.pendingCurve.list[0].text,game.pendingCurve.list[1].text]
      : [game.pendingCurve.text];
    ctx.fillStyle='#ff8';
    ctx.strokeStyle='rgba(0,0,0,.9)';
    ctx.lineWidth=4;
    let y=60;
    for(const t of txts){
      const msg=`NEXT: ${t}`;
      ctx.strokeText(msg,CX,y);
      ctx.fillText(msg,CX,y);
      y+=22;
    }
  }
}

/* ---------- render ---------- */
function render(){
  ctx.clearRect(0,0,Wc,Hc);
  drawGrid();
  for(const c of game.curveLasers)c.draw();
  for(const b of game.bullets)b.draw();
  game.player.draw();
  drawHUD();
}

/* ---------- grid ---------- */
function drawGrid(){
  const unit=UNIT,cx=CX,cy=CY;
  // minor grid
  ctx.strokeStyle='rgba(255,255,255,.05)';
  ctx.lineWidth=1;
  for(let x=0;x<=Wc;x+=unit){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,Hc);ctx.stroke();}
  for(let y=0;y<=Hc;y+=unit){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(Wc,y);ctx.stroke();}
  // axes
  ctx.strokeStyle='rgba(255,255,255,.5)';
  ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(Wc,cy);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,Hc);ctx.stroke();
  // ticks + labels
  ctx.strokeStyle='rgba(255,255,255,.5)';
  ctx.fillStyle='#ccc';ctx.font='12px monospace';
  ctx.textAlign='center';
  const maxX=Math.floor(Wc/(2*unit));
  for(let i=-maxX;i<=maxX;i++){
    if(i===0)continue;
    const x=cx+i*unit;
    ctx.beginPath();ctx.moveTo(x,cy-4);ctx.lineTo(x,cy+4);ctx.stroke();
    ctx.fillText(i+'',x,cy+14);
  }
  ctx.textAlign='right';
  const maxY=Math.floor(Hc/(2*unit));
  for(let j=-maxY;j<=maxY;j++){
    if(j===0)continue;
    const y=cy-j*unit;
    ctx.beginPath();ctx.moveTo(cx-4,y);ctx.lineTo(cx+4,y);ctx.stroke();
    ctx.fillText(j+'',cx-6,y+4);
  }
  ctx.textAlign='left';ctx.fillStyle='#fff';
  ctx.fillText('0',cx+4,cy-4);
}

/* ---------- main loop ---------- */
let running=false,lastTime=0;
function loop(ts){
  if(!running)return;
  const dt=Math.min((ts-lastTime)/1000,0.1);
  lastTime=ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
function update(dt){
  game.time+=dt;
  game.player.update(dt);
  if(game.diff===Diff.HC)updateHardcore(dt);
  else{updateCurveTimer(dt);spawnEdgeBullets(dt);}
  for(const b of game.bullets)b.update(dt);
  for(const c of game.curveLasers)c.update(dt);
  game.bullets=game.bullets.filter(b=>b.alive);
  game.curveLasers=game.curveLasers.filter(c=>!c.dead);
  checkCollisions();
}

/* ---------- init ---------- */
const PRESET_NAMES=['sin','cos','tan','line','quad']; // 최종 프리셋
showMenu();hideGameOver();
window.addEventListener('resize',()=>{});
