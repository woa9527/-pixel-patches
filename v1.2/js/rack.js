/* ==========================================================
   rack.js  —— 卡槽（系统只读 / 我的可建多个可命名）
   ------------------------------------------------------------
   概念先说清楚，改之前务必看懂：
   ·「卡槽」不是两个开关，是可以有很多个的，像存档。
   · 系统卡槽 = 内置配色（PICO-8 / NES / …），每一套本身就是一个卡槽，只读。
   · 我的卡槽 = 自己建的列表，能新建很多个、能命名、一开始是空的但能用。
   · 底部那一排 = 当前载入的那个卡槽（系统的或我的），叫「工作卡槽」。
   · 系统卡槽一律不能改：清空按钮直接灰掉（以前是「暂时清空、刷新回来」，
     现在改成彻底不给用，省得误会成删掉了）。
   ========================================================== */
const RACK_MAX = 32;

/* ---------- 当前工作卡槽的状态 ---------- */
const isSys    = () => S.kind === 'sys';
const canEdit  = () => !isSys() && S.myIdx >= 0 && !!S.myRacks[S.myIdx];
function curColors(){
  if(isSys()) return PALETTES[S.sysName] || [];
  const r = S.myRacks[S.myIdx];
  return r ? r.colors : [];
}
function curName(){
  if(isSys()) return S.sysName;
  const r = S.myRacks[S.myIdx];
  return r ? r.name : '—';
}
const isEmptySlot = i => i >= curColors().length;
/* 空位：末尾只留【1 个】（以前是 2 个）。
   两个挨在一起既占地方，又容易被手指带着连点两下 —— 现在加色不靠它了
   （点它只是把调色板拉出来），一个足够。快满时自动收成 0 个。
   系统卡槽只读，一个空位都不给。 */
const blanks    = () => canEdit() ? Math.min(1, RACK_MAX - curColors().length) : 0;
const slotCount = () => curColors().length + blanks();

/* ---------- 渲染底部工作卡槽 ---------- */
function renderRack(){
  const arr = curColors(), n = slotCount(), edit = canEdit();
  $('#rackName').textContent = curName();
  $('#rackTag').textContent  = isSys() ? '系统' : '我的';
  $('#rackTag').className    = 'tagx ' + (isSys() ? 'sys' : 'my');
  $('#rackN').textContent    = arr.length + (edit ? ' / ' + RACK_MAX : '');

  const g = $('#rackGrid');
  /* 第 1 格是拖拽手柄 ⋮⋮（长按它能把整块颜色拖到屏幕任意一边）。
     它占着原来第一个颜色的位置，颜色顺延到后面 —— 这是刻意要的：
     手柄就该长在颜色堆里，而不是挂在菜单行上。
     手柄是 <span>，下面的 querySelectorAll('i') 选不到它，
     所以颜色的下标 i 一点没变，不用到处 ±1。 */
  g.innerHTML = '<span class="grip" id="grip">⋮⋮</span>' +
    Array.from({length:n}, (_, i) =>
      isEmptySlot(i)
        ? `<i class="empty ${i===S.rackSel?'sel':''}" data-i="${i}"></i>`
        : `<i class="${i===S.rackSel?'sel':''}" style="background:${arr[i]}" data-i="${i}"></i>`
    ).join('');
  g.querySelectorAll('i').forEach(e => bindSlot(e, +e.dataset.i));
  bindGrip();

  /* 【别】在这里改「加入卡槽」按钮的名字／灰不灰 ——
     它现在归 paintfloat.js 管（点它弹「临时卡槽 → 卡槽」的框），
     这里一改就把人家的字写没了。 */
  /* 系统卡槽：清空按钮直接灰掉，一眼就知道不能用（不用点了才知道） */
  const cb = $('#btnClear');
  cb.disabled = isSys();
  cb.style.opacity = isSys() ? '.35' : '';
  $('#hintline').textContent = isSys()
    ? '想加颜色 → 配色库 → 我的卡槽'
    : '点 + 号空位＝拉起调色板；点已有色＝取它来用；长按＝删掉这一格';
}

/* 点空位 = 【只把调色板拉出来】，不再顺手把当前色塞进去。
   为什么改：以前一步到位是挺快，可空位就在颜色堆最右边，手指一滑就点到，
   稀里糊涂多一个颜色还得长按删掉（删错一格更心疼）。
   现在加色统一走：调色板 → 临时卡槽（点 ＋）→ 「加入卡槽」送过来，
   中间给你反悔的机会，也不会误触。
   点已有色 = 选中它，并拿它当当前色（不改动卡槽）
   长按已有色 520ms = 删掉这一格
   系统卡槽：空位和长按都不响应 */
function bindSlot(e, i){
  let lp = null, fired = false;
  e.addEventListener('pointerdown', () => {
    fired = false;
    if(isEmptySlot(i) || isSys()) return;
    lp = setTimeout(() => { fired = true; delSlot(i); }, 520);
  });
  const cancel = () => clearTimeout(lp);
  e.addEventListener('pointerup', cancel);
  e.addEventListener('pointermove', cancel);
  e.addEventListener('pointercancel', cancel);
  e.addEventListener('click', () => {
    if(fired) return;
    if(isEmptySlot(i)){
      if(isSys()){ toast('系统卡槽加不进颜色\n要去「配色库 → 我的卡槽」'); return; }
      S.rackSel = i; syncColorUI();
      setPaint(true);
      toast('调好颜色 → 点 ＋ 进临时卡槽\n攒够了再点「加入卡槽」送过来');
      return;
    }
    S.rackSel = i;
    setHex(curColors()[i]);      /* 已有色：取出来当当前色 */
    /* 别顺手把调色板打开——想调色就自己去点「调色」按钮。
       之前这里会自动弹，结果点个颜色右侧就窜出来，很打扰。 */
    syncColorUI();
  });
}

/* ---------- 增删 ---------- */
function delSlot(i){
  const arr = curColors(), old = arr[i];
  arr.splice(i, 1);
  if(S.rackSel >= arr.length) S.rackSel = Math.max(0, arr.length - 1);
  save(); syncColorUI(); toast('已删除 ' + old);
}
/* 加色【只有一条路】：调色板 → 临时卡槽 → 「加入卡槽」（见 js/paintfloat.js）。
   别再开「点一下就把当前色塞进某一格」的近路 —— 空位就在颜色堆最右边，
   手指一滑就点到，稀里糊涂多一个颜色还得长按删掉，删错一格更心疼。 */
function clearRack(){
  if(isSys()){ toast('系统卡槽不能清空\n要空卡槽 → 配色库 → 我的卡槽'); return; }
  if(S.myIdx < 0) return;
  S.myRacks[S.myIdx].colors = []; S.rackSel = 0;
  save(); syncColorUI(); toast('「' + S.myRacks[S.myIdx].name + '」已清空');
}

/* ---------- 载入某个卡槽 ---------- */
function loadSys(name){
  S.kind = 'sys'; S.sysName = name; S.rackSel = 0;
  const a = PALETTES[name] || [];
  if(a.length) setHex(a[0]);
  save(); syncColorUI();
}
function loadMy(i){
  const r = S.myRacks[i]; if(!r) return;
  S.kind = 'my'; S.myIdx = i; S.rackSel = 0;
  if(r.colors.length) setHex(r.colors[0]);
  save(); syncColorUI();
}

/* ---------- 配色库弹层 ----------
   esc() 搬到 util.js 去了（图层改名也要用），这里直接用，别再自己写一份 */
let libTab = 'sys';
function openLib(){ $('#libMask').classList.add('on'); $('#shLib').classList.add('on'); buildLib(); }
function closeLib(){ $('#libMask').classList.remove('on'); $('#shLib').classList.remove('on'); }
function buildLib(){
  $('#ltSys').classList.toggle('on', libTab === 'sys');
  $('#ltMy').classList.toggle('on', libTab === 'my');
  $('#addBtn').classList.toggle('on', libTab === 'my');
  $('#newRow').classList.remove('on');
  const box = $('#libList');

  if(libTab === 'sys'){
    $('#libTip').textContent = '内置配色，每套就是一个卡槽。只读：不能加色，也不能删。';
    box.innerHTML = Object.keys(PALETTES).map(n => {
      const a = PALETTES[n], on = (isSys() && S.sysName === n);
      return `<div class="it ${on?'on':''}" data-sys="${esc(n)}">
        <span class="pv">${a.slice(0,6).map(c=>`<i style="background:${c}"></i>`).join('')}</span>
        <span class="nm">${esc(n)}<small>${a.length} 色 · 只读</small></span></div>`;
    }).join('');
    box.querySelectorAll('[data-sys]').forEach(e => e.onclick = () => {
      loadSys(e.dataset.sys); closeLib(); toast('已载入系统卡槽：' + e.dataset.sys);
    });
    return;
  }

  $('#libTip').textContent = '像存档一样，可以建很多个，每个都能命名。空的也能直接用。';
  if(!S.myRacks.length){
    box.innerHTML = '<div class="libtip" style="padding:10px 2px">还没有卡槽。点下面「＋ 新建一个卡槽」起一个。</div>';
    return;
  }
  box.innerHTML = S.myRacks.map((r, i) => {
    const on = (!isSys() && S.myIdx === i);
    const pv = r.colors.length
      ? r.colors.slice(0,6).map(c => `<i style="background:${c}"></i>`).join('')
      : '<i class="none"></i>';
    return `<div class="it ${on?'on':''}" data-my="${i}">
      <span class="pv">${pv}</span>
      <span class="nm">${esc(r.name)}<small>${r.colors.length} 色</small></span>
      <span class="del" data-del="${i}">✕</span></div>`;
  }).join('');
  box.querySelectorAll('[data-my]').forEach(e => e.onclick = ev => {
    if(ev.target.dataset.del !== undefined) return;
    loadMy(+e.dataset.my); closeLib(); toast('已载入我的卡槽：' + S.myRacks[+e.dataset.my].name);
  });
  box.querySelectorAll('[data-del]').forEach(e => e.onclick = ev => {
    ev.stopPropagation(); delRack(+e.dataset.del);
  });
}
function newRack(){
  const v = ($('#newName').value || '').trim() || ('我的色板 ' + (S.myRacks.length + 1));
  S.myRacks.push({name:v, colors:[]});
  S.kind = 'my'; S.myIdx = S.myRacks.length - 1; S.rackSel = 0;
  $('#newRow').classList.remove('on');
  save(); buildLib(); syncColorUI(); closeLib();
  toast('已创建「' + v + '」，现在往里加颜色吧');
}
function delRack(i){
  const nm = S.myRacks[i] ? S.myRacks[i].name : '';
  S.myRacks.splice(i, 1);
  if(!isSys()){
    if(S.myIdx >= S.myRacks.length) S.myIdx = S.myRacks.length - 1;
    if(S.myIdx < 0){                       /* 全删光了就退回系统卡槽 */
      S.kind = 'sys'; S.rackSel = 0;
      const a = PALETTES[S.sysName] || [];
      if(a.length) setHex(a[0]);
    }
  }
  save(); buildLib(); syncColorUI(); toast('已删除卡槽「' + nm + '」');
}

/* ---------- 右侧调色板开合 ---------- */
function setPaint(v){
  S.paintOpen = v;
  $('#paint').classList.toggle('open', v);
  document.body.classList.toggle('paintOpen', v);   /* 吸右边的色块要靠它让位 */
  if(v) $('#oldSw').style.background = curHex();
  $('#btnColor').classList.toggle('on', v);
  /* 宽度动画 220ms，等它走完再让画布重算尺寸 */
  setTimeout(resize, 240);
  syncColorUI();
}
function toggleFoldRack(){
  /* 色块被吸走时 ⇅ 是灰的（点不到）。留这条只是兜底：
     万一灰不掉，点它也就是「收回底部」这一个意思。 */
  if(S.dockSide){ applySide('bottom'); return; }
  S.rackFolded = !S.rackFolded;
  $('#rack').classList.toggle('folded', S.rackFolded);
  $('#rackFold').classList.toggle('on', !S.rackFolded);   /* 顶栏那个 ⇅ 亮着=卡槽是展开的 */
  setTimeout(resize, 200);
  toast(S.rackFolded ? '卡槽已收起' : '卡槽已展开');
}
