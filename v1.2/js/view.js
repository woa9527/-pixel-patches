/* ==========================================================
   view.js  —— 缩放平移 / 画面渲染 / 选区蚂蚁线
   ========================================================== */
/* 透明格子用的两个色：一个浅灰、一个偏白的灰白，两色差得开，一眼就能看出哪格是空的。
   以前是深灰配更深灰（#23252f / #1b1d26），两个都黑乎乎的，
   透明的地方跟画布糊成一片，根本分不清。 */
const CHK_A=[233,235,239], CHK_B=[194,198,207];
/* 把坐标对齐到整设备像素 —— 线才不会糊成两半，也不会整条挪偏 */
const snap=v=>Math.round(v*dpr)/dpr;

/* 背景棋盘：画在一张跟画布一样大的小图上（一格像素 = 一个色，(x+y) 单双交替）。
   它是长在画布上的，不是长在屏幕上的 ——
   画布 32×32 就永远是 32×32 个格子：放大时每个格子跟着变大，缩小时跟着变小，
   数量一直不变。以前按「8 个屏幕像素一格」画，缩到最小整个画布只剩一两个格子；
   后来又试过钉死在屏幕上，拖动时内容在不动的格子上滑过去，看着像拖影、发粘。
   现在这个做法是第三种：背景跟像素一体，拖起来整体一起走。 */
let boardCv=null, boardW=0, boardH=0;
function ensureBoard(){
  if(boardCv&&boardW===S.w&&boardH===S.h) return;
  boardW=S.w; boardH=S.h;
  if(!boardCv) boardCv=document.createElement('canvas');
  boardCv.width=S.w; boardCv.height=S.h;
  const c=boardCv.getContext('2d'), im=c.createImageData(S.w,S.h), d=im.data;
  for(let y=0;y<S.h;y++)for(let x=0;x<S.w;x++){
    const i=(y*S.w+x)*4, col=((x+y)%2)?CHK_B:CHK_A;
    d[i]=col[0]; d[i+1]=col[1]; d[i+2]=col[2]; d[i+3]=255;
  }
  c.putImageData(im,0,0);
}
/* ---------- 视图 ---------- */
function resize(){
  const r=$('#cvwrap').getBoundingClientRect();
  cssW=Math.max(1,Math.floor(r.width)); cssH=Math.max(1,Math.floor(r.height));
  cv.width=Math.floor(cssW*dpr); cv.height=Math.floor(cssH*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  render();
}
/* 双击 = 局部放大：以手指按的那一点为锚放大，再双击还原成放大前的样子。
   不是只能点固定几个位置，点哪放大哪 —— 想看清那个爱心就双击那个爱心。 */
let zoomBack=null;
function zoomAt(x,y){
  if(zoomBack){
    V.scale=zoomBack.scale; V.ox=zoomBack.ox; V.oy=zoomBack.oy; zoomBack=null;
    render(); save(); return;
  }
  zoomBack={scale:V.scale,ox:V.ox,oy:V.oy};
  const ns=clamp(V.scale*2.4,1,48), k=ns/V.scale;
  V.ox=Math.round(x-(x-V.ox)*k); V.oy=Math.round(y-(y-V.oy)*k);
  V.scale=ns;
  render(); save();
}
function clearZoomBack(){ zoomBack=null; }
function fitView(){
  if(!cssW) return;
  zoomBack=null;                 /* 视图都重置了，双击放大的记录也作废 */
  const s=Math.max(1,Math.floor(Math.min(cssW,cssH)*0.9/Math.max(S.w,S.h)));
  V.scale=s;
  V.ox=Math.round((cssW-S.w*s)/2); V.oy=Math.round((cssH-S.h*s)/2);
}
function render(){
  if(!S.img) return;
  flatten();                       /* 所有可见层合成到 S.flat（S.img 就是套在它上面的） */
  octx.putImageData(S.img,0,0);
  ctx.clearRect(0,0,cssW,cssH);
  const sw=S.w*V.scale, sh=S.h*V.scale;
  ensureBoard();
  ctx.imageSmoothingEnabled=false;
  /* 只贴屏幕里看得见的那块（画布放大到 7 倍时，按整块铺要画 20 万次，拖起来发粘）。
     棋盘和像素用【同一句 drawImage 的同一套坐标】—— 背景格子的边就是像素的边，
     一格不差；拖动时背景跟着像素一起走，不会在原地滑出拖影。 */
  const cx0=clamp(Math.floor(-V.ox/V.scale),0,S.w), cy0=clamp(Math.floor(-V.oy/V.scale),0,S.h);
  const cx1=clamp(Math.ceil((cssW-V.ox)/V.scale),0,S.w), cy1=clamp(Math.ceil((cssH-V.oy)/V.scale),0,S.h);
  if(cx1>cx0&&cy1>cy0){
    const dx=V.ox+cx0*V.scale, dy=V.oy+cy0*V.scale, dw=(cx1-cx0)*V.scale, dh=(cy1-cy0)*V.scale;
    ctx.drawImage(boardCv,cx0,cy0,cx1-cx0,cy1-cy0,dx,dy,dw,dh);   /* 先铺棋盘 */
    ctx.drawImage(off,cx0,cy0,cx1-cx0,cy1-cy0,dx,dy,dw,dh);       /* 再铺像素，透明的格子就露出来 */
  }
  /* 画布边框和网格线都改成深色 —— 棋盘换成浅色之后，白线在白底上等于没有。
     坐标都过一遍 snap，不再加那个 .5：老写法在浮点坐标上再 +0.5，
     等于整条线往右下挪了半个像素，放大倍数不是整数时（双击放大到 21.6 倍那种）最明显。 */
  ctx.strokeStyle='rgba(0,0,0,.42)';ctx.lineWidth=1;
  const fx0=snap(V.ox), fy0=snap(V.oy), fx1=snap(V.ox+sw), fy1=snap(V.oy+sh);
  ctx.strokeRect(fx0,fy0,fx1-fx0,fy1-fy0);
  if(S.grid&&V.scale>=5){
    const gx0=Math.max(1,Math.floor(-V.ox/V.scale)), gx1=Math.min(S.w-1,Math.ceil((cssW-V.ox)/V.scale));
    const gy0=Math.max(1,Math.floor(-V.oy/V.scale)), gy1=Math.min(S.h-1,Math.ceil((cssH-V.oy)/V.scale));
    ctx.strokeStyle='rgba(0,0,0,.13)';ctx.beginPath();
    for(let x=gx0;x<=gx1;x++){const px=snap(V.ox+x*V.scale);ctx.moveTo(px,fy0);ctx.lineTo(px,fy1);}
    for(let y=gy0;y<=gy1;y++){const py=snap(V.oy+y*V.scale);ctx.moveTo(fx0,py);ctx.lineTo(fx1,py);}
    ctx.stroke();
  }
  if(move&&move.buf) drawMoveBuf();
  if(preview) drawPreview();
  if(curve) drawCurve();       /* 曲线：画到一半的那条，落定前一直只是预览 */
  if(sel) drawSel();
}
function drawSel(){
  const m=sel.mask, sc=V.scale, edges=[];
  for(let y=0;y<S.h;y++)for(let x=0;x<S.w;x++){
    if(!m[IX(x,y)]) continue;
    const px=V.ox+x*sc, py=V.oy+y*sc;
    if(y===0||!m[IX(x,y-1)]) edges.push([px,py,px+sc,py]);
    if(y===S.h-1||!m[IX(x,y+1)]) edges.push([px,py+sc,px+sc,py+sc]);
    if(x===0||!m[IX(x-1,y)]) edges.push([px,py,px,py+sc]);
    if(x===S.w-1||!m[IX(x+1,y)]) edges.push([px+sc,py,px+sc,py+sc]);
  }
  ctx.save(); ctx.lineWidth=1.4;
  const stroke=(color,off)=>{
    ctx.strokeStyle=color;ctx.setLineDash([4,4]);ctx.lineDashOffset=-off;
    ctx.beginPath();
    for(const e of edges){ctx.moveTo(e[0],e[1]);ctx.lineTo(e[2],e[3]);}
    ctx.stroke();
  };
  stroke('rgba(0,0,0,.85)',dashT);
  stroke('#fff',(dashT+4)%8);
  ctx.restore();
}
function ensureAnts(){
  if(sel&&!dashTimer) dashTimer=setInterval(()=>{dashT=(dashT+1)%8;render();},110);
  if(!sel&&dashTimer){clearInterval(dashTimer);dashTimer=null;}
}
