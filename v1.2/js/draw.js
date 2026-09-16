/* ==========================================================
   draw.js  —— 具体画法：铅笔/喷枪/形状/填充/改色/描边
   ========================================================== */
/* 铅笔/橡皮落一个点。
   【这里原本有个「像素完美」开关，已经删了】—— 画像素画本来就是 1 像素 = 1 格，
   不存在「这一格完美、那一格不完美」的情况，所以默认就是这个样子，不给人关。 */
function drawPoint(sp){
  const erase=stroke.tool==='eraser';
  if(erase){ stamp(sp.x,sp.y,null,true); return; }
  stamp(sp.x,sp.y,curRGBA(),false);
}
function sprayAt(sp){
  const n=S.sprayD*3, rgba=curRGBA();
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, r=Math.random()*S.sprayR;
    paint(Math.round(sp.x+Math.cos(a)*r),Math.round(sp.y+Math.sin(a)*r),rgba,false);
  }
}
/* 点在椭圆里面吗 —— 椭圆边缘判定全靠它 */
function ellipseIn(cx,cy,rx,ry,x,y){
  const dx=(x-cx)/rx, dy=(y-cy)/ry;
  return dx*dx+dy*dy<=1;
}
/* 形状自己的边缘：在形状里，但四邻有一个在外面 → 这一格就是边缘。
   「填充」没勾的时候就只画这一圈（当前色），中间留空。
   椭圆不能按「离圆心多远」算 —— 圆越大那条环带就越宽，会越画越粗（v19 之前的老毛病）。 */
function ellipseEdge(cx,cy,rx,ry,x,y){
  return !ellipseIn(cx,cy,rx,ry,x-1,y)||!ellipseIn(cx,cy,rx,ry,x+1,y)
      || !ellipseIn(cx,cy,rx,ry,x,y-1)||!ellipseIn(cx,cy,rx,ry,x,y+1);
}
/* 矩形/椭圆两个独立开关，各管一摊：
     填充 S.shapeFill —— 中间填不填当前色。勾 = 实心，不勾 = 只剩一圈轮廓（空心）
     描边 S.shapeRing —— 外面多包一圈纯黑。额外多出来的，不占形状自己那一圈
   两个都勾 = 实心 + 外圈黑；两个都不勾 = 一个空心线框（当前色） */
const RING=[0,0,0,255];   /* 纯黑，不跟当前色走 */
function drawShape(a,b,tool){
  /* 不用 stamp —— stamp 会套用 S.size（笔刷大小），
     要是刚才用铅笔调成了 8，画个小方块会变成一堆大方块。形状就是一格一格铺。 */
  const main=curRGBA(), pts=[];
  shapePoints(a,b,tool,pts);
  for(let i=0;i<pts.length;i++){
    if(!S.shapeFill&&!pts[i][2]) continue;    /* 不填充 → 只留边缘那一圈 */
    putPix(pts[i][0],pts[i][1],main[0],main[1],main[2],255);
  }
  if(S.shapeRing){
    const r=ringPoints(a,b,tool);
    for(let i=0;i<r.length;i++){ putPix(r[i][0],r[i][1],RING[0],RING[1],RING[2],255); }
  }
}
/* 形状外面那一圈黑在哪。
   矩形：比本体上下左右各外扩一格，是个闭合框，**四个角必须包上** —— 缺角的框看着像没画完。
   椭圆：不在椭圆里、但上下左右挨着椭圆里某一格的那些格。按四邻接算（斜的不算），
        所以永远是一格宽，不会像以前那样圆越大描边越粗。 */
function ringPoints(a,b,tool){
  const out=[];
  if(tool==='rect'){
    const x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x),y0=Math.min(a.y,b.y),y1=Math.max(a.y,b.y);
    for(let x=x0-1;x<=x1+1;x++){ out.push([x,y0-1]); out.push([x,y1+1]); }
    for(let y=y0;y<=y1;y++){ out.push([x0-1,y]); out.push([x1+1,y]); }
    return out;
  }
  const cx=(a.x+b.x)/2, cy=(a.y+b.y)/2, rx=Math.abs(b.x-a.x)/2+.5, ry=Math.abs(b.y-a.y)/2+.5;
  const x0=Math.min(a.x,b.x)-1,x1=Math.max(a.x,b.x)+1,y0=Math.min(a.y,b.y)-1,y1=Math.max(a.y,b.y)+1;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    if(ellipseIn(cx,cy,rx,ry,x,y)) continue;
    if(ellipseIn(cx,cy,rx,ry,x-1,y)||ellipseIn(cx,cy,rx,ry,x+1,y)
    ||ellipseIn(cx,cy,rx,ry,x,y-1)||ellipseIn(cx,cy,rx,ry,x,y+1)) out.push([x,y]);
  }
  return out;
}
/* ==========================================================
   曲线
   两种画法共用一个工具，参数栏里切「简单 / 自由」：
     简单 simple —— 拖出一条直线 → 松手 → 再拖一下把它掰弯 → 松手就落定
                    （二次贝塞尔，一个控制点，只能往一边弯）
     自由 free   —— 拖出一条直线 → 自动打上 5 个点 → 按住任意一个往外拉 → 点「完成」落定
                    （Catmull-Rom，线穿过每个点；5 个点固定，不能再加）
   算法和交互都是从预览模板 curve-mock.html 原样搬过来的 ——
   那两种是用户一个个试过、挑出来的，别自作主张改手感。
   ========================================================== */
/* 二次贝塞尔：p0 起点、c 控制点、p1 终点。线不穿过控制点，控制点只是把它拽过去 */
function bez2Pts(p0,c,p1){
  const out=[], L=Math.hypot(c.x-p0.x,c.y-p0.y)+Math.hypot(p1.x-c.x,p1.y-c.y);
  const n=Math.max(12,Math.ceil(L*2));
  for(let i=0;i<=n;i++){ const t=i/n, u=1-t;
    out.push({x:u*u*p0.x+2*u*t*c.x+t*t*p1.x, y:u*u*p0.y+2*u*t*c.y+t*t*p1.y}); }
  return out;
}
/* Catmull-Rom：线【穿过】每一个给定的点，拐弯处自动圆顺。
   拖动某一点时，只有它附近跟着变圆顺，远处不动 —— 这就是「每个点都能拉」的手感来源 */
function catmullPts(pts){
  if(pts.length<2) return pts.slice();
  const out=[];
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[i-1]||pts[i], p1=pts[i], p2=pts[i+1], p3=pts[i+2]||pts[i+1];
    const L=Math.hypot(p2.x-p1.x,p2.y-p1.y);
    const n=Math.max(6,Math.ceil(L*2));
    for(let k=0;k<n;k++){
      const t=k/n, t2=t*t, t3=t2*t;
      out.push({x:0.5*((2*p1.x)+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
                y:0.5*((2*p1.y)+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3)});
    }
  }
  out.push(pts[pts.length-1]);
  return out;
}
/* 一条直线自动打 5 个点：起点 / 四分一 / 中心 / 四分三 / 终点 ——
   拉中间出 C 形，两个四分点往反方向拉就出 S 形，够用了。
   【就这 5 个，不让加】—— 能随便加的话，点越拖越多、线越拖越乱。 */
function fivePts(a,b){
  return [0,0.25,0.5,0.75,1].map(t=>({x:Math.round(a.x+(b.x-a.x)*t), y:Math.round(a.y+(b.y-a.y)*t)}));
}
/* 一串浮点采样点 → 像素格清单。
   用 Bresenham（跟铅笔、直线是同一个 line()）把相邻采样点连起来 ——
   落定时也走同一份清单，所以「手指看到的」和「松手画上去的」是同一条线，不会变折线。 */
function polyCells(pts){
  const seen=new Set(), out=[];
  const add=(x,y)=>{ const k=(x+600)*2000+(y+600); if(seen.has(k)) return; seen.add(k); out.push([x,y]); };
  if(!pts.length) return out;
  if(pts.length===1){ add(Math.round(pts[0].x),Math.round(pts[0].y)); return out; }
  for(let i=1;i<pts.length;i++)
    line(Math.round(pts[i-1].x),Math.round(pts[i-1].y),Math.round(pts[i].x),Math.round(pts[i].y),add);
  return out;
}
/* 当前这条曲线占哪几格 */
function curveCells(){
  if(!curve) return [];
  return polyCells(curve.mode==='simple' ? bez2Pts(curve.p0,curve.c1,curve.p1) : catmullPts(curve.pts));
}
/* 预览：曲线本体（半透明当前色，粗细跟笔刷大小走）+ 控制点方块 */
function drawCurve(){
  if(!curve) return;
  const sc=V.scale, c=curRGBA(), o=Math.floor((S.size-1)/2);
  ctx.globalAlpha=.8;
  ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;
  const cells=curveCells();
  for(let i=0;i<cells.length;i++)
    ctx.fillRect(V.ox+(cells[i][0]-o)*sc, V.oy+(cells[i][1]-o)*sc, sc*S.size, sc*S.size);
  ctx.globalAlpha=1;
  /* 控制点：方块大小跟着缩放走，但不小于 8px ——
     画布缩到 1 倍时方块也得看得见、点得着 */
  const s=clamp(sc*.9,8,14);
  const sq=(p,col)=>{
    const cx=V.ox+(p.x+.5)*sc, cy=V.oy+(p.y+.5)*sc;
    ctx.fillStyle=col; ctx.fillRect(cx-s/2,cy-s/2,s,s);
    ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.strokeRect(cx-s/2,cy-s/2,s,s);
  };
  const dash=(a,b)=>{
    ctx.strokeStyle='rgba(91,140,255,.85)';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);
    ctx.beginPath();ctx.moveTo(V.ox+(a.x+.5)*sc,V.oy+(a.y+.5)*sc);
    ctx.lineTo(V.ox+(b.x+.5)*sc,V.oy+(b.y+.5)*sc);ctx.stroke();ctx.setLineDash([]);
  };
  if(curve.mode==='simple'){
    if(curve.p0&&curve.p1){
      if(curve.step===2) dash(curve.p0,curve.c1);      /* 虚线告诉你「控制点拽的是起点那一头」 */
      sq(curve.p0,'#11131a'); sq(curve.p1,'#11131a');
      sq(curve.c1,'#5b8cff');
    }
  } else if(curve.step===2){
    /* 正在拖的那个点染成橙色，一眼看出抓到了哪个 */
    curve.pts.forEach((q,i)=>sq(q, i===curve.grab?'#ffb35b':'#5b8cff'));
  }
}
function drawPreview(){
  if(!preview) return;
  const sc=V.scale, c=curRGBA();
  ctx.globalAlpha=.8;
  if(preview.tool==='sel'){
    const x0=Math.min(preview.a.x,preview.b.x),x1=Math.max(preview.a.x,preview.b.x);
    const y0=Math.min(preview.a.y,preview.b.y),y1=Math.max(preview.a.y,preview.b.y);
    ctx.strokeStyle='#fff';ctx.setLineDash([4,4]);ctx.lineWidth=1.4;
    ctx.strokeRect(V.ox+x0*sc,V.oy+y0*sc,(x1-x0+1)*sc,(y1-y0+1)*sc);
    ctx.setLineDash([]);
  } else if(preview.tool==='line'){
    ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;
    const o=Math.floor((S.size-1)/2);
    line(preview.a.x,preview.a.y,preview.b.x,preview.b.y,(x,y)=>{
      ctx.fillRect(V.ox+(x-o)*sc,V.oy+(y-o)*sc,sc*S.size,sc*S.size);
    });
  } else {
    const pts=[];
    shapePoints(preview.a,preview.b,preview.tool,pts);
    const inDoc2=(x,y)=>x>=0&&y>=0&&x<S.w&&y<S.h;   /* 画布外的格子别画到棋盘格上 */
    ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;
    for(let i=0;i<pts.length;i++){
      if(!S.shapeFill&&!pts[i][2]) continue;      /* 没勾填充，预览也是空心的 */
      if(!inDoc2(pts[i][0],pts[i][1])) continue;
      ctx.fillRect(V.ox+pts[i][0]*sc,V.oy+pts[i][1]*sc,sc,sc);
    }
    /* 外围那圈黑也要一起预览出来，不然拖动看到的和松手画出来的不是一个东西 */
    if(S.shapeRing){
      const r=ringPoints(preview.a,preview.b,preview.tool);
      ctx.fillStyle='rgb(0,0,0)';
      for(let i=0;i<r.length;i++){
        /* 画布外的黑边不画 —— 溢到棋盘格上会看着像画布变大了一圈 */
        if(!inDoc2(r[i][0],r[i][1])) continue;
        ctx.fillRect(V.ox+r[i][0]*sc,V.oy+r[i][1]*sc,sc,sc);
      }
    }
  }
  ctx.globalAlpha=1;
}
/* 形状本体的格子清单。每一项是 [x, y, 是不是边缘]。
   第三位给「填充」用 —— 没勾填充时只画边缘那一圈，中间留空。
   拖拽预览和抬手落盘走的是同一个函数，免得手指看到的跟松手画出来的不是一个东西。 */
function shapePoints(a,b,tool,out){
  if(tool==='rect'){
    const x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x),y0=Math.min(a.y,b.y),y1=Math.max(a.y,b.y);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) out.push([x,y,(y===y0||y===y1||x===x0||x===x1)]);
  } else {
    const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,rx=Math.abs(b.x-a.x)/2+.5,ry=Math.abs(b.y-a.y)/2+.5;
    const y0=Math.min(a.y,b.y),y1=Math.max(a.y,b.y),x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      if(!ellipseIn(cx,cy,rx,ry,x,y)) continue;
      out.push([x,y,ellipseEdge(cx,cy,rx,ry,x,y)]);
    }
  }
}
function drawMoveBuf(){
  const b=move.buf; if(!b) return;
  const ox=move.ox+move.dx, oy=move.oy+move.dy;
  ctx.globalAlpha=.9;
  for(let y=0;y<b.h;y++)for(let x=0;x<b.w;x++){
    if(!b.mask[y*b.w+x]) continue;
    const di=(y*b.w+x)*4;
    if(b.data[di+3]===0) continue;
    ctx.fillStyle=`rgba(${b.data[di]},${b.data[di+1]},${b.data[di+2]},1)`;
    ctx.fillRect(V.ox+(ox+x)*V.scale,V.oy+(oy+y)*V.scale,V.scale,V.scale);
  }
  ctx.globalAlpha=1;
}
function flood(sp,rgba){
  if(!inDoc(sp)) return;
  if(S.replScope==='sel'&&sel){
    for(let y=0;y<S.h;y++)for(let x=0;x<S.w;x++) if(sel.mask[IX(x,y)]) putPix(x,y,rgba[0],rgba[1],rgba[2],255);
    return;
  }
  const t=getPix(sp.x,sp.y);
  if(t[0]===rgba[0]&&t[1]===rgba[1]&&t[2]===rgba[2]&&t[3]===rgba[3]) return;
  const st=[[sp.x,sp.y]], seen=new Uint8Array(S.w*S.h);
  while(st.length){
    const c=st.pop(), x=c[0], y=c[1];
    if(x<0||y<0||x>=S.w||y>=S.h) continue;
    const k=IX(x,y); if(seen[k])continue; seen[k]=1;
    const p=getPix(x,y);
    if(p[0]!==t[0]||p[1]!==t[1]||p[2]!==t[2]||p[3]!==t[3]) continue;
    putPix(x,y,rgba[0],rgba[1],rgba[2],255);
    st.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
  }
}
/* 【replaceColor() 改色 已经删了】—— 改色 = 把某一种颜色整体换成另一种，
   而「魔棒选区 + 填充」本来就是这个效果，单独一个工具多余。 */
/* 描边：只给**选区里**的图形外面加一圈纯黑。
   两处关键的改动（都是之前被吐槽过的）：
   ① 颜色固定纯黑 [0,0,0,255]，不再用当前色 ——
      用当前色时描边跟图形同色，看着像整个图形胖了一圈 / 挪了位，根本不像描边。
   ② 只在选区里生效。以前点一下画面，画布上每个东西都给描上，没法只描某一个。
      想给谁描 → 先用选区框住谁。没选区时描边工具是灰的，点不动。 */
function doOutline(range){
  const W=S.w, H=S.h;
  /* range：描哪个范围。由 outline 工具传进来 —— 它先把框里的那个「东西」认出来，
     把这个东西传进来，黑边就沿着东西的真实轮廓走，而不是沿着那个方框走。
     没传就退回用当前选区。 */
  const inSel=range?((x,y)=>{ if(x<0||y<0||x>=W||y>=H) return false; return !!range[IX(x,y)]; })
    :(sel?((x,y)=>{ if(x<0||y<0||x>=W||y>=H) return false; return !!sel.mask[IX(x,y)]; }):(()=>true));
  let painted=new Uint8Array(W*H);      /* 这一圈刚画上去的黑 —— 描第二圈时拿它当新的边 */
  for(let pass=0;pass<S.outlineW;pass++){
    const src=new Uint8ClampedArray(S.pixels);
    const prev=painted; painted=new Uint8Array(W*H);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=IX(x,y), isOp=src[i*4+3]>0;
      if(S.outlineSide==='out'){
        if(isOp) continue;              /* 只往空白处加黑，不盖住画面 */
        /* 源 = 选区里的图形（第一圈）；描第二圈时源 = 刚画上的那圈黑。
           黑可以画到选区外面一格 —— 框得很紧时也看得见，不然等于没描。 */
        let hit=false;
        for(let k=0;k<8;k++){
          const nx=x+N8[k][0], ny=y+N8[k][1];
          if(nx<0||ny<0||nx>=W||ny>=H) continue;
          const j=IX(nx,ny);
          if(src[j*4+3]>0 && (pass===0?inSel(nx,ny):prev[j])){ hit=true; break; }
        }
        if(hit){ putPix(x,y,0,0,0,255); painted[i]=1; }
      } else {
        if(!isOp||!inSel(x,y)) continue;   /* 只涂选区里已经画上的东西 */
        /* 内侧 = 图形自己最外那一圈（四邻里有空的）。
           以前这里写的是「四邻全满」，实心块永远不成立，等于什么都没描。 */
        let edge=false;
        for(let k=0;k<4;k++){
          const nx=x+N4[k][0], ny=y+N4[k][1];
          if(nx<0||ny<0||nx>=W||ny>=H){ edge=true; break; }
          const j=IX(nx,ny);
          if(src[j*4+3]===0||prev[j]){ edge=true; break; }
        }
        if(edge){ putPix(x,y,0,0,0,255); painted[i]=1; }
      }
    }
  }
}
