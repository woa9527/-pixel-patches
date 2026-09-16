/* ==========================================================
   ui.js  —— 按钮事件 / 菜单 / 导出 PNG / 提示
   ========================================================== */
/* ---------- 绑定 ---------- */
(function(){
  const sv=$('#sv');
  const set=e=>{
    const r=sv.getBoundingClientRect();
    S.color.s=Math.round(clamp((e.clientX-r.left)/r.width,0,1)*100);
    S.color.v=Math.round(clamp(1-(e.clientY-r.top)/r.height,0,1)*100);
    dropExact(); syncColorUI();
  };
  sv.addEventListener('pointerdown',e=>{sv.setPointerCapture(e.pointerId);set(e);});
  sv.addEventListener('pointermove',e=>{if(e.buttons||e.pointerType==='touch')set(e);});
})();
$('#hue').addEventListener('input',e=>{S.color.h=+e.target.value;dropExact();syncColorUI();});
$('#hexTx').addEventListener('change',e=>{
  if(!setHex(e.target.value)) e.target.value=curHex(); else save();
});
/* ---- 右侧调色板 ---- */
$('#btnColor').onclick=()=>setPaint(!S.paintOpen);
$('#pclose').onclick=()=>setPaint(false);
$('#pin').onclick=()=>{
  S.paintPinned=!S.paintPinned;
  $('#pin').classList.toggle('on',S.paintPinned);
  save(); toast(S.paintPinned?'已固定：点画布不会收起':'已取消固定');
};
/* 「加入卡槽」按钮不在这儿绑 —— 它现在是把【临时卡槽】整批交给卡槽，
   逻辑在 js/paintfloat.js 里（点一下会弹窗问「放到哪个卡槽」）。 */
/* 未固定时点画布就收起（固定了就一直挂着） */
$('#view').addEventListener('click',()=>{
  if(S.paintOpen&&!S.paintPinned) setPaint(false);
});
/* ---- 底部卡槽 ---- */
$('#curSw').onclick=()=>setPaint(!S.paintOpen);
$('#btnClear').onclick=()=>clearRack();
$('#rackFold').onclick=()=>toggleFoldRack();
/* ---- 配色库 ---- */
$('#btnLib').onclick=()=>{
  if($('#shLib').classList.contains('on')) closeLib(); else openLib();
};
$('#libMask').onclick=closeLib;
$('#ltSys').onclick=()=>{libTab='sys';buildLib();};
$('#ltMy').onclick=()=>{libTab='my';buildLib();};
$('#addBtn').onclick=()=>{
  $('#newRow').classList.add('on');
  $('#newName').value=''; $('#newName').focus();
};
$('#newCancel').onclick=()=>$('#newRow').classList.remove('on');
$('#newOk').onclick=()=>newRack();
$('#newName').addEventListener('keydown',e=>{ if(e.key==='Enter') newRack(); });
/* 下拉配色库面板也能关 */
(function(){
  const g=$('#libGrip'); let y0=null;
  g.addEventListener('pointerdown',e=>{y0=e.clientY;g.setPointerCapture(e.pointerId);});
  g.addEventListener('pointermove',e=>{ if(y0!==null&&e.clientY-y0>26){y0=null;closeLib();} });
  g.addEventListener('pointerup',()=>{y0=null;});
})();
/* 网格：顶栏那个和菜单里那个是同一个开关，两边状态得同步 */
function toggleGrid(){
  S.grid=!S.grid;
  $('#btnGrid').classList.toggle('on',S.grid);
  const g=$('#btnG2');
  if(g){ g.classList.toggle('on',S.grid); g.textContent='网格：'+(S.grid?'开':'关'); }
  render();
}
$('#btnGrid').onclick=toggleGrid;
$('#btnUndo').onclick=undo;
$('#btnRedo').onclick=redo;
$('#btnFold').onclick=()=>{
  document.body.classList.toggle('folded');
  const f=document.body.classList.contains('folded');
  $('#foldIcon').innerHTML=f
    ? '<path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/>'
    : '<path d="M3 5h18v2H3V5zm3 5h12v2H6v-2zm3 5h6v2H9v-2z"/>';
  setTimeout(resize,200);
  toast(f?'工具栏已收起':'工具栏已展开');
};
// 参数栏不挂任何开关按钮：开合只认「双击左侧工具图标」（逻辑在 tools.js）

$('#selbar').innerHTML=[
  ['copy','复制'],['cut','剪切'],['paste','粘贴'],['flip','翻转'],['fill','填充'],['del','删除'],['none','取消']
].map(a=>`<button data-s="${a[0]}" class="${a[0]==='del'?'del':''}">${a[1]}</button>`).join('');
$('#selbar').querySelectorAll('button').forEach(b=>b.onclick=()=>{
  const k=b.dataset.s;
  if(k==='copy')selCopy();
  if(k==='cut')selCut();
  if(k==='paste')selPaste();
  if(k==='flip')selFlipH();
  if(k==='fill')selFill();
  if(k==='del')selDel();
  if(k==='none'){clearSel();render();}
});

/* 曲线（自由画法）的完成 / 取消。
   简单画法用不上这两个按钮 —— 它松手就落定，根本没机会点。 */
$('#cvDone').onclick=()=>commitCurve();
$('#cvCancel').onclick=()=>cancelCurve();

const mask=$('#mask'),sheet=$('#sheet');
function openSheet(html){
  sheet.innerHTML=`<button class="close" id="sc">关闭</button>`+html;
  mask.classList.remove('hidden');
  const c=$('#sc'); if(c)c.onclick=closeSheet;
}
function closeSheet(){mask.classList.add('hidden');sheet.innerHTML='';}
mask.addEventListener('click',e=>{if(e.target===mask)closeSheet();});
/* 常用尺寸：手机上常用的就是这几档 */
const SIZE_PRESETS=[16,32,64,256,512];
const EXP_KEYS=[1,4,8,16];
/* 导出倍数：直接写出「导出来到底多大」，省得自己拿倍数去乘。
   超过 4096 的档位不显示（浏览器画不出来）。 */
function syncExps(){
  const box=$('#exps'); if(!box) return;
  let ks=EXP_KEYS.filter(k=>Math.max(S.w,S.h)*k<=4096);
  if(!ks.length) ks=[1];
  box.innerHTML=ks.map(k=>
    `<button data-exp="${k}"><b>${k}×</b><small>${S.w*k}×${S.h*k}</small></button>`).join('');
  box.querySelectorAll('[data-exp]').forEach(b=>b.onclick=()=>exportPNG(+b.dataset.exp));
}
/* ---------- 「⋯」菜单 ----------
   【整个菜单搬到 js/menu.js 去了】
   以前这里是塞在一张长 sheet 里的一大坨；现在是二级结构（一级列表 + 二级页），
   openMenu() 由 menu.js 提供，#btnMenu 的 onclick 也在那边重新绑。
   留在这儿的 SIZE_PRESETS、toggleGrid、exportPNG 是画布页和设置页还要用的东西。 */

/* ---------- 帮助面板 ----------
   说明书【不在代码里】，是一个单独的 help.md —— 改说明直接改那个文件就行，
   不用碰 js、不用重新打包 App。打开时现读现渲染（渲染器在 md.js）。
   文档里的 UI 全是用 ``` 代码块画出来的示意图，为什么不截图：
   截图容易截歪、还会把别的界面一起截进来；代码块画的图永远干净，改起来也就一行字。 */
$('#helpclose').onclick=()=>$('#helppanel').classList.remove('on');
function openHelp(){
  const P=$('#helppanel'), B=$('#helpbody');
  P.classList.add('on');
  if(B.dataset.ready) return;                 /* 已经渲染过就不用再来一遍 */
  B.innerHTML='<div class="mdload">正在加载说明…</div>';
  loadHelp(t=>{
    B.innerHTML = t ? mdRender(t)
      : '<div class="mdload">说明书没读到（help.md 不见了？）。<br>离线单文件版里有一份备份。</div>';
    B.dataset.ready='1';
    B.scrollTop=0;
  });
}
function exportPNG(scale){
  const c=document.createElement('canvas');
  c.width=S.w*scale;c.height=S.h*scale;
  const x=c.getContext('2d');
  x.imageSmoothingEnabled=false;
  const tmp=document.createElement('canvas');
  tmp.width=S.w;tmp.height=S.h;
  flatten();                     /* 先把所有可见层合一遍，藏起来的层才不会混进导出图 */
  tmp.getContext('2d').putImageData(S.img,0,0);
  x.drawImage(tmp,0,0,c.width,c.height);
  const url=c.toDataURL('image/png');
  openSheet(`
    <h3>导出 ${S.w*scale}×${S.h*scale}</h3>
    <img id="shot" src="${url}" alt="导出图">
    <div class="tip" style="margin:10px 0">点下面按钮保存 / 分享：手机上可存进相册、发微信，电脑上就是下载。</div>
    <a class="btn" href="${url}" download="像素涂鸦_${S.w}x${S.h}_${scale}x.png" style="display:block;text-decoration:none;line-height:22px">保存 / 分享 PNG</a>
  `);
}

let toastT=null;
function toast(m){
  const h=$('#hint'); h.textContent=m; h.classList.add('show');
  /* 播放条就贴在画布顶，气泡默认的位置正好压在它身上 —— 播着的时候宁可不弹，
     不然一秒钟几条提示糊在播放键上，既看不清提示也点不准键。 */
  if(anim&&anim.open) h.classList.remove('show');
  clearTimeout(toastT); toastT=setTimeout(()=>h.classList.remove('show'),1500);
}
