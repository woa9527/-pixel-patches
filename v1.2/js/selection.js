/* ==========================================================
   selection.js  —— 选区：框选 / 魔棒 / 复制粘贴 / 填充删除
   ========================================================== */
/* ---------- 选区 ---------- */
function clearSel(){ sel=null; ensureAnts(); updSelbar(); }
function updSelbar(){
  const b=$('#selbar');
  const t = ['select','move','pencil','eraser','fill','spray'].indexOf(S.tool)>=0;
  // 有选区、或剪贴板里有内容（等着粘贴）时都显示
  b.classList.toggle('on', t && !!(sel || clip));
  /* 选区一变，描边工具跟着亮 / 灰。这里只改 class，不重建工具栏
     （buildTools 会调到这里，重建就递归了） */
  const o=document.querySelector('.tool[data-t="outline"]');
  if(o) o.classList.toggle('off', !sel);
}
function makeSel(mask){
  let n=0,x0=1e9,y0=1e9,x1=-1,y1=-1;
  for(let y=0;y<S.h;y++)for(let x=0;x<S.w;x++){
    if(mask[IX(x,y)]){n++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  }
  if(!n){ clearSel(); return; }
  sel={mask,n,x0,y0,x1,y1};
  ensureAnts(); updSelbar();
}
function combineSel(newMask){
  if(!sel||S.selMode==='new'){ makeSel(newMask); return; }
  const m=new Uint8Array(S.w*S.h);
  for(let i=0;i<m.length;i++){
    m[i] = S.selMode==='add' ? ((sel.mask[i]||newMask[i])?1:0) : ((sel.mask[i]&&!newMask[i])?1:0);
  }
  makeSel(m);
}
function rectMask(a,b,ellipse){
  const m=new Uint8Array(S.w*S.h);
  /* ★ 边界必须自己钳住 —— IX() 算的是 y*S.w+x，是个一维扁平下标，
     x 一旦出界就会一路串到【相邻的那一行】上去：
     右边拖出去的那一截，会整块绕到左边的同一行里冒出来
     （左边拖出去则绕到右边），看着就像选区被裁下来贴到了对面。
     手指拖着拖着出了画布再松手是常事，所以这里必须收。
     （y 出界倒是直接写到数组后面被忽略掉，但同样顺手收了。） */
  const x0=clamp(Math.min(a.x,b.x),0,S.w-1), x1=clamp(Math.max(a.x,b.x),0,S.w-1);
  const y0=clamp(Math.min(a.y,b.y),0,S.h-1), y1=clamp(Math.max(a.y,b.y),0,S.h-1);
  if(ellipse){
    const cx=(x0+x1)/2, cy=(y0+y1)/2, rx=(x1-x0)/2+.5, ry=(y1-y0)/2+.5;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const dx=(x-cx)/rx, dy=(y-cy)/ry;
      if(dx*dx+dy*dy<=1) m[IX(x,y)]=1;
    }
  } else {
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) m[IX(x,y)]=1;
  }
  return m;
}
/* 从 (x,y) 出发，把它连成一片的那一整个「东西」找出来 —— 认东西用的。
   以前的魔棒是「找跟这一点颜色完全相同的」，可一丛灌木里有好几种绿，
   按颜色找只能选中其中一块，根本选不全，所以没人用。
   现在改成按「连不连得上」找：只要是不透明的格子、又跟起点连成一片，就算同一个东西，
   跟颜色无关。斜着挨着也算连着（像素画的斜线本来就是这么接的）。 */
/* 【锁定联动（选区）】魔棒认的是【当前能改的那些层】合起来的样子 —— 可见 + 没锁。
   锁住的层直接视而不见，所以「锁住的层选不中」是真的选不中，不是选上了又不用。 */
function lyAlphaMask(){
  const m=new Uint8Array(S.w*S.h);
  for(let k=S.layers.length-1;k>=0;k--){
    const L=S.layers[k]; if(!L.vis||L.lock) continue;
    const b=L.buf;
    for(let i=0;i<m.length;i++) if(b[i*4+3]) m[i]=1;
  }
  return m;
}
function blobMask(x,y){
  const m=new Uint8Array(S.w*S.h);
  if(x<0||y<0||x>=S.w||y>=S.h) return m;
  const A=lyAlphaMask();
  if(!A[IX(x,y)]) return m;                    /* 点在透明处（或只点在锁住的层上）：什么也没有 */
  const st=[IX(x,y)]; m[st[0]]=1;
  while(st.length){
    const k=st.pop(), cx=k%S.w, cy=(k-cx)/S.w;
    for(let i=0;i<8;i++){
      const nx=cx+N8[i][0], ny=cy+N8[i][1];
      if(nx<0||ny<0||nx>=S.w||ny>=S.h) continue;
      const j=IX(nx,ny);
      if(m[j]||!A[j]) continue;
      m[j]=1; st.push(j);
    }
  }
  return m;
}
function magicMask(sp){ return blobMask(sp.x,sp.y); }
/* 在当前选区里认出最大的那一个「东西」。
   框得不准没关系 —— 认的是物体本身，不是那个方框。
   框里万一混进了别的东西的一角，取最大的那个，通常就是你要的那个。 */
function selBlob(){
  if(!sel) return null;
  const A=lyAlphaMask();
  const seen=new Uint8Array(S.w*S.h);
  let best=null, bestN=0;
  for(let y=sel.y0;y<=sel.y1;y++)for(let x=sel.x0;x<=sel.x1;x++){
    const i=IX(x,y);
    if(seen[i]||!sel.mask[i]||!A[i]) continue;
    const m=blobMask(x,y);
    let n=0;
    for(let k=0;k<m.length;k++) if(m[k]){ n++; seen[k]=1; }   /* 标记掉，免得同一个东西被认两遍 */
    if(n>bestN){ bestN=n; best=m; }
  }
  return best;
}
function extractBuf(){
  if(!sel) return null;
  const w=sel.x1-sel.x0+1, h=sel.y1-sel.y0+1;
  const data=new Uint8ClampedArray(w*h*4), mask=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const sx=sel.x0+x, sy=sel.y0+y;
    if(!sel.mask[IX(sx,sy)]) continue;
    mask[y*w+x]=1;
    const si=IX(sx,sy)*4, di=(y*w+x)*4;
    data[di]=S.pixels[si];data[di+1]=S.pixels[si+1];data[di+2]=S.pixels[si+2];data[di+3]=S.pixels[si+3];
  }
  return {w,h,data,mask};
}
function clearSelArea(){
  if(!sel) return;
  for(let y=0;y<S.h;y++)for(let x=0;x<S.w;x++) if(sel.mask[IX(x,y)]) putPix(x,y,0,0,0,0);
}
function stampBuf(buf,ox,oy){
  for(let y=0;y<buf.h;y++)for(let x=0;x<buf.w;x++){
    if(!buf.mask[y*buf.w+x]) continue;
    const di=(y*buf.w+x)*4;
    putPix(ox+x,oy+y,buf.data[di],buf.data[di+1],buf.data[di+2],buf.data[di+3]);
  }
}
function selCopy(){ if(lyWriteGuard())return; const b=extractBuf(); if(b){clip=b;updSelbar();toast('已复制，取消选区后也能粘贴');} }
function selCut(){ if(lyWriteGuard())return; const b=extractBuf(); if(b){clip=b;clearSelArea();pushHistory();updSelbar();render();save();toast('已剪切，可拖到别处粘贴');} }
function selPaste(){
  if(!clip){ toast('剪贴板是空的'); return; }
  if(lyWriteGuard()) return;
  const ox = sel? sel.x0 : Math.max(0,Math.floor((S.w-clip.w)/2));
  const oy = sel? sel.y0 : Math.max(0,Math.floor((S.h-clip.h)/2));
  stampBuf(clip,ox,oy);
  const m=new Uint8Array(S.w*S.h);
  for(let y=0;y<clip.h;y++)for(let x=0;x<clip.w;x++){
    if(clip.mask[y*clip.w+x]){
      const tx=ox+x, ty=oy+y;
      if(tx>=0&&ty>=0&&tx<S.w&&ty<S.h) m[IX(tx,ty)]=1;
    }
  }
  makeSel(m); pushHistory(); render(); save(); toast('已粘贴，可拖动移动');
}
function selFlipH(){
  if(!sel){toast('先框选一块区域');return;}
  if(lyWriteGuard()) return;
  const buf=extractBuf(); if(!buf) return;
  const nb={w:buf.w,h:buf.h,data:new Uint8ClampedArray(buf.w*buf.h*4),mask:new Uint8Array(buf.w*buf.h)};
  for(let y=0;y<buf.h;y++)for(let x=0;x<buf.w;x++){
    const sx=buf.w-1-x, si=(y*buf.w+sx)*4, di=(y*buf.w+x)*4;
    nb.data[di]=buf.data[si];nb.data[di+1]=buf.data[si+1];nb.data[di+2]=buf.data[si+2];nb.data[di+3]=buf.data[si+3];
    nb.mask[y*buf.w+x]=buf.mask[y*buf.w+sx];
  }
  clearSelArea(); stampBuf(nb,sel.x0,sel.y0); pushHistory();
  render(); save(); toast('已水平翻转');
}
function selFill(){
  if(!sel){toast('先框选一块区域');return;}
  if(lyWriteGuard()) return;
  const c=curRGBA();
  for(let y=0;y<S.h;y++)for(let x=0;x<S.w;x++) if(sel.mask[IX(x,y)]) putPix(x,y,c[0],c[1],c[2],255);
  pushHistory(); render(); save();
}
function selDel(){
  if(!sel) return;
  if(lyWriteGuard()) return;
  clearSelArea(); pushHistory(); render(); save(); toast('已删除选区内容');
}
/* 【selAll() 全选画布 已经删了】—— 全选之后能干的两件事都有别的路：
   整幅填充 = 填充工具切到「整个选区」；整幅删除 = 菜单里的「清空画布」。
   专门留一个按钮（还要占一块参数栏）不值当。 */
