/* Bullet Hell Mathlab (compact build) */
'use strict';

const CONFIG = {
  canvas:{w:800,h:600},
  grid: { unit: 50 },
  player:{r:5,speedEasy:300,speedHard:360,speedHC:360},
  bullets:{r:4,startRateEasy:2,maxRateEasy:5,startRateHard:4,maxRateHard:10,spreadEasyDeg:7,spreadHardDeg:15,speedEasy:240,speedHard:300},
  curves:{preEasy:2.5,preHard:1.25,preHC:0.35,activeEasy:1.0,activeHard:1.25,activeHC:0.6,intervalEasy:5,intervalHard:3},
  startInvuln:1.0,
  storageKey:'bh_mathlab_scores_v0'
};

const Mode={MENU:0,PLAY:1,GO:2};
const Diff={EASY:'easy',HARD:'hard',HC:'hc'};

const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
const uiMenu=document.getElementById('menu');
const uiGO=document.getElementById('gameover');
const btnEasy=document.getElementById('btn-easy');
const btnHard=document.getElementById('btn-hard');
const btnHC=document.getElementById('btn-hc');
const btnReturn=document.getElementById('btn-return');
const finalScoreEl=document.getElementById('final-score');
const bestScoreEl=document.getElementById('best-score');
const titleEl = document.getElementById('title');
// ----- Title visibility helpers -----
function showTitle(){ if (titleEl) titleEl.style.display = 'block'; }
function hideTitle(){ if (titleEl) titleEl.style.display = 'none'; }
  

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
  }});
window.addEventListener('keyup',e=>{
  switch(e.code){
    case'ArrowUp':case'KeyW':keys.up=false;break;
    case'ArrowDown':case'KeyS':keys.down=false;break;
    case'ArrowLeft':case'KeyA':keys.left=false;break;
    case'ArrowRight':case'KeyD':keys.right=false;break;
  }});
btnEasy.addEventListener('click',()=>startGame(Diff.EASY));
btnHard.addEventListener('click',()=>startGame(Diff.HARD));
btnHC.addEventListener('click',()=>startGame(Diff.HC));
btnReturn.addEventListener('click',returnToMenu);

const game={
  mode:Mode.MENU,diff:Diff.EASY,time:0,
  player:null,bullets:[],curveLasers:[],
  hp:3,score:0,
  best:loadBest(),
  nextBulletTimer:0,nextCurveTimer:0,
  pendingCurve:null,curvePreTimer:0
};

function loadBest(){
  try{
    const raw=localStorage.getItem(CONFIG.storageKey);
    if(!raw)return{easy:0,hard:0,hc:0};
    const o=JSON.parse(raw);
    return{easy:o.easy||0,hard:o.hard||0,hc:o.hc||0};
  }catch(e){return{easy:0,hard:0,hc:0};}
}
function saveBest(){try{localStorage.setItem(CONFIG.storageKey,JSON.stringify(game.best));}catch(e){}}

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
  draw(){ctx.fillStyle='#0f0';ctx.beginPath();ctx.arc(this.x,this.y,this.r,0,Math.PI*2);ctx.fill();}
}

class Bullet{
  constructor(x,y,vx,vy,r){this.x=x;this.y=y;this.vx=vx;this.vy=vy;this.r=r;this.alive=true;}
  update(dt){
    this.x+=this.vx*dt;this.y+=this.vy*dt;
    const b=40,W=CONFIG.canvas.w,H=CONFIG.canvas.h;
    if(this.x<-b||this.x>W+b||this.y<-b||this.y>H+b)this.alive=false;
  }
  draw(){ctx.fillStyle='#ff0';ctx.beginPath();ctx.arc(this.x,this.y,this.r,0,Math.PI*2);ctx.fill();}
}

class CurveLaser{
  constructor(name,poly,dur){this.name=name;this.poly=poly;this.dur=dur;this.t=0;this.dead=false;}
  update(dt){this.t+=dt;if(this.t>=this.dur)this.dead=true;}
  draw(){
    if(this.dead)return;
    ctx.strokeStyle='rgba(255,0,255,0.9)';
    ctx.lineWidth=4;
    ctx.beginPath();
    for(let i=0;i<this.poly.length;i++){
      const p=this.poly[i];
      if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
    }
    ctx.stroke();
  }
}

const PRESET_NAMES=['sine','circle','parabola','line','rose'];
const rnd=a=>Math.random()*a;
const choose=arr=>arr[(Math.random()*arr.length)|0];

function genCurve(name,W,H){
  switch(name){
    case'sine':return genSine(W,H);
    case'circle':return genCircle(W,H);
    case'parabola':return genParabola(W,H);
    case'line':return genLine(W,H);
    case'rose':return genRose(W,H);
    default:return genLine(W,H);
  }
}
function genSine(W,H){
  const A=H*0.3;
  const k=2+Math.floor(Math.random()*3);
  const mid=H*0.5;
  const N=200,poly=[];
  for(let i=0;i<=N;i++){
    const x=(i/N)*W;
    const y=mid+A*Math.sin((k*2*Math.PI*x)/W);
    poly.push({x,y});
  }
  return{text:`y=A*sin(${k}x)+B`,poly};
}
function genCircle(W,H){
  const R=Math.min(W,H)*0.4;
  const xc=W/2,yc=H/2;
  const top=Math.random()<0.5;
  const start=top?Math.PI:0,end=top?2*Math.PI:Math.PI;
  const N=200,poly=[];
  for(let i=0;i<=N;i++){
    const t=start+(i/N)*(end-start);
    poly.push({x:xc+R*Math.cos(t),y:yc+R*Math.sin(t)});
  }
  return{text:`(x-xc)^2+(y-yc)^2=${R|0}^2`,poly};
}
function genParabola(W,H){
  const openUp=Math.random()<0.5;
  const xc=W/2,yc=openUp?H*0.2:H*0.8;
  const a=(openUp?1:-1)*(H*0.6)/Math.pow(W/2,2);
  const N=200,poly=[];
  for(let i=0;i<=N;i++){
    const x=(i/N)*W;
    const dx=x-xc;
    const y=yc+a*dx*dx;
    poly.push({x,y});
  }
  return{text:'y=a(x-xc)^2+yc',poly:clipPoly(poly,H,W)};
}
function genLine(W,H){
  const x1=Math.random()*W,y1=Math.random()*H;
  const ang=Math.random()*Math.PI;
  const len=Math.max(W,H)*1.5;
  const x2=x1+Math.cos(ang)*len;
  const y2=y1+Math.sin(ang)*len;
  const poly=clipPoly([{x:x1,y:y1},{x:x2,y:y2}],H,W);
  return{text:'line',poly};
}
function genRose(W,H){
  const k=5;
  const R=Math.min(W,H)*0.45;
  const N=400,poly=[];
  for(let i=0;i<=N;i++){
    const th=(i/N)*Math.PI*2;
    const r=R*Math.cos(k*th);
    poly.push({x:W/2+r*Math.cos(th),y:H/2+r*Math.sin(th)});
  }
  return{text:`rose(k=${k})`,poly};
}
function clipPoly(poly,H,W){
  if(W===undefined)W=CONFIG.canvas.w;
  const res=[];
  for(const p of poly){
    if(p.x>=0&&p.x<=W&&p.y>=0&&p.y<=H)res.push(p);
  }
  if(res.length<2)return[{x:0,y:H/2},{x:W,y:H/2}];
  return res;
}

/* edge bullet spawn */
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
function edgeSpreadRad(){
  const deg=(game.diff===Diff.EASY)?CONFIG.bullets.spreadEasyDeg:CONFIG.bullets.spreadHardDeg;
  return deg*Math.PI/180;
}
function edgeBulletSpeed(){return(game.diff===Diff.EASY)?CONFIG.bullets.speedEasy:CONFIG.bullets.speedHard;}
function scheduleNextBullet(){const rate=currentEdgeRate();game.nextBulletTimer=1/rate;}
function spawnEdgeBullets(dt){
  if(game.diff===Diff.HC)return;
  game.nextBulletTimer-=dt;
  while(game.nextBulletTimer<=0){
    emitEdgeBullet();
    scheduleNextBullet();
  }
}
function emitEdgeBullet(){
  const W=CONFIG.canvas.w,H=CONFIG.canvas.h,p=game.player;
  if(!p)return;
  const side=Math.floor(Math.random()*4);
  let x,y;const buf=10;
  if(side===0){x=Math.random()*W;y=-buf;}
  else if(side===1){x=Math.random()*W;y=H+buf;}
  else if(side===2){x=-buf;y=Math.random()*H;}
  else{x=W+buf;y=Math.random()*H;}
  const dx=p.x-x,dy=p.y-y;
  const ang0=Math.atan2(dy,dx);
  const ang=ang0+(Math.random()*2-1)*edgeSpreadRad();
  const v=edgeBulletSpeed();
  const vx=Math.cos(ang)*v,vy=Math.sin(ang)*v;
  game.bullets.push(new Bullet(x,y,vx,vy,CONFIG.bullets.r));
}

/* curve attacks (Easy/Hard) */
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
    const c=genCurve(name,CONFIG.canvas.w,CONFIG.canvas.h);
    game.pendingCurve={name,poly:c.poly,text:c.text};
    game.curvePreTimer=(game.diff===Diff.EASY)?CONFIG.curves.preEasy:CONFIG.curves.preHard;
  }
}
function activatePendingCurve(){
  if(!game.pendingCurve)return;
  const dur=(game.diff===Diff.EASY)?CONFIG.curves.activeEasy:CONFIG.curves.activeHard;
  game.curveLasers.push(new CurveLaser(game.pendingCurve.name,game.pendingCurve.poly,dur));
  game.pendingCurve=null;
  scheduleNextCurve();
}

/* hardcore (no bullets, 2 curves/1s) */
const HC_CYCLE=1.0;
function updateHardcore(dt){
  game.nextCurveTimer-=dt;
  if(game.curvePreTimer>0){
    game.curvePreTimer-=dt;
    if(game.curvePreTimer<=0)activatePendingCurveHC();
  }else if(game.nextCurveTimer<=0){
    let n1=choose(PRESET_NAMES),n2=choose(PRESET_NAMES);
    if(n2===n1)n2=choose(PRESET_NAMES);
    const c1=genCurve(n1,CONFIG.canvas.w,CONFIG.canvas.h);
    const c2=genCurve(n2,CONFIG.canvas.w,CONFIG.canvas.h);
    game.pendingCurve={hc:true,list:[{name:n1,poly:c1.poly,text:c1.text},{name:n2,poly:c2.poly,text:c2.text}]};
    game.curvePreTimer=CONFIG.curves.preHC;
    game.nextCurveTimer=HC_CYCLE;
  }
}
function activatePendingCurveHC(){
  if(!game.pendingCurve||!game.pendingCurve.hc)return;
  const dur=CONFIG.curves.activeHC;
  for(const c of game.pendingCurve.list){
    game.curveLasers.push(new CurveLaser(c.name,c.poly,dur));
  }
  game.pendingCurve=null;
}

/* collision */
function checkCollisions(){
  if(game.time<CONFIG.startInvuln)return;
  const p=game.player;if(!p)return;
  for(const b of game.bullets){
    if(!b.alive)continue;
    const dx=b.x-p.x,dy=b.y-p.y;
    const rr=(b.r+p.r)**2;
    if(dx*dx+dy*dy<=rr){registerHit();b.alive=false;break;}
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
  const dx=x2-x1,dy=y2-y1;
  const l2=dx*dx+dy*dy;
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

/* flow */
function startGame(diff){
  game.mode=Mode.PLAY;game.diff=diff;game.time=0;game.score=0;
  const speed=(diff===Diff.EASY)?CONFIG.player.speedEasy:(diff===Diff.HARD?CONFIG.player.speedHard:CONFIG.player.speedHC);
  game.player=new Player(CONFIG.canvas.w/2,CONFIG.canvas.h/2,CONFIG.player.r,speed);
  game.bullets.length=0;game.curveLasers.length=0;
  game.hp=(diff===Diff.EASY)?3:1;
  hideMenu();hideGO();hideTitle();
  if(diff===Diff.HC){game.nextCurveTimer=0;game.curvePreTimer=0;}
  else{scheduleNextCurve();scheduleNextBullet();}
  running=true;lastTime=performance.now();requestAnimationFrame(loop);
}
function endGame(){
  if(game.mode!==Mode.PLAY)return;
  game.mode=Mode.GO;running=false;game.score=game.time;
  if(game.diff===Diff.EASY){if(game.score>game.best.easy){game.best.easy=game.score;saveBest();}}
  else if(game.diff===Diff.HARD){if(game.score>game.best.hard){game.best.hard=game.score;saveBest();}}
  else{if(game.score>game.best.hc){game.best.hc=game.score;saveBest();}}
  showGO();
}
function returnToMenu(){game.mode=Mode.MENU;running=false;showMenu();hideGO();}

/* UI */
function showMenu(){
  uiMenu.classList.remove('hidden');
  showTitle();              // 메뉴 화면 = 제목 표시
}
function hideMenu(){
  uiMenu.classList.add('hidden');
  // 제목 숨김은 startGame()에서 처리
}

function showGO(){
  finalScoreEl.textContent = `Score: ${game.score.toFixed(1)}s`;
  const best = (game.diff===Diff.EASY)?game.best.easy:(game.diff===Diff.HARD?game.best.hard:game.best.hc);
  bestScoreEl.textContent  = `Best: ${best.toFixed(1)}s`;
  uiGO.classList.remove('hidden');
  showTitle();              // 게임 오버 화면 = 제목 표시
}
function hideGO(){
  uiGO.classList.add('hidden');
}


/* HUD */
function drawHUD(){
  if(game.mode!==Mode.PLAY)return;
  ctx.fillStyle='#fff';ctx.font='16px monospace';ctx.textAlign='left';
  ctx.fillText(`Time: ${game.time.toFixed(1)}s`,8,20);
  if(game.diff===Diff.EASY)ctx.fillText(`HP: ${game.hp}`,8,40);
  if(game.pendingCurve){
    ctx.textAlign='center';ctx.font='18px monospace';
    let txt;
    if(game.pendingCurve.hc){
      const n1=game.pendingCurve.list[0].text,n2=game.pendingCurve.list[1].text;
      txt=`NEXT: ${n1} + ${n2}`;
    }else{
      txt=`NEXT: ${game.pendingCurve.text}`;
    }
    ctx.fillStyle='#ff8';
    ctx.fillText(txt,CONFIG.canvas.w/2,60);
  }
}

/* main loop */
let running=false,lastTime=0;
function loop(ts){
  if(!running)return;
  const dt=Math.min((ts-lastTime)/1000,0.1);
  lastTime=ts;
  update(dt);render();
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
function render(){
  ctx.clearRect(0,0,CONFIG.canvas.w,CONFIG.canvas.h);
  drawGrid();
  for(const c of game.curveLasers)c.draw();
  for(const b of game.bullets)b.draw();
  game.player.draw();
  drawHUD();
}
function drawGrid(){
  const W = CONFIG.canvas.w;
  const H = CONFIG.canvas.h;
  const unit = (CONFIG.grid && CONFIG.grid.unit) ? CONFIG.grid.unit : 50;
  const cx = W/2;
  const cy = H/2;

  // ----- minor grid -----
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x=0; x<=W; x+=unit){
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
  }
  for (let y=0; y<=H; y+=unit){
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
  }

  // ----- axes -----
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  // x-axis (y=0 math => cy canvas)
  ctx.beginPath(); ctx.moveTo(0,cy); ctx.lineTo(W,cy); ctx.stroke();
  // y-axis (x=0 math => cx canvas)
  ctx.beginPath(); ctx.moveTo(cx,0); ctx.lineTo(cx,H); ctx.stroke();

  // ----- ticks + labels -----
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.fillStyle   = '#ccc';
  ctx.font = '12px monospace';

  // x ticks (skip 0)
  ctx.textAlign = 'center';
  const maxUnitsX = Math.floor(W/(2*unit));
  for (let i=-maxUnitsX; i<=maxUnitsX; i++){
    if (i===0) continue;
    const x = cx + i*unit;
    // tick
    ctx.beginPath(); ctx.moveTo(x,cy-4); ctx.lineTo(x,cy+4); ctx.stroke();
    // label
    ctx.fillText(i.toString(), x, cy+14);
  }

  // y ticks (skip 0)
  ctx.textAlign = 'right';
  const maxUnitsY = Math.floor(H/(2*unit));
  for (let j=-maxUnitsY; j<=maxUnitsY; j++){
    if (j===0) continue;
    // math +y up -> canvas y = cy - j*unit
    const y = cy - j*unit;
    ctx.beginPath(); ctx.moveTo(cx-4,y); ctx.lineTo(cx+4,y); ctx.stroke();
    ctx.fillText(j.toString(), cx-6, y+4);
  }

  // origin label
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.fillText('0', cx+4, cy-4);
}


/* init */
showMenu();hideGO();
