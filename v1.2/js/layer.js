/* ==========================================================
   layer.js  —— 图层：一个面板，两个入口
     底栏「图层」→ 抽屉（占掉画布下半屏，信息最全）
     顶栏「图层」→ 漂浮窗（飘在画布上面，一笔不挤画布，吸附右侧）
   两个入口共用一个「开没开」的开关，所以天然互斥：
     漂浮窗开着时点底栏那个 → 漂浮窗收起、抽屉打开，反过来同理。

   层序：S.layers[0] = 最上面那层（跟 PS 一致），下标越大越靠下。
   ========================================================== */
const LY_EYE='<svg viewBox="0 0 24 24"><path d="M12 5c5 0 9 4.5 9 7s-4 7-9 7-9-4.5-9-7 4-7 9-7zm0 3.2A3.8 3.8 0 1012 15.8 3.8 3.8 0 0012 8.2z"/></svg>';
const LY_EYEX=LY_EYE+'<path d="M3.6 3.6l16.8 16.8" stroke="currentColor" stroke-width="2.6" fill="none"/>';
const LY_LOCK='<svg viewBox="0 0 24 24"><path d="M8 10V8a4 4 0 018 0v2h-1.2V8a2.8 2.8 0 00-5.6 0v2H8z"/><rect x="6" y="10" width="12" height="10" rx="2"/></svg>';

/* ---------- 小工具 ---------- */
const curLayer = ()=> S.layers[clamp(S.lyCur,0,S.layers.length-1)];
const curLocked= ()=> curLayer().lock;
/* 会往画布上写东西的工具：当前层锁住时一律不许动。
   移动不在这里 —— 它是「锁住的层原地不动」，不是「不许用」。 */
const LY_WRITE=['pencil','eraser','fill','spray','line','curve','rect','ellipse','outline'];
/* 当前层锁住时，任何会往画布上写东西的操作都要先挡一道（选区那几个按钮也走它） */
function lyWriteGuard(){
  if(curLocked()){ toast('当前图层锁住了，先点图层里的锁头解锁'); return true; }
  return false;
}

/* ---------- 数据操作 ---------- */
function setCurLayer(i){
  i=clamp(i,0,S.layers.length-1);
  if(i===S.lyCur) { renderLayers(); return; }
  S.lyCur=i; syncPx();
  renderLayers(); render();
}
function lyToggleEye(i){
  const L=S.layers[i]; if(!L) return;
  L.vis=!L.vis; flatDirty=true;
  renderLayers(); render(); save(); animSync();
  toast(L.vis?'显示「'+L.name+'」':'藏起「'+L.name+'」');
}
function lyToggleLock(i){
  const L=S.layers[i]; if(!L) return;
  L.lock=!L.lock;
  renderLayers(); save();
  toast(L.lock?'锁住「'+L.name+'」：画不上去、移动带不走它、选区也选不中':'解锁「'+L.name+'」');
}
/* 【新层的编号 = 现存「图层 N」里最大的 N + 1，不是一直往上加的计数器】
   以前用的是 S.lyN++（只增不减），于是：
     有 1 号 → 新建得 2 号 → 删掉 2 号 → 再新建就跳到 3 号，
     空着一个 2 号没人用，画到后面全是「图层 7 / 图层 11」这种天坑数字。
   改成扫一遍现存名字：只认「图层 数字」这种还没被改过名的，
   取最大的那个 +1。改过名的（比如「天空」）不参与编号，也不会被顶掉。
   所以删掉 2 号再建，新层老老实实还是 2 号。 */
function nextLayerNo(){
  let mx=0;
  S.layers.forEach(L=>{
    const m=/^图层\s*(\d+)$/.exec(L.name||'');
    if(m) mx=Math.max(mx,parseInt(m[1],10));
  });
  return mx+1;
}
/* 【新层一律加到最下面】（别改回 unshift）
   帧是从上往下播的，新加的一层 = 动画的【下一帧】，当然要排在最底下。
   以前是从最上面插（unshift），结果每次新建都把 1 号图层往下挤一格，
   画到第 4 帧时顺序全是反的，得手动一层层拖回来 —— 用户明确提了。 */
function lyAdd(){
  S.layers.push(mkLayer('图层 '+nextLayerNo()));
  S.lyCur=S.layers.length-1; syncPx();
  rebuildFlat(); pushHistory(); renderLayers(); render(); save(); animSync();
  toast('在最下面加了一层（= 动画的下一帧）');
}
function lyDel(i){
  if(S.layers.length<=1){ toast('至少要留一层'); return; }
  const L=S.layers[i]; if(!L) return;
  S.layers.splice(i,1);
  S.lyCur=clamp(S.lyCur===i?Math.min(i,S.layers.length-1):(S.lyCur>i?S.lyCur-1:S.lyCur),0,S.layers.length-1);
  syncPx(); flatDirty=true;
  pushHistory(); renderLayers(); render(); save(); animSync();
  toast('删掉「'+L.name+'」');
}
/* 【复制图层 / 向下合并 都不要】—— 用户原话「复制不需要，向下合并不需要」。
   排序靠长按拖；想合在一起就手动画，专门留按钮多余。 */
/* 上移 / 下移一层：只挪一格时比长按拖快。下标小 = 更靠上 */
function lyMove(dir){
  const i=S.lyCur, j=i+dir;
  if(j<0||j>=S.layers.length){ toast(dir<0?'已经在最上面了':'已经在最下面了'); return; }
  const t=S.layers[i]; S.layers[i]=S.layers[j]; S.layers[j]=t;
  S.lyCur=j; syncPx();
  pushHistory(); renderLayers(); render(); save(); animSync();
  toast('「'+t.name+'」'+(dir<0?'上移':'下移')+'一层 → 第 '+(j+1)+' 层');
}

/* ==========================================================
   长按拖拽排序
   长按 0.45 秒 → 这一层浮起来跟手指走；底下拉一条蓝线告诉你「会插到哪儿」。
   判据：松手时手指落在目标层的上半 → 插到它上面；下半 → 插到它下面。

   【手机上拖不动的坑，改动前务必看】
   手指一移动，浏览器就判定成「要滚页面」，然后发一个 pointercancel 把这次手势掐掉 ——
   表现就是「长按能选中，但拖不动」。光在 pointermove 里 preventDefault 没用
   （滚动判定发生在它之前），必须在【非被动】的 touchmove 监听里 preventDefault，
   浏览器才会把手势交还给我们。另外 body 加 .dragging 锁掉页面滚动，
   长按期间也别弹系统的「复制/分享」菜单。
   ========================================================== */
let lpT=null, lpX=0, lpY=0, lyDrag=null, justDragged=false;
function lyBeginDrag(el,i,e){
  const L=S.layers[i]; if(!L) return;
  const host=el.parentElement;
  lyDrag={el,i,host,ov:host.style.overflow,at:null};
  el.classList.add('lift');
  host.style.overflow='hidden';                 /* 拖的时候别让列表自己滚，位置会算错 */
  document.body.classList.add('dragging');
  const g=document.createElement('div'); g.className='lyghost';
  const c=document.createElement('canvas'); drawThumb(c,L);
  g.appendChild(c); g.appendChild(document.createTextNode(L.name));
  const ln=document.createElement('div'); ln.className='lydrop';
  document.body.appendChild(g); document.body.appendChild(ln);
  lyDrag.ghost=g; lyDrag.line=ln;
  lyMoveGhost(e.clientX,e.clientY);
  toast('拖到哪一层就插到哪儿（上半 → 上面，下半 → 下面）');
}
function lyMoveGhost(x,y){
  const d=lyDrag; if(!d) return;
  d.ghost.style.left=x+'px'; d.ghost.style.top=y+'px';
  const items=[...d.host.querySelectorAll('[data-ly]')];
  let at=items.length;
  for(let i=0;i<items.length;i++){
    const r=items[i].getBoundingClientRect();
    if(y<r.top+r.height/2){ at=i; break; }
    if(y<r.bottom){ at=i+1; break; }
  }
  d.at=at;
  if(!items.length) return;
  const r=items[Math.min(at,items.length-1)].getBoundingClientRect();
  d.line.style.left=r.left+'px';
  d.line.style.width=r.width+'px';
  d.line.style.top=((at<items.length)?(r.top-2):(r.bottom-1))+'px';
}
function lyEndDrag(){
  if(!lyDrag) return;
  const {el,i,at,host,ov}=lyDrag;
  lyDrag.ghost.remove(); lyDrag.line.remove();
  el.classList.remove('lift'); host.style.overflow=ov;
  document.body.classList.remove('dragging');
  lyDrag=null; justDragged=true;
  if(at!=null&&at!==i){
    let t=at; if(t>i) t--;                     /* 把自己抽走后，后面的下标要往回挪一格 */
    if(t!==i&&t>=0&&t<S.layers.length){
      const [o]=S.layers.splice(i,1); S.layers.splice(t,0,o);
      S.lyCur=t; syncPx();
      pushHistory();
      toast('「'+o.name+'」挪到了第 '+(t+1)+' 层');
    }
  }
  renderLayers(); render(); save(); animSync();
  setTimeout(()=>{justDragged=false;},60);
}
/* 关键：非被动监听 + preventDefault。少了 {passive:false} 这一句，手机上就拖不动。 */
document.addEventListener('touchmove',e=>{
  if(lyDrag){
    e.preventDefault();
    const t=e.touches[0]; if(t) lyMoveGhost(t.clientX,t.clientY);
    return;
  }
  if(lpT){                                     /* 长按计时中手指就动了 = 想滚列表 */
    const t=e.touches[0];
    if(t&&Math.hypot(t.clientX-lpX,t.clientY-lpY)>10){ clearTimeout(lpT); lpT=null; }
  }
},{passive:false});
document.addEventListener('pointermove',e=>{
  if(lyDrag){ if(e.cancelable) e.preventDefault(); lyMoveGhost(e.clientX,e.clientY); return; }
  if(lpT&&Math.hypot(e.clientX-lpX,e.clientY-lpY)>10){ clearTimeout(lpT); lpT=null; }
});
document.addEventListener('pointerup',()=>{ clearTimeout(lpT); lpT=null; if(lyDrag) lyEndDrag(); });
document.addEventListener('pointercancel',()=>{ clearTimeout(lpT); lpT=null; if(lyDrag) lyEndDrag(); });
document.addEventListener('contextmenu',e=>{ if(lyDrag||lpT) e.preventDefault(); });

/* ---------- 缩略图 ---------- */
function drawThumb(cvs,L){
  if(!L) return;
  cvs.width=S.w; cvs.height=S.h;
  const c=cvs.getContext('2d');
  const im=c.createImageData(S.w,S.h), d=im.data;
  for(let y=0;y<S.h;y++)for(let x=0;x<S.w;x++){
    const i=(y*S.w+x)*4, col=((x+y)%2)?CHK_B:CHK_A;
    d[i]=col[0]; d[i+1]=col[1]; d[i+2]=col[2]; d[i+3]=255;
  }
  c.putImageData(im,0,0);
  if(!L.vis) return;
  const tmp=document.createElement('canvas'); tmp.width=S.w; tmp.height=S.h;
  tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(L.buf.buffer),S.w,S.h),0,0);
  c.drawImage(tmp,0,0);
}

/* ---------- 面板 ---------- */
function lyItemHTML(L,i,wide){
  const st=[];
  if(L.lock) st.push('已锁定');
  if(!L.vis) st.push('已隐藏');
  return `<div class="item ${i===S.lyCur?'cur':''} ${L.vis?'':'off'}" data-ly="${i}">
    <span class="idx">${i+1}</span>
    <span class="thw"><canvas class="th" data-th="${i}"></canvas>
      ${L.lock?`<i class="lkb">${LY_LOCK}</i>`:''}</span>
    <div class="mid">
      <div class="nm" data-nm="${i}">${esc(L.name)}</div>
      ${wide?`<div class="sub">${i===S.lyCur?('当前 · '+(st.length?st.join(' · '):'可编辑')):(st.length?st.join(' · '):'第 '+(i+1)+' 层')}</div>`:''}
    </div>
    <span class="ic eye ${L.vis?'':'gone'}" data-eye="${i}">${L.vis?LY_EYE:LY_EYEX}</span>
    <span class="ic lk ${L.lock?'on':''}" data-lock="${i}">${LY_LOCK}</span>
    ${wide?`<span class="ic rm" data-del="${i}">✕</span>`:''}
  </div>`;
}
function lyOpsHTML(){
  return `<div class="ops">
    <span data-add class="w2">＋ 新建</span><span data-up>↑</span><span data-down>↓</span>
    <span class="danger" data-delcur>删</span>
  </div>`;
}
/* ---------- 改名 ----------
   点名字那一小块 = 原地变成输入框（不是弹窗，手机上弹窗又小又挡）。
   回车 / 点别处 = 存下；Esc = 反悔；一个字不剩 = 当没改过。
   名字是用户自己敲的，所以存之前 trim、超 16 字截掉，免得把行撑爆。 */
function lyRename(i,el){
  const L=S.layers[i]; if(!L||!el) return;
  const inp=document.createElement('input');
  inp.className='lyin'; inp.type='text';
  inp.value=L.name; inp.maxLength=16;
  inp.spellcheck=false; inp.autocapitalize='off';
  el.replaceWith(inp);
  inp.focus(); inp.select();
  let done=false;
  const finish=ok=>{
    if(done) return; done=true;
    const v=inp.value.trim();
    if(ok&&v&&v!==L.name){ L.name=v; save(); toast('改名「'+v+'」'); }
    renderLayers();
  };
  inp.onkeydown=e=>{
    if(e.key==='Enter'){ e.preventDefault(); finish(true); }
    else if(e.key==='Escape'){ e.preventDefault(); finish(false); }
  };
  inp.onblur=()=>finish(true);
  /* 输入框里的一切点击都留在输入框里，别冒上去触发切层/长按拖拽
     （那两个一响就会 renderLayers，input 当场被重建，字根本打不进去） */
  inp.onclick=e=>e.stopPropagation();
  inp.addEventListener('pointerdown',e=>e.stopPropagation());
}
function lyBind(root){
  root.querySelectorAll('[data-ly]').forEach(n=>{
    const i=+n.dataset.ly;
    n.onclick=e=>{
      if(justDragged){ justDragged=false; return; }        /* 刚拖完，别当成「切当前层」 */
      if(e.target.closest('.lyin')) return;                /* 正在打字，什么都别做 */
      if(e.target.closest('[data-eye]')||e.target.closest('[data-lock]')||e.target.closest('[data-del]')) return;
      const nm=e.target.closest('[data-nm]');
      if(nm){ lyRename(i,nm); return; }                    /* 点名字 = 改名，不再切层 */
      setCurLayer(i);
    };
    n.addEventListener('pointerdown',e=>{
      if(e.target.closest('.lyin')||e.target.closest('[data-nm]')) return;
      if(e.target.closest('[data-eye]')||e.target.closest('[data-lock]')||e.target.closest('[data-del]')) return;
      lpX=e.clientX; lpY=e.clientY;
      clearTimeout(lpT);
      lpT=setTimeout(()=>{lpT=null;lyBeginDrag(n,i,e);},450);
    });
  });
  root.querySelectorAll('[data-eye]').forEach(n=>n.onclick=e=>{e.stopPropagation();lyToggleEye(+n.dataset.eye);});
  root.querySelectorAll('[data-lock]').forEach(n=>n.onclick=e=>{e.stopPropagation();lyToggleLock(+n.dataset.lock);});
  root.querySelectorAll('[data-del]').forEach(n=>n.onclick=e=>{e.stopPropagation();lyDel(+n.dataset.del);});
  const add=root.querySelector('[data-add]');    if(add) add.onclick=lyAdd;
  const up =root.querySelector('[data-up]');     if(up)  up.onclick =()=>lyMove(-1);
  const dn =root.querySelector('[data-down]');   if(dn)  dn.onclick =()=>lyMove(1);
  const dc =root.querySelector('[data-delcur]'); if(dc)  dc.onclick =()=>lyDel(S.lyCur);
  root.querySelectorAll('[data-close]').forEach(n=>n.onclick=e=>{e.stopPropagation();lyOpen(false);});
  root.querySelectorAll('[data-min]').forEach(n=>n.onclick=e=>{e.stopPropagation();S.lyMin=true;renderLayers();save();});
}
function lyOpen(on){ S.lyOpen=on; renderLayers(); save(); }
function renderLayers(){
  const D=$('#lyDrawer'), F=$('#lyFloat');
  if(!D||!F) return;
  D.classList.toggle('on', S.lyOpen&&S.lyMode==='drawer');
  F.classList.toggle('on', S.lyOpen&&S.lyMode==='float');
  F.classList.toggle('min', !!S.lyMin);
  if(S.lyOpen&&S.lyMode==='drawer'){
    D.innerHTML=`<div class="pnl" data-pnl>
      <div class="lhd"><b>图层</b><span class="n">${S.layers.length} 层</span><span class="sp"></span>
        <s data-close>✕</s></div>
      <div class="list">${S.layers.map((L,i)=>lyItemHTML(L,i,true)).join('')}</div>
      ${lyOpsHTML()}
    </div>`;
    /* 点面板外面（那层虚化）= 收起；点面板里面 = 不收。
       少了这一句，点一下「＋ 新建」抽屉就自己关了。 */
    D.querySelector('[data-pnl]').onclick=e=>e.stopPropagation();
    D.onclick=()=>lyOpen(false);
    lyBind(D);
  } else if(S.lyOpen&&S.lyMode==='float'){
    F.innerHTML=`<div class="lhd">
        <span class="grab">⋮⋮</span><b>${S.lyMin?('图层 '+S.layers.length+' 层'):'图层'}</b>
        ${S.lyMin?'':`<span class="n">${S.layers.length}</span>`}<span class="sp"></span>
        ${S.lyMin?'':`<s data-min>－</s>`}
      </div>
      <div class="body">
        <div class="list" style="padding:6px">${S.layers.map((L,i)=>lyItemHTML(L,i,false)).join('')}</div>
        <div style="padding:0 6px 7px">${lyOpsHTML()}</div>
      </div>`;
    lyBind(F);
    lyCapFloatList(F);            /* 钉住 5 项上限（要在量位置之前，高度会影响夹取范围） */
    lyPlaceFloat();
  }
  D.querySelectorAll('[data-th]').forEach(cv=>drawThumb(cv,S.layers[+cv.dataset.th]));
  F.querySelectorAll('[data-th]').forEach(cv=>drawThumb(cv,S.layers[+cv.dataset.th]));
  const b1=$('#btnLayer'), b2=$('#btnLayerTop');
  if(b1) b1.classList.toggle('on', S.lyOpen&&S.lyMode==='drawer');
  if(b2) b2.classList.toggle('on', S.lyOpen&&S.lyMode==='float');
}

/* 漂浮窗最多露出 5 层，超出的用滑块滑。
   layer.css 里那个 max-height:240px 只是 CSS 兜底；这里按【实际量出来的】行高
   再校准一次 —— 以后 item 的 padding / 缩略图尺寸改了，也不会露出半行。 */
function lyCapFloatList(F){
  const list=F.querySelector('.list'); if(!list) return;
  const items=[...list.querySelectorAll('[data-ly]')];
  if(items.length<2) return;
  const a=items[0].getBoundingClientRect(), b=items[1].getBoundingClientRect();
  const step=b.top-a.top;                          /* 一项占的高度（含项间距） */
  if(step<=0) return;                              /* 收起态 list 是 display:none，量出来是 0 */
  list.style.maxHeight=(a.height+step*4)+'px';     /* 第 1 项整高 + 后 4 项步进 = 正好 5 项 */
}

/* ---------- 漂浮窗：只调上下，左右是吸附死的（right:6px） ---------- */
function lyPlaceFloat(){
  const F=$('#lyFloat'); if(!F||!F.classList.contains('on')) return;
  const w=F.parentElement.getBoundingClientRect(), h=F.offsetHeight;
  let top=(S.lyTop==null)?Math.round(w.height*0.08):S.lyTop;
  top=clamp(top,3,Math.max(3,w.height-h-3));
  F.style.top=top+'px';
}
function lyInitFloatDrag(){
  const F=$('#lyFloat');
  let on=false, sy=0, oy=0, moved=false;
  /* 拖完抬手，浏览器还会补一个 click —— 别让那一下把「刚拖好的窗口」
     又当成「点一下展开」处理掉。lyJustDrag 就是挡这个的。 */
  let lyJustDrag=false;
  const down=e=>{
    /* 整条标题栏都是把手。
       以前只认 .grab（一个 16px 宽的小竖条），收起态下 .grab 还被 CSS display:none 藏了，
       于是小条状态下【没有任何地方能拖】—— 用户反馈「拖拽的点比较少，拖不动」就是这个。 */
    const hd=e.target.closest('.lhd'); if(!hd) return;
    if(e.target.closest('s')) return;                  /* 点 －/✕ 是收起，不是拖 */
    const r=F.getBoundingClientRect(), w=F.parentElement.getBoundingClientRect();
    sy=e.clientY; oy=r.top-w.top; on=true; moved=false;
    try{ hd.setPointerCapture(e.pointerId); }catch(err){}
  };
  const move=e=>{
    if(!on) return;
    const dy=e.clientY-sy;
    if(!moved){
      if(Math.abs(dy)<6) return;                      /* 6px 以内还算「点一下」，先不抢 */
      moved=true;
    }
    if(e.cancelable) e.preventDefault();
    const w=F.parentElement.getBoundingClientRect();
    F.style.top=clamp(oy+dy,3,Math.max(3,w.height-F.offsetHeight-3))+'px';
  };
  const up=()=>{
    if(!on) return; on=false;
    if(!moved) return;                                /* 没拖动 = 点一下，交给下面的 click */
    S.lyTop=parseFloat(F.style.top)||0; save();
    lyJustDrag=true; setTimeout(()=>{lyJustDrag=false;},120);
  };
  F.addEventListener('pointerdown',down);
  F.addEventListener('pointermove',move);
  F.addEventListener('pointerup',up);
  F.addEventListener('pointercancel',up);
  /* 收成一细条之后，点标题栏（没拖动的话）就展开 */
  F.addEventListener('click',e=>{
    if(lyJustDrag) return;
    if(e.target.closest('s')) return;
    if(S.lyMin){ S.lyMin=false; renderLayers(); save(); }
  });
}

/* ---------- 两个入口 ---------- */
/* 底栏「图层」= 抽屉形态。漂浮窗正开着时点它 → 漂浮窗收起、抽屉打开 */
$('#btnLayer').onclick=()=>{
  if(S.lyOpen&&S.lyMode==='drawer') S.lyOpen=false;
  else { S.lyMode='drawer'; S.lyOpen=true; }
  renderLayers(); save();
};
/* 顶栏「图层」= 漂浮形态，同理。
   抽屉那层虚化只盖画布区，顶栏没盖住，所以这一下是真点得到的 ——
   点得到就让它切换，比「先关再开」两步走顺手。 */
$('#btnLayerTop').onclick=()=>{
  if(S.lyOpen&&S.lyMode==='float') S.lyOpen=false;
  else { S.lyMode='float'; S.lyOpen=true; S.lyMin=false; }
  renderLayers(); save();
};
/* 抽屉开着时点画布 = 收起（跟点遮罩一个意思）。
   漂浮窗是飘着的，点画布不收 —— 不然一画一笔它就没了。 */
$('#view').addEventListener('click',()=>{
  if(S.lyOpen&&S.lyMode==='drawer') lyOpen(false);
});
lyInitFloatDrag();
/* 画布区尺寸变了（转屏 / 收起工具栏 / 展开调色板），漂浮窗的位置得重新夹一次 */
if('ResizeObserver' in window) new ResizeObserver(()=>lyPlaceFloat()).observe($('#cvwrap'));
