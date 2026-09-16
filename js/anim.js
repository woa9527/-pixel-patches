/* ==========================================================
   anim.js  —— 序列帧动画：把图层当成一帧帧来播
   —— 一帧 = 一层，播放序列 = 所有【可见】的层，按面板顺序从上往下。
      【第 N 帧只显示第 N 层】—— 一张张图片翻过去，不叠加。

      播放条是个【能自由拖动的悬浮窗】：
      顶栏那一片展开的东西太多（工具栏、被拖出来的色块都可能压上来），
      所以不做「给它让位 / 把它顶开」那套逻辑 —— 挡住了自己挪走就行。
      它本来也不是常驻的，只有播动画时才出现。
   ========================================================== */
const ANIM_FPS=[2,6,12,24];        /* 常用的四档 */
const ANIM_LO=1, ANIM_HI=60;       /* 「自由」帧率的上下限 */
/* at    = 当前帧对应的【层下标】；null = 不限制（正常显示全部）
   fpsUI = 帧率二级抽屉：null 收着 / 'pick' 选档 / 'free' 手输 */
let anim={open:false, playing:false, fps:12, k:0, at:null, timer:null, fpsUI:null};

function animList(){
  const a=[]; S.layers.forEach((L,i)=>{ if(L.vis) a.push(i); });
  return a.length?a:[clamp(S.lyCur,0,S.layers.length-1)];
}
function animMs(){ return Math.round(1000/anim.fps); }
const animIsFree = ()=> ANIM_FPS.indexOf(anim.fps)<0;
/* 把当前这一帧画出来：当前层跟着走到那一帧（播完接着画不用再手动切层） */
function animPaint(){
  const l=animList();
  anim.k=clamp(anim.k,0,l.length-1);
  anim.at=l[anim.k];
  S.lyCur=anim.at; syncPx();
  flatDirty=true; render();
  animNum();
}
function animTick(){
  const l=animList();
  if(l.length<2){ animPause(); return; }
  anim.k=(anim.k+1)%l.length;
  animPaint();
}
function animPlay(){
  const l=animList();
  if(l.length<2){ toast('至少要两层才播得起来（先在图层里加一层）'); return; }
  if(anim.playing) return;
  anim.playing=true;
  anim.timer=setInterval(animTick,animMs());
  animBar();
}
function animPause(){
  if(!anim.playing){ animBar(); return; }
  anim.playing=false;
  clearInterval(anim.timer); anim.timer=null;
  renderLayers();                 /* 停下来了，把图层面板刷成「停在这一层」的样子 */
  animBar();
}
function animSetFps(f){
  anim.fps=f;
  if(anim.playing){ clearInterval(anim.timer); anim.timer=setInterval(animTick,animMs()); }
  anim.fpsUI=null;                /* 选完就收起抽屉，主条上直接看得到新值 */
  animBar(); save();
}
function animOpen(){
  anim.open=true;
  document.body.classList.add('animing');
  anim.k=0;
  animPaint();
  anim.fpsUI=null;
  animBar(); animPlace();
  animPlay();
}
function animClose(){
  animPause();
  anim.open=false; anim.at=null; anim.k=0; anim.fpsUI=null;
  document.body.classList.remove('animing');
  flatDirty=true; render(); renderLayers(); animBar();
}
/* 图层数 / 显示状态变了（加层、删层、开关眼睛、拖着排序）：
   帧序列跟着变，帧位夹回合法范围；只剩一层了就停掉。 */
function animSync(){
  if(!anim.open) return;
  const l=animList();
  anim.k=clamp(anim.k,0,l.length-1);
  if(l.length<2) animPause();
  animPaint();
  animBar();
}

/* ---------- 悬浮窗本体 ---------- */
/* 只在 打开 / 暂停 / 换帧率 / 开关抽屉 时整体重建 —— 播的时候每帧只改那个「第几帧」的数字，
   不然一秒重建 24 次 DOM，手机上会卡出残影。 */
function animNum(){
  const n=$('#animbar .abn'); if(!n) return;
  n.textContent=(anim.k+1)+' / '+animList().length;
}
/* 主条：⋮⋮把手 ｜ ▶ ｜ ⏸ ｜ 当前帧率▾ ｜ 第几帧/共几帧 ｜ ✕ */
function animBar(){
  const b=$('#animbar'); if(!b) return;
  if(!anim.open){ b.innerHTML=''; animFpsBar(); return; }
  b.innerHTML=
    `<span class="ab grab" data-grab>⋮⋮</span>`+
    `<span class="ab ${anim.playing?'on':''}" data-play>▶</span>`+
    `<span class="ab ${anim.playing?'':'on'}" data-pause>⏸</span>`+
    `<span class="ab fx ${anim.fpsUI?'on':''}" data-fps>${anim.fps}<i>▾</i></span>`+
    `<span class="abn">${anim.k+1} / ${animList().length}</span>`+
    `<span class="ab x" data-close>✕</span>`;
  const q=s=>b.querySelector(s);
  q('[data-play]').onclick =()=>animPlay();
  q('[data-pause]').onclick=()=>animPause();
  q('[data-close]').onclick=()=>animClose();
  q('[data-fps]').onclick=()=>{ anim.fpsUI=anim.fpsUI?null:'pick'; animBar(); };
  animFpsBar();
}
/* 二级帧率抽屉：紧贴主窗下沿，像个拉出来的抽屉（不是独立飘在别处的弹层）。
   'pick' = 2 / 6 / 12 / 24 / 自由；'free' = 手输 1~60。 */
function animFpsBar(){
  const d=$('#animfps'); if(!d) return;
  d.classList.toggle('on', !!anim.fpsUI&&anim.open);
  if(!anim.fpsUI||!anim.open){ d.innerHTML=''; $('#animwrap').classList.remove('up'); return; }
  if(anim.fpsUI==='free'){
    d.innerHTML=`<input class="fin" type="number" inputmode="numeric" min="${ANIM_LO}" max="${ANIM_HI}" value="${anim.fps}">`+
                `<span class="f ok" data-fok>✓</span>`;
    const inp=d.querySelector('.fin');
    const go=()=>{
      /* 注意别写 `v||anim.fps`：输 0 的时候 0 是假值，会被当成「没输」退回去，
         结果输 0 得到的是上一次的帧率，看着像没反应。只有【空 / 不是数字】才退回。 */
      const t=inp.value.trim();
      let v=(t===''||!isFinite(+t))?anim.fps:Math.round(+t);
      if(v<ANIM_LO||v>ANIM_HI) toast('帧率要在 '+ANIM_LO+' ~ '+ANIM_HI+' 之间');
      animSetFps(clamp(v,ANIM_LO,ANIM_HI));
    };
    d.querySelector('[data-fok]').onclick=go;
    inp.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); go(); } };
    inp.addEventListener('blur',()=>{});           /* 别在输入途中被打断时不小心提交 */
    setTimeout(()=>{ try{ inp.focus(); inp.select(); }catch(err){} },30);
  }else{
    d.innerHTML=ANIM_FPS.map(f=>
        `<span class="f ${f===anim.fps?'on':''}" data-fps="${f}">${f}</span>`).join('')+
      `<span class="f free ${animIsFree()?'on':''}" data-free>自由</span>`;
    d.querySelectorAll('[data-fps]').forEach(n=>n.onclick=()=>animSetFps(+n.dataset.fps));
    d.querySelector('[data-free]').onclick=()=>{ anim.fpsUI='free'; animBar(); };
  }
  animFlip();
}
/* 抽屉往下长。要是主窗已经被拖到很下面、下边长不下，就翻到主窗【上面】去。 */
function animFlip(){
  const W=$('#animwrap'), d=$('#animfps'); if(!W||!d) return;
  const p=W.parentElement.getBoundingClientRect();
  const need=d.offsetHeight+5;
  const top=parseFloat(W.style.top);
  const up=(!isNaN(top))&&(p.height-top<need+6);
  W.classList.toggle('up', up);
}
/* 位置：记在 S.animX / S.animY（相对画布区左上角）。没拖过就用默认（属性栏下面那条）。 */
/* 没拖过时放哪儿：属性栏展开着就待在它下面（44+8），收起来了就贴顶。
   不去动属性栏本身 —— 它是常驻的，播放时可能还要看/改工具参数。 */
function animHomeY(){
  const p=$('#prop');
  return (p&&getComputedStyle(p).display!=='none')?52:8;
}
function animPlace(x,y){
  const W=$('#animwrap'); if(!W) return;
  const p=W.parentElement.getBoundingClientRect();
  const bar=W.querySelector('#animbar');
  const d=$('#animfps');
  /* 抽屉是 absolute 挂出来的，不计入 wrapper 尺寸 —— 横向夹取要把它也算上，
     不然拖到最右边时抽屉会被切掉一截。 */
  const w=Math.max(W.offsetWidth,(d&&d.classList.contains('on'))?d.offsetWidth:0);
  const h=(bar||W).offsetHeight;
  const nx=(x==null)?(S.animX==null?8:S.animX):x;
  const ny=(y==null)?(S.animY==null?animHomeY():S.animY):y;
  W.style.left=clamp(nx,3,Math.max(3,p.width -w-3))+'px';
  W.style.top =clamp(ny,3,Math.max(3,p.height-h-3))+'px';
}

/* ---------- 长按把手 ⋮⋮ 拖着走 ---------- */
/* 【手机上拖不动的坑，改动前务必看 —— 跟图层长按拖拽是同一个】
   手指一动浏览器就判定成「要滚页面」，然后发一个 pointercancel 把手势掐掉，
   表现就是「按住能选中，但拖不动」。必须在【非被动】的 touchmove 里 preventDefault，
   浏览器才会把手势交还给我们。body 加 .dragging 锁掉页面滚动。 */
let anDrag=null;
function animInitDrag(){
  const W=$('#animwrap');
  const down=e=>{
    const g=e.target.closest('[data-grab]'); if(!g) return;
    e.preventDefault(); e.stopPropagation();
    const r=W.getBoundingClientRect(), p=W.parentElement.getBoundingClientRect();
    anDrag={sx:e.clientX, sy:e.clientY, ox:r.left-p.left, oy:r.top-p.top};
    document.body.classList.add('dragging');
    try{ g.setPointerCapture(e.pointerId); }catch(err){}
  };
  const move=e=>{
    if(!anDrag) return;
    animPlace(anDrag.ox+(e.clientX-anDrag.sx), anDrag.oy+(e.clientY-anDrag.sy));
  };
  const up=()=>{
    if(!anDrag) return; anDrag=null;
    document.body.classList.remove('dragging');
    S.animX=parseFloat(W.style.left)||0; S.animY=parseFloat(W.style.top)||0;
    save();
  };
  W.addEventListener('pointerdown',down);
  W.addEventListener('pointermove',move);
  W.addEventListener('pointerup',up);
  W.addEventListener('pointercancel',up);
  /* 画布区尺寸变了（转屏 / 收起工具栏 / 展开调色板），重新夹一次，别让它跑出屏幕 */
  if('ResizeObserver' in window) new ResizeObserver(()=>animPlace()).observe($('#cvwrap'));
}
document.addEventListener('touchmove',e=>{ if(anDrag) e.preventDefault(); },{passive:false});

/* 顶栏那个按钮：点开 = 出悬浮窗并直接开始播；再点 = 收起并停。 */
$('#btnAnim').onclick=()=>{
  if(anim.open) animClose();
  else animOpen();
};
animInitDrag();
