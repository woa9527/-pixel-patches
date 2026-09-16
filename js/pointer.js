/* ==========================================================
   pointer.js  —— 手指/鼠标：落笔、拖拽、双指缩放
   ========================================================== */
/* ---------- 指针 ---------- */
const ptrs=new Map();
let stroke=null, preview=null, pan=null, pinch=null, move=null;
/* 曲线是【多步】操作，所以自己带一套状态，不塞进 preview（preview 是一笔到底的那种）：
     mode  'simple' 简单 / 'free' 自由
     step  1 = 正在拖那条直线；2 = 正在掰弯
     p0/p1 两个端点      c1 简单模式的控制点
     pts   自由模式的 5 个点      grab 正抓着第几个点（null = 没抓到）
   曲线画完之前一个像素都不往画布上写，全程只是预览 ——
   不然每掰一下都要记一步撤销，撤销键会被按烂。 */
let curve=null;

/* 掰完了，真的画上去 */
function commitCurve(){
  if(!curve) return;
  const c=curRGBA(), cells=curveCells();
  for(let i=0;i<cells.length;i++) stamp(cells[i][0],cells[i][1],c,false);
  curve=null; document.body.classList.remove('curveing');
  pushHistory(); render(); save();
}
/* 作废这条曲线（换工具 / 点取消 / 改画布大小） */
function cancelCurve(){
  if(!curve) return;
  curve=null; document.body.classList.remove('curveing'); render();
}

/* 把画到一半的东西还原回去（双指缩放打断笔画时用） */
function abortStroke(){
  if(stroke&&stroke.orig){ S.pixels.set(stroke.orig); }
  else if(move&&move.type==='all'&&move.origs){
    /* 整幅移动动的是【所有没锁的层】，还原也得一层层还原回去 */
    move.idxs.forEach((i,t)=>{ S.layers[i].buf.set(move.origs[t]); });
  }
  else if(move&&move.type==='buf'){ clearSelArea(); stampBuf(move.buf,move.ox,move.oy); }
  stroke=null; preview=null; move=null; flatDirty=true;
}

function pos(e){const r=cv.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
function toSprite(p){return {x:Math.floor((p.x-V.ox)/V.scale),y:Math.floor((p.y-V.oy)/V.scale)};}
function inDoc(p){return p.x>=0&&p.y>=0&&p.x<S.w&&p.y<S.h;}
function line(x0,y0,x1,y1,cb){
  x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
  let dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,err=dx-dy;
  for(;;){cb(x0,y0);if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>-dy){err-=dy;x0+=sx;}if(e2<dx){err+=dx;y0+=sy;}}
}

/* 双击 = 局部放大：第一次按下时留一份画面底稿，
   真双击了就把这两下顺手画上的点抹掉 —— 人家是想看清楚，不是想点两个点。
   变量名带 z 前缀，跟 tools.js 里双击工具的 tapT 区分开（那俩是全局的，会撞名）。 */
let zTapT=0, zTapPos=null, zTapSnap=null, zTapHist=0, zDownAt=null;

cv.addEventListener('pointerdown',e=>{
  cv.setPointerCapture(e.pointerId);
  const p=pos(e); ptrs.set(e.pointerId,p);
  if(ptrs.size===1){
    if(Date.now()-zTapT>=DBL_MS){ zTapSnap=snapLayers(); zTapHist=history.i; }
    zDownAt={x:p.x,y:p.y};
  }else zDownAt=null;
  if(ptrs.size===2){
    // 第二根手指落下 = 要缩放了，没画完的这一笔当场作废
    abortStroke();
    const v=[...ptrs.values()], a=v[0], b=v[1];
    pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2,scale:V.scale,ox:V.ox,oy:V.oy};
    render(); return;
  }
  if(ptrs.size!==1) return;
  /* 缩放工具单指拖 = 平移视野。平移工具删了 —— 手机上双指按住屏幕拖就行。 */
  if(S.tool==='zoom'){ pan={x:p.x,y:p.y,ox:V.ox,oy:V.oy}; return; }
  const sp=toSprite(p);
  /* 曲线第 2 步（掰弯 / 拖点）允许手指落到画布外 ——
     控制点常被拖到画布边上，按它的时候手指免不了压到画布外面去。
     第 1 步（起笔）仍然要求落在画布里。 */
  const cvStep2 = S.tool==='curve' && curve && curve.step===2;
  if(S.tool!=='select'&&S.tool!=='move'&&S.tool!=='outline'&&!cvStep2&&!inDoc(sp)) return;
  /* 【锁定联动】会往画布上写东西的工具：当前层锁住了就不许动。
     移动 / 选区 / 取色 / 缩放不在这里 —— 它们各有各的联动规矩（见下面各自那段）。 */
  if(LY_WRITE.indexOf(S.tool)>=0 && lyWriteGuard()) return;
  /* ---- 曲线：多步，单独一套 ---- */
  if(S.tool==='curve'){
    if(!curve){
      /* 第 1 步：按下 = 起点，拖出一条直线 */
      curve={mode:S.curveMode, step:1, p0:sp, p1:sp,
             c1:{x:sp.x,y:sp.y}, pts:[{x:sp.x,y:sp.y},{x:sp.x,y:sp.y}], grab:null};
      /* 自由画法要点「完成」才落定，所以得把底下那条完成/取消的条亮出来；
         简单画法松手就落定，用不上。 */
      if(curve.mode==='free') document.body.classList.add('curveing');
    } else if(curve.step===2){
      if(curve.mode==='simple'){
        curve.c1={x:sp.x,y:sp.y};                    /* 按哪儿，控制点就到哪儿 */
      } else {
        /* 抓最近的那一个点。判定半径按【屏幕像素】算（至少 14px）——
           画布缩到 1 倍时用格子数算就只剩两三个像素，手指根本按不中。 */
        const r=Math.max(2.2, 14/V.scale);
        let bi=-1, bd=1e9;
        curve.pts.forEach((q,i)=>{ const t=Math.hypot(q.x-sp.x,q.y-sp.y); if(t<bd){bd=t;bi=i;} });
        if(bd<=r) curve.grab=bi;
        else { curve.grab=null; toast('按住蓝色小方块拖（就这 5 个点）'); }
      }
    }
    render(); return;
  }

  if(S.tool==='picker'){
    const px=getPix(sp.x,sp.y);
    if(px[3]===0){ toast('这里是透明的，没颜色可取'); }
    else{
      const c=rgb2hsv(px[0],px[1],px[2]);
      S.color={h:c.h,s:c.s,v:c.v};
      S.rgb=[px[0],px[1],px[2]];           // 记下精确值，取色不跑偏
      syncColorUI(); toast('取色 '+curHex());
    }
    return;
  }
  if(S.tool==='fill'){
    flood(sp,curRGBA()); pushHistory(); render(); save(); return;
  }
  if(S.tool==='outline'){
    /* 没选区不许描 —— 一描就是整幅画面每个东西都描上，没法只描某个。
       工具本身是灰的，这里是兜底（比如选区刚被别的操作清掉） */
    if(!sel){ toast('先用选区框住要描边的那一个'); return; }
    /* 先认出框里的那个「东西」（框得不准也没关系，认的是物体本身），
       再沿着它的轮廓描黑边 —— 不是沿着那个方框描。 */
    const blob=selBlob();
    if(!blob){ toast('这个框里没画东西'); return; }
    doOutline(blob);
    makeSel(blob);            /* 选区也贴成这个东西的形状，一眼能看出认成了啥 */
    pushHistory(); render(); save(); toast('已认出这个东西并加上黑边'); return;
  }
  if(S.tool==='select'){
    // 选区工具只管框选：新建 / 加上 / 减去。移动选区用「移动」工具
    if(S.selShape==='magic'){
      /* 框选允许拖到画布外面松手，所以这一步可能在画布外 —— 先挡掉。
         不挡的话 IX() 会算出个越界下标，读回来是 undefined，
         既没选中东西、又会弹出一句「选中了这一整个东西」，纯属骗人。 */
      if(!inDoc(sp) || S.pixels[IX(sp.x,sp.y)*4+3]===0){ toast('这里是透明的，没东西可选'); return; }
      combineSel(magicMask(sp)); toast('选中了这一整个东西'); return;
    }
    preview={tool:'sel',a:sp,b:sp};
    return;
  }
  if(S.tool==='move'){
    /* 有选区 → 搬选区里的；没选区 → 整幅一起搬。不用再选一次「移什么」 */
    if(!sel){
      /* 【锁定联动（移动）】整幅搬 = 【所有没锁的层一起动】；锁住的层原地不动。
         全锁了才真的没得搬 —— 这时候说一句，别让人以为工具坏了。 */
      const idxs=[];
      S.layers.forEach((L,i)=>{ if(!L.lock) idxs.push(i); });
      if(!idxs.length){ toast('所有图层都锁住了，先解锁一个再搬'); return; }
      move={type:'all',idxs,origs:idxs.map(i=>new Uint8ClampedArray(S.layers[i].buf)),start:sp,dx:0,dy:0};
      if(idxs.length<S.layers.length) toast('锁住的图层原地不动');
    } else {
      if(lyWriteGuard()) return;
      const buf=extractBuf(); if(!buf) return;
      clearSelArea();
      move={type:'buf',buf,ox:sel.x0,oy:sel.y0,dx:0,dy:0,start:sp};
      render();
    }
    return;
  }
  stroke={tool:S.tool,orig:new Uint8ClampedArray(S.pixels),last:sp};
  if(S.tool==='pencil'||S.tool==='eraser'){ drawPoint(sp); render(); }
  else if(S.tool==='spray'){ sprayAt(sp); render(); }
  else { preview={tool:S.tool,a:sp,b:sp}; render(); }
});

cv.addEventListener('pointermove',e=>{
  if(!ptrs.has(e.pointerId)) return;
  const p=pos(e); ptrs.set(e.pointerId,p);
  if(pinch&&ptrs.size>=2){
    const v=[...ptrs.values()], a=v[0], b=v[1];
    const d=Math.hypot(a.x-b.x,a.y-b.y)||1;
    const ns=clamp(pinch.scale*(d/pinch.d),1,48);
    const sx=(pinch.cx-pinch.ox)/pinch.scale, sy=(pinch.cy-pinch.oy)/pinch.scale;
    const cx=(a.x+b.x)/2, cy=(a.y+b.y)/2;
    V.scale=ns; V.ox=Math.round(cx-sx*ns); V.oy=Math.round(cy-sy*ns);
    render(); return;
  }
  if(pan){
    V.ox=Math.round(pan.ox+(p.x-pan.x)); V.oy=Math.round(pan.oy+(p.y-pan.y));
    render(); return;
  }
  const sp=toSprite(p);
  if(move){
    if(move.type==='all'){
      move.dx=sp.x-move.start.x; move.dy=sp.y-move.start.y;
      /* 每个【没锁的层】各搬各的：从这一层的底稿偏移后写回这一层。
         锁住的层连碰都不碰，所以它纹丝不动。 */
      const nd=new Uint8ClampedArray(S.w*S.h*4);
      for(let t=0;t<move.idxs.length;t++){
        const L=S.layers[move.idxs[t]], src=move.origs[t];
        nd.fill(0);
        for(let y=0;y<S.h;y++)for(let x=0;x<S.w;x++){
          const nx=x+move.dx, ny=y+move.dy;
          if(nx<0||ny<0||nx>=S.w||ny>=S.h) continue;
          const si=IX(x,y)*4, di=IX(nx,ny)*4;
          nd[di]=src[si];nd[di+1]=src[si+1];nd[di+2]=src[si+2];nd[di+3]=src[si+3];
        }
        L.buf.set(nd);
      }
      flatDirty=true; render(); return;
    }
    if(move.type==='buf'){ move.dx=sp.x-move.start.x; move.dy=sp.y-move.start.y; render(); return; }
  }
  /* 曲线：拖动时只改控制点，一个像素都不往画布上写 */
  if(curve){
    if(curve.step===1){
      curve.p1={x:sp.x,y:sp.y};
      /* 简单模式的控制点一开始放在直线正中间 —— 掰之前它就是直的 */
      if(curve.mode==='simple') curve.c1={x:(curve.p0.x+sp.x)/2, y:(curve.p0.y+sp.y)/2};
    } else if(curve.step===2){
      if(curve.mode==='simple') curve.c1={x:sp.x,y:sp.y};
      else if(curve.grab!=null) curve.pts[curve.grab]={x:sp.x,y:sp.y};
    }
    render(); return;
  }
  if(stroke){
    if(sp.x===stroke.last.x&&sp.y===stroke.last.y) return;
    if(stroke.tool==='pencil'||stroke.tool==='eraser'){
      line(stroke.last.x,stroke.last.y,sp.x,sp.y,(x,y)=>drawPoint({x,y}));
    } else if(stroke.tool==='spray'){
      line(stroke.last.x,stroke.last.y,sp.x,sp.y,(x,y)=>sprayAt({x,y}));
    } else { preview.b=sp; }
    stroke.last=sp; render(); return;
  }
  if(preview){ preview.b=sp; render(); }
});

function endPointer(e){
  ptrs.delete(e.pointerId);
  const ep=pos(e);
  if(!ptrs.size){                                  /* 所有手指都抬起来了才算一次点击 */
    /* 必须是「点一下」，拖着画一笔（画矩形、框选、搬东西）不算 ——
       不然连着画两笔就被当成双击，刚画的东西会被抹掉 */
    const moved=zDownAt?Math.hypot(ep.x-zDownAt.x,ep.y-zDownAt.y):99;
    zDownAt=null;
    /* 曲线画到一半时，双击放大一律不作数 ——
       掰弯的时候本来就要一下下地点线上的点，
       被当成双击的话，画面会自己放大、还会把刚画的东西抹掉。 */
    if(!curve){
      const now=Date.now();
      if(moved<6 && zTapPos && Math.hypot(ep.x-zTapPos.x,ep.y-zTapPos.y)<8 && now-zTapT<DBL_MS){
        if(zTapSnap){ restoreLayers(zTapSnap); history.i=zTapHist; syncUndo(); save(); }
        zoomAt(ep.x,ep.y);
        zTapT=0; zTapPos=null; zTapSnap=null;
        return;
      }
      if(moved<6){ zTapT=now; zTapPos=ep; }
      else { zTapT=0; zTapPos=null; zTapSnap=null; }
    }
  }
  if(ptrs.size<2) pinch=null;
  if(curve){
    if(ptrs.size) return;            /* 还有别的手指没抬起来 —— 不算一次操作 */
    if(curve.step===1){
      curve.step=2;
      if(curve.mode==='free'){ curve.pts=fivePts(curve.p0,curve.p1); curve.grab=null; }
      render();
      toast(curve.mode==='simple' ? '再拖一下，把这条线掰弯' : '按住蓝色小方块往外拉');
    } else if(curve.mode==='simple'){
      commitCurve();                 /* 简单画法：掰完松手就落定，不用点完成 */
    }
    /* 自由画法松手只是把这个点放下 —— 还能接着拖，要点「完成」才算画完 */
    return;
  }
  if(move){
    if(move.type==='buf'){
      stampBuf(move.buf, move.ox+move.dx, move.oy+move.dy);
      const m=new Uint8Array(S.w*S.h);
      for(let y=0;y<move.buf.h;y++)for(let x=0;x<move.buf.w;x++){
        if(move.buf.mask[y*move.buf.w+x]){
          const tx=move.ox+move.dx+x, ty=move.oy+move.dy+y;
          if(tx>=0&&ty>=0&&tx<S.w&&ty<S.h) m[IX(tx,ty)]=1;
        }
      }
      makeSel(m);
    }
    move=null; pushHistory(); render(); save(); return;
  }
  if(preview){
    const wasSel = preview.tool==='sel';
    if(wasSel){
      combineSel(rectMask(preview.a,preview.b,S.selShape==='ellipse'));
      updSelbar();
    } else if(preview.tool==='line'){
      line(preview.a.x,preview.a.y,preview.b.x,preview.b.y,(x,y)=>stamp(x,y,curRGBA(),false));
    } else {
      drawShape(preview.a,preview.b,preview.tool);
    }
    preview=null; stroke=null;
    if(!wasSel) pushHistory();   // 选区只是个框，不进撤销历史
    render(); save(); return;
  }
  // 铅笔/橡皮/喷枪：松手说明这一笔画完了，记一步历史
  if(stroke){ stroke=null; pushHistory(); save(); return; }
  stroke=null; pan=null;
}
cv.addEventListener('pointerup',endPointer);
cv.addEventListener('pointercancel',endPointer);
