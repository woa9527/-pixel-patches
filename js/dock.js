/* ==========================================================
   dock.js  —— 色块吸附：把「颜色」拖到屏幕任意一边（浮在画上）
   ------------------------------------------------------------
   三条铁律，改之前先看懂：
   1. 拖的是色块 #swatches，不是菜单行。
      菜单行（名字 / 调色 / 配色库 / 清空）永远留在底部不动。
   2. 浮在画上 —— 画布尺寸一点不变，只是屏幕边上多了一块颜色。
      底部被抽空后自动变薄（菜单行还在），把高度还给画布。
   3. 边界要让位（左边和顶上都要，不然会盖住工具栏）：
      工具栏展开 → 色块贴着工具栏右缘；
      工具栏收起 → 没东西挤它了，自动吸回屏幕最左。
      右边则让给调色板。全在 rack.css 里用 body.folded / body.paintOpen 做，
      不用 JS 算 —— 以后改工具栏宽度，吸附边界自己跟着对。
   4. 手柄三种手势，各管一摊：
      单击 = 什么都不做（不给提示，也就不存在误触）
      双击 = 把颜色收进手柄里 / 再吐出来（收起 ≠ 取消吸附）
      长按 300ms = 起拖
      色块吸出去之后，顶栏那个 ⇅ 直接灰掉 —— 颜色归手柄管，不归它管。
   ========================================================== */
/* 四个落点：名字 → 提示框选择器 */
const ZONES = [['top','#zT'],['bottom','#zB'],['left','#zL'],['right','#zR']];
/* DRAG：一次拖拽的临时状态（不存盘） */
const DRAG = {on:false, timer:null, sx:0, sy:0, dx:0, dy:0, hot:'', tap:0};

/* ---------- 落位 / 归位 ---------- */
/* side: 'top' | 'left' | 'right' | 'bottom'（bottom = 放回底部原位） */
function applySide(side, silent){
  const sw = $('#swatches'), rack = $('#rack');
  S.dockSide = (side && side !== 'bottom') ? side : '';
  sw.style.left = sw.style.top = sw.style.width = '';   /* 清掉拖拽时写死的位置 */
  if(S.dockSide){
    sw.setAttribute('data-side', S.dockSide);
    rack.classList.add('docked');
    /* 色块已经飞走了，底部没必要再留一块空地，直接收起来 */
    S.rackFolded = false;
    rack.classList.remove('folded');
  }else{
    sw.removeAttribute('data-side');
    rack.classList.remove('docked');
    S.dockMini = false;              /* 回到底部了，谈不上升起来收起来 */
  }
  sw.classList.toggle('mini', S.dockMini);
  /* 色块吸出去之后，顶栏那个 ⇅ 就没得管了 —— 直接灰掉。
     颜色要收要放，双击手柄（⇅ 已经不是它的开关了）。 */
  const rf = $('#rackFold');
  rf.disabled = !!S.dockSide;
  rf.classList.toggle('on', !S.dockSide && !S.rackFolded);
  if(!silent) toast(
    S.dockSide === 'top'   ? '颜色已吸到顶上' :
    S.dockSide === 'left'  ? '颜色已吸到左侧' :
    S.dockSide === 'right' ? '颜色已吸到右侧' : '颜色已回到底部');
  save();
  setTimeout(resize, 60);   /* 底部变薄了，画布要重算 */
}

/* ---------- 手柄：长按 300ms 起拖 ---------- */
/* renderRack 每次都会重建 grip，所以绑事件也得跟着重来一遍 */
function bindGrip(){
  const g = $('#grip');
  if(!g) return;
  g.addEventListener('pointerdown', e => {
    DRAG.sx = e.clientX; DRAG.sy = e.clientY;
    clearTimeout(DRAG.timer);
    DRAG.timer = setTimeout(() => { DRAG.timer = null; startDrag(); }, 300);
  });
  /* 单击 = 什么都不做。不给提示、不误触，就是没反应。
     双击 = 收起 / 吐出颜色。长按 300ms = 起拖。
     三种手势各管一摊，互不干扰。 */
  g.addEventListener('pointerup', () => {
    if(DRAG.on){ endDrag(); return; }
    clearTimeout(DRAG.timer); DRAG.timer = null;
    const now = Date.now();
    if(now - DRAG.tap < 300){ DRAG.tap = 0; toggleDockMini(); }
    else DRAG.tap = now;
  });
  g.addEventListener('pointercancel', () => {
    if(DRAG.on) abortDrag();
    else { clearTimeout(DRAG.timer); DRAG.timer = null; DRAG.tap = 0; }
  });
}

/* 双击手柄：把颜色收进手柄里（边上只留一个小方块），再双击吐出来。
   收起来 ≠ 取消吸附 —— 吸附位置还记着，吐出来还在老地方。 */
function toggleDockMini(){
  if(!S.dockSide) return;      /* 还在底部老老实实待着，没得收 */
  S.dockMini = !S.dockMini;
  $('#swatches').classList.toggle('mini', S.dockMini);
  buzz(8);
  toast(S.dockMini ? '颜色已收起（再双击吐出来）' : '颜色已展开');
  save();
}

function startDrag(){
  const sw = $('#swatches');
  const r  = sw.getBoundingClientRect();
  DRAG.on = true; DRAG.hot = '';
  /* 手指抓在色块的哪个位置（按比例，因为下面会把宽度收窄） */
  DRAG.dx = clamp(DRAG.sx - r.left, 0, r.width);
  DRAG.dy = clamp(DRAG.sy - r.top,  0, r.height);
  const w = Math.min(r.width, 176);       /* 别拖着一整条横幅满屏跑 */
  DRAG.dx = DRAG.dx * w / (r.width || 1);

  sw.removeAttribute('data-side');        /* 先脱离吸附位，交给手指 */
  sw.classList.add('dragging');
  document.body.classList.add('dragging');/* 四个落点提示框亮出来 */
  $('#rack').classList.add('docked');     /* 底部立刻让位 */
  sw.style.width = w + 'px';
  moveTo(DRAG.sx, DRAG.sy);

  document.addEventListener('pointermove', onMove, {passive:false});
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', abortDrag);
  buzz(10);
}

function moveTo(cx, cy){
  const sw = $('#swatches');
  const W = window.innerWidth, H = window.innerHeight;
  sw.style.left = clamp(cx - DRAG.dx, 4, Math.max(4, W - sw.offsetWidth  - 4)) + 'px';
  sw.style.top  = clamp(cy - DRAG.dy, 4, Math.max(4, H - sw.offsetHeight - 4)) + 'px';
}

function onMove(e){
  if(!DRAG.on) return;
  e.preventDefault();
  const cx = e.clientX, cy = e.clientY;
  moveTo(cx, cy);
  /* 判定：手指离哪个落点提示框的中心最近，就吸哪个 */
  let best = '', bd = Infinity;
  for(const [side, sel] of ZONES){
    const z = $(sel).getBoundingClientRect();
    const d = Math.hypot(cx - (z.left + z.width / 2), cy - (z.top + z.height / 2));
    if(d < bd){ bd = d; best = side; }
  }
  if(best !== DRAG.hot){
    DRAG.hot = best;
    ZONES.forEach(([s, sel]) => $(sel).classList.toggle('hot', s === best));
    buzz(6);
  }
}

function endDrag(){
  if(!DRAG.on) return;
  const side = DRAG.hot || S.dockSide || 'bottom';
  cleanDrag();
  applySide(side);
}
function abortDrag(){
  if(!DRAG.on) return;
  const back = S.dockSide || 'bottom';
  cleanDrag();
  applySide(back, true);
}
function cleanDrag(){
  DRAG.on = false; DRAG.hot = '';
  clearTimeout(DRAG.timer); DRAG.timer = null;
  const sw = $('#swatches');
  sw.classList.remove('dragging');
  sw.style.width = '';
  document.body.classList.remove('dragging');
  ZONES.forEach(([, sel]) => $(sel).classList.remove('hot'));
  document.removeEventListener('pointermove', onMove);
  document.removeEventListener('pointerup', endDrag);
  document.removeEventListener('pointercancel', abortDrag);
}
function buzz(ms){
  if(navigator.vibrate){ try{ navigator.vibrate(ms); }catch(e){} }
}
