/* ==========================================================
   canvas.js  —— 画布尺寸：拼图式调整（拖四条边，预览态）
   从预览模板 canvas-mock.html 搬进来的，接真代码的 S / V / render()。
   ========================================================== */
const CSIZE_MAX=512, CSIZE_MIN=1;
/* 调整模式下画布可能比屏幕还大（512 宽塞进 390 的屏），
   所以缩放得允许小于 1 —— 不然画布顶出屏幕，手柄就抓不着了。 */
const SCALE_MIN=0.15;

let adjusting=false, cbase=null, csnap=null, dL=0, dT=0, dR=0, dB=0;
/* 用户自己缩放过视图（双指捏 / 双击放大）→ 记一下。
   没缩放过时，往外拖边会自动缩小一点，好让整张画布一直在眼里；
   可要是用户特意放大了去看某条边，再拖就不许把他的倍数缩回去 ——
   以前不区分，一拖边就缩回「刚好装下」，看着像自己跳回去了。 */
let cZoomed=false;

/* ---------- 拼图：从底稿现场拼出当前尺寸 ----------
   调整期间底稿一个像素都不动，只记四条边各挪了多少格
   （dL/dT/dR/dB，正数=拼上空白，负数=裁掉），每帧按这四个数现场拼。
   这么绕一圈就为一件事 —— 往里推裁掉的像素没真的丢，往回拉它自己长回来。
   裁过头了也能一点点试出到底该裁多少。点了「完成」才真的落盘。     */
function compose(){
  const nw=clamp(cbase.w+dL+dR,CSIZE_MIN,CSIZE_MAX), nh=clamp(cbase.h+dT+dB,CSIZE_MIN,CSIZE_MAX);
  /* 每一层都得按同样的四条边偏移拼一遍 —— 只拼当前层的话，
     改完尺寸别的层就全乱了（内容对不上，缩放也不一样）。 */
  S.layers=S.layers.map((L,k)=>{
    const np=new Uint8ClampedArray(nw*nh*4), src=cbase.ls[k].px;
    for(let y=0;y<cbase.h;y++){
      const Y=y+dT; if(Y<0||Y>=nh) continue;
      for(let x=0;x<cbase.w;x++){
        const X=x+dL; if(X<0||X>=nw) continue;
        const si=(y*cbase.w+x)*4, di=(Y*nw+X)*4;
        np[di]=src[si]; np[di+1]=src[si+1]; np[di+2]=src[si+2]; np[di+3]=src[si+3];
      }
    }
    return {id:L.id,name:L.name,vis:L.vis,lock:L.lock,buf:np};
  });
  S.w=nw; S.h=nh; off.width=nw; off.height=nh;
  rebuildFlat();
}
/* 四条边各自的增量（没动的那条传 0）：正数往外拉拼空白，负数往里推裁掉
   dir 只用来决定「把哪条边钉住」，让画面不会跳 */
function applyDelta(dl,dt,dr,db,dir){
  if(!cbase) return;
  const oL=dL, oR=dR, oT=dT, oB=dB;
  if(dl) dL=clamp(dL+dl, CSIZE_MIN-(cbase.w+dR), CSIZE_MAX-(cbase.w+dR));
  if(dr) dR=clamp(dR+dr, CSIZE_MIN-(cbase.w+dL), CSIZE_MAX-(cbase.w+dL));
  if(dt) dT=clamp(dT+dt, CSIZE_MIN-(cbase.h+dB), CSIZE_MAX-(cbase.h+dB));
  if(db) dB=clamp(dB+db, CSIZE_MIN-(cbase.h+dT), CSIZE_MAX-(cbase.h+dT));
  const nl=dL-oL, nt=dT-oT;
  if(!nl && !nt && dR===oR && dB===oB) return;
  compose();
  /* 内容整体挪了 (nl, nt)，画布就反向挪同样多 —— 屏幕上纹丝不动 */
  V.ox-=nl*V.scale; V.oy-=nt*V.scale;
  ensureVisible(dir||'');
  renderAdj();
}

/* ---------- 视图 ---------- */
/* 按「当前尺寸 × 倍数」去 fit，给自己留出往外拖的余量。
   不然一进调整模式画布就顶满屏幕，手柄立刻跑到屏幕外抓不着。 */
function fitRoom(k){
  const p=16;
  V.scale=Math.max(SCALE_MIN,Math.min((cssW-p*2)/(S.w*k),(cssH-p*2)/(S.h*k)));
  V.ox=Math.round((cssW-S.w*V.scale)/2); V.oy=Math.round((cssH-S.h*V.scale)/2);
}
/* 保证手柄永远抓得住。分两种情况：
   【没人手动缩放过】① 画布还在视野里 → 一下都不动，「像素不动」才是真的；
     ② 画布撑爆视野 → 整体缩小到刚好装下，还能继续往外拖；
     ③ 再把位置夹回视野内，别让边跑出去抓不着。
   【用户自己缩放过（cZoomed）】他的倍数一个都不许动 ——
     只把「正在拖的那条边」平移回屏幕里站住，没在拖的那个方向一律不碰。
     以前不区分，一拖边就被缩回「刚好装下」，看着像自己跳回放大前；
     拖上/下边还会顺手把横向的 ox 拽到 ≥20，画面整块横着跳一下。 */
function ensureVisible(d){
  d=d||'';
  const m=20; let w=S.w*V.scale, h=S.h*V.scale;
  /* 只因为「正在拖的那条边」出去了才挪画面 —— 另一头撑出屏幕就先不管，
     不然拖高度时画面会被宽度拽得乱跳。
     cZoomed 时：拖上/下边就不管横向，拖左/右边就不管纵向。 */
  const overW = d.includes('r') ? (V.ox+w)>cssW-m
              : d.includes('l') ? V.ox<m
              : (!cZoomed && (w>cssW-m*2));
  const overH = d.includes('b') ? (V.oy+h)>cssH-m
              : d.includes('t') ? V.oy<m
              : (!cZoomed && (h>cssH-m*2));
  if(overW||overH){
    if(cZoomed){
      /* 倍数不动，只把正在拖的那条边平移回屏幕里（贴着边站住）。
         用户特意放大就是想盯着这条边看，把他缩回去等于帮倒忙。 */
      if(overW) V.ox = d.includes('r') ? (cssW-m-w) : m;
      if(overH) V.oy = d.includes('b') ? (cssH-m-h) : m;
    }else{
      const axL=V.ox, axR=V.ox+w, ayT=V.oy, ayB=V.oy+h;
      V.scale=Math.max(SCALE_MIN,Math.min((cssW-m*2)/S.w,(cssH-m*2)/S.h));
      w=S.w*V.scale; h=S.h*V.scale;
      if(d.includes('r'))       V.ox=axR-w;
      else if(d.includes('l'))  V.ox=axL;
      else                      V.ox=(cssW-w)/2;
      if(d.includes('b'))       V.oy=ayB-h;
      else if(d.includes('t'))  V.oy=ayT;
      else                      V.oy=(cssH-h)/2;
    }
  }
  if(cZoomed){
    /* 只夹「正在拖的那条边」这一头，别的方向一律不碰 ——
       以前拖上边也会把横向的 ox 拽到 ≥20，画面整块横着跳一下。 */
    if(d.includes('r')) V.ox=Math.round(Math.min(V.ox,cssW-m-w));
    if(d.includes('l')) V.ox=Math.round(Math.max(V.ox,m));
    if(d.includes('b')) V.oy=Math.round(Math.min(V.oy,cssH-m-h));
    if(d.includes('t')) V.oy=Math.round(Math.max(V.oy,m));
  }else{
    const cL=Math.max(m,cssW-w-m), cT=Math.max(m,cssH-h-m);
    if(d.includes('r'))       V.ox=Math.round(Math.min(V.ox,cL));
    else if(d.includes('l'))  V.ox=Math.round(Math.max(V.ox,m));
    else if(!d)               V.ox=Math.round(clamp(V.ox,m,cL));
    else                      V.ox=Math.round(Math.max(V.ox,m));
    if(d.includes('b'))       V.oy=Math.round(Math.min(V.oy,cT));
    else if(d.includes('t'))  V.oy=Math.round(Math.max(V.oy,m));
    else if(!d)               V.oy=Math.round(clamp(V.oy,m,cT));
    else                      V.oy=Math.round(Math.max(V.oy,m));
  }
}

/* ---------- 渲染：画完顺手把手柄摆好、把尺寸数字刷了 ---------- */
function renderAdj(){
  render();
  placeHandles();
  const n=S.w+' × '+S.h;
  const a=$('#hudn'); if(a) a.textContent=n;
  const b=$('#curn'); if(b) b.textContent=n;
}
function placeHandles(){
  const L=V.ox, T=V.oy, R=V.ox+S.w*V.scale, B=V.oy+S.h*V.scale;
  const P=13, TH=22;               /* P = 给角手柄让出来的位，TH = 热区厚度 */
  const hw=$('#handles'); if(!hw) return;
  hw.classList.toggle('tight',(R-L)<44||(B-T)<44);
  hw.querySelectorAll('.hd').forEach(h=>{
    const d=h.dataset.d, st=h.style;
    if(d==='l'||d==='r'){
      /* 上下各让开一个角手柄；画布太扁时退化成「居中 22px」的一小截，别缩没 */
      let a=T+P, b=B-P;
      if(b-a<TH){ const c=(T+B)/2; a=c-TH/2; b=c+TH/2; }
      st.left  = d==='l' ? (L-TH/2)+'px' : 'auto';
      st.right = d==='r' ? (cssW-(R+TH/2))+'px' : 'auto';
      st.top=a+'px'; st.height=(b-a)+'px'; st.bottom='auto'; st.width=TH+'px';
    }else if(d==='t'||d==='b'){
      const g=Math.max(3,Math.min(P,((R-L)-8)/2));
      st.left=(L+g)+'px'; st.width=Math.max(6,(R-L)-g*2)+'px'; st.right='auto';
      st.top    = d==='t' ? (T-TH/2)+'px' : 'auto';
      st.bottom = d==='b' ? (cssH-(B+TH/2))+'px' : 'auto';
      st.height=TH+'px';
    }else{
      const X=d.includes('l')?L:R, Y=d.includes('t')?T:B;
      st.left=(X-13)+'px'; st.top=(Y-13)+'px';
      st.right='auto'; st.bottom='auto'; st.width='26px'; st.height='26px';
    }
  });
}

/* ---------- 手势 ----------
   一根手指 = 拖画布尺寸 / 挪画面；两根手指 = 缩放视图。两者必须分清楚：
   缩放的时候手指很可能会压在手柄上，要是手柄还在响应，
   想缩小画面结果画布被一起拽大了 —— 所以一旦出现第二根手指，手柄当场松手。
   指针统一在 document 捕获阶段登记：按在手柄上的手指也算一根 ——
   不然「一根压着线 + 另一根缩放」识别不成两指，反而缩不动。            */
const cpts=new Map();
let cpan=null, cpinch=null, hDrag=null, hDir=null;
let cTapT=0, cTapAt=null, autoRAF=null, autoPos=null, autoAcc=0;
const inCanvas=e=>$('#cvwrap').contains(e.target) && !e.target.closest('#hud');
function cpos(e){const r=cv.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
function cTwo(){const a=[...cpts.values()]; return a.length>=2?a:null;}
function cPinchStart(){
  const p=cTwo(); if(!p) return null;
  const r=cv.getBoundingClientRect();
  return {d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)||1, scale:V.scale,
          cx:(p[0].x+p[1].x)/2-r.left, cy:(p[0].y+p[1].y)/2-r.top, ox:V.ox, oy:V.oy};
}
document.addEventListener('pointerdown',e=>{
  if(!adjusting||!inCanvas(e)) return;
  e.stopPropagation();              /* 调整模式下画布不接落笔，全归这里管 */
  if(cpts.size===0) cTapAt={x:e.clientX,y:e.clientY};
  else cTapAt=null;                 /* 多指是缩放，不算点击 */
  cpts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(cpts.size>=2) stopHandle();
  if(cpts.size===1){
    const hd=e.target.closest('.hd');
    if(hd) startHandle(hd,e);
    else cpan={x:e.clientX,y:e.clientY,ox:V.ox,oy:V.oy};
  }else if(cpts.size===2){ cpan=null; cpinch=cPinchStart(); }
},true);
document.addEventListener('pointermove',e=>{
  if(!cpts.has(e.pointerId)) return;
  cpts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(cpinch&&cpts.size>=2){
    const p=cTwo(); if(!p) return;
    const ns=clamp(cpinch.scale*(Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)/cpinch.d),SCALE_MIN,48);
    const k=ns/cpinch.scale;
    V.ox=Math.round(cpinch.cx-(cpinch.cx-cpinch.ox)*k);   /* 以两指中间为锚 */
    V.oy=Math.round(cpinch.cy-(cpinch.cy-cpinch.oy)*k);
    V.scale=ns; cZoomed=true; renderAdj();
  }else if(hDrag&&cpts.size===1){
    autoPos={x:e.clientX,y:e.clientY};
    const last=hDrag.last;
    let n, dl=0, dt=0, dr=0, db=0, hit=false;
    if(hDir.includes('r')){ n=Math.round((e.clientX-last.x)/V.scale); if(n){ dr=n; last.x+=n*V.scale; hit=true; } }
    if(hDir.includes('l')){ n=Math.round((last.x-e.clientX)/V.scale); if(n){ dl=n; last.x-=n*V.scale; hit=true; } }
    if(hDir.includes('b')){ n=Math.round((e.clientY-last.y)/V.scale); if(n){ db=n; last.y+=n*V.scale; hit=true; } }
    if(hDir.includes('t')){ n=Math.round((last.y-e.clientY)/V.scale); if(n){ dt=n; last.y-=n*V.scale; hit=true; } }
    if(hit) applyDelta(dl,dt,dr,db,hDir);
  }else if(cpan&&cpts.size===1){
    V.ox=Math.round(cpan.ox+(e.clientX-cpan.x));
    V.oy=Math.round(cpan.oy+(e.clientY-cpan.y));
    renderAdj();
  }
},true);
function cUp(e){
  if(!cpts.delete(e.pointerId)) return;
  const p=cpos(e);
  if(!cpts.size){
    /* 双击画布任意一点 = 局部放大那一点，再双击 = 还原。
       不是只能点那四个角，点哪放大哪 —— 想看清那个爱心就双击那个爱心。 */
    const now=Date.now();
    if(cTapAt&&Math.hypot(e.clientX-cTapAt.x,e.clientY-cTapAt.y)<10){
      /* zoomAt 之后 zoomBack 非空 = 刚放大；为空 = 刚还原回进来的样子 */
      if(now-cTapT<320){ cTapT=0; zoomAt(p.x,p.y); cZoomed=(zoomBack!==null); placeHandles(); cTapAt=null; return; }
      else cTapT=now;
    }else cTapT=now;
    cTapAt=null;
  }
  if(hDrag) stopHandle();
  if(cpts.size<2) cpinch=null;
  if(cpts.size===1){ const a=[...cpts.values()][0]; cpan={x:a.x,y:a.y,ox:V.ox,oy:V.oy}; }
  else if(!cpts.size) cpan=null;
}
document.addEventListener('pointerup',cUp,true);
document.addEventListener('pointercancel',cUp,true);

/* 手指顶到屏幕边上就没法再往外推了（手指出不了屏幕），
   所以按住边缘不放时让它自己接着长 —— 跟拖到边缘自动滚动一个道理。 */
function autoTick(){
  if(!autoPos){ autoRAF=null; return; }
  const r=cv.getBoundingClientRect(), hot=34, d=hDir;
  /* 按得越久越快：1 格/帧起步，最多 8 格/帧 —— 32 拖到 512 大概一秒出头 */
  const n=1+Math.min(autoAcc>>3,7);
  const bw=S.w, bh=S.h;
  const onEdge =
    (d.includes('r')&&autoPos.x>r.right -hot) ||
    (d.includes('l')&&autoPos.x<r.left  +hot) ||
    (d.includes('b')&&autoPos.y>r.bottom-hot) ||
    (d.includes('t')&&autoPos.y<r.top   +hot);
  /* 角手柄同时管两个方向，所以只调一次 —— 调两次会双倍 */
  if(onEdge) applyDelta(d.includes('l')?n:0,d.includes('t')?n:0,
                        d.includes('r')?n:0,d.includes('b')?n:0,d);
  autoAcc=(S.w===bw&&S.h===bh)?0:Math.min(autoAcc+1,40);
  autoRAF=requestAnimationFrame(autoTick);
}
function startHandle(hd,e){
  hDrag={last:{x:e.clientX,y:e.clientY}}; hDir=hd.dataset.d;
  autoPos={x:e.clientX,y:e.clientY}; autoAcc=0;
  if(autoRAF) cancelAnimationFrame(autoRAF);
  autoRAF=requestAnimationFrame(autoTick);
  try{ hd.setPointerCapture(e.pointerId); }catch(_){}
}
function stopHandle(){
  hDrag=null; autoPos=null; autoAcc=0;
  if(autoRAF){ cancelAnimationFrame(autoRAF); autoRAF=null; }
}

/* ---------- 进 / 出调整模式 ---------- */
function enterAdjust(){
  if(adjusting) return;
  /* 进来之前先在手的东西全部收干净：选区、画到一半的笔、正在搬的东西、没落定的曲线 */
  clearSel(); ptrs.clear(); stroke=null; preview=null; pan=null; pinch=null; move=null; cancelCurve();
  /* 底稿是【所有层】的 —— 只留当前层的话，改完尺寸别的层就回不来了 */
  const snapAll=()=>({w:S.w,h:S.h,ls:S.layers.map(L=>({name:L.name,vis:L.vis,lock:L.lock,
    px:new Uint8ClampedArray(L.buf)}))});
  csnap=snapAll(); cbase=snapAll();
  dL=dT=dR=dB=0;
  adjusting=true;
  cZoomed=false;                 /* 刚进来是自动摆好的视图，还没人手动缩放过 */
  document.body.classList.add('adjusting');
  lyOpen(false);                 /* 图层面板会挡住四条边的手柄 */
  if(anim&&anim.open) animClose();   /* 播放条也贴在画面顶部，一样会挡 */
  closeSheet();
  clearZoomBack();
  /* 工具栏/卡槽收起来了，画布区域变大，得重新量一遍再摆手柄 */
  resize(); fitRoom(1.6); renderAdj();
}
function exitAdjust(ok){
  if(!adjusting) return;
  stopHandle(); cpts.clear(); cpan=null; cpinch=null;
  if(!ok&&csnap){
    /* 取消：底稿整个换回去（不是 set，尺寸可能变过，长度对不上），【每层都要换】 */
    S.w=csnap.w; S.h=csnap.h; off.width=csnap.w; off.height=csnap.h;
    S.layers=csnap.ls.map(L=>({id:++lyUid,name:L.name,vis:L.vis,lock:L.lock,
      buf:new Uint8ClampedArray(L.px)}));
    rebuildFlat();
  }
  adjusting=false; cbase=null; csnap=null; dL=dT=dR=dB=0;
  document.body.classList.remove('adjusting');
  clearZoomBack();
  renderLayers();
  resize(); fitView();
  if(ok){
    /* 尺寸变了，历史里那些旧尺寸的快照长度对不上，撤销会崩 ——
       所以跟新建画布一样把历史重置，只留当前这步。要反悔就点「取消」。 */
    history.stack=[snapLayers()]; history.i=0; syncUndo();
    save(); toast('画布已改为 '+S.w+' × '+S.h);
  }
  render();
}
$('#hudDone').onclick   = ()=>exitAdjust(true);
$('#hudCancel').onclick = ()=>exitAdjust(false);
/* 转屏 / 窗口尺寸变了，手柄得跟着重新摆 */
window.addEventListener('resize',()=>{ if(adjusting) renderAdj(); });
