/* ==========================================================
   tools.js  —— 工具图标与工具栏
   ========================================================== */
/* ---------- 工具 ---------- */
const ICONS={
  pencil:'<svg viewBox="0 0 24 24"><path d="M4 20l1-4 9-9 3 3-9 9-4 1z"/><path d="M14 6l2-2 4 4-2 2z"/></svg>',
  eraser:'<svg viewBox="0 0 24 24"><path d="M14 3l7 7-8 8H8l-4-4 10-11z"/><path d="M9 21h11v-2H9v2z"/></svg>',
  fill:'<svg viewBox="0 0 24 24"><path d="M10 3l8 8-7 7-8-8 7-7zM9 4.4L4.4 9 9 13.6 13.6 9 9 4.4z"/><path d="M17.5 14c1.7 2.1 2.5 2.9 2.5 3.8a2.5 2.5 0 11-5 0c0-.9.8-1.7 2.5-3.8z"/></svg>',
  spray:'<svg viewBox="0 0 24 24"><path d="M13 3l6 6-2.5 2.5-6-6L13 3z"/><circle cx="5" cy="20" r="1.5"/><circle cx="8.5" cy="21" r="1.2"/><circle cx="4" cy="16.5" r="1.1"/><circle cx="7.5" cy="17.5" r="1"/></svg>',
  line:'<svg viewBox="0 0 24 24"><path d="M5 19L19 5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>',
  curve:'<svg viewBox="0 0 24 24"><path d="M4 17C4 7 20 17 20 7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>',
  rect:'<svg viewBox="0 0 24 24"><rect x="5" y="7" width="14" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  ellipse:'<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="6" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  select:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3.5 2.5"/></svg>',
  move:'<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-2.6 2.6M12 3l2.6 2.6M12 21l-2.6-2.6M12 21l2.6-2.6M3 12l2.6-2.6M3 12l2.6 2.6M21 12l-2.6-2.6M21 12l-2.6 2.6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  picker:'<svg viewBox="0 0 24 24"><path d="M17.5 2.5a2 2 0 013 3L12 14l-3 1 1-3 7.5-9.5zM4 16h3v2H5v3H3v-3a2 2 0 011-2z"/></svg>',
  outline:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="7" y="8" width="10" height="8" opacity=".55"/></svg>',
  zoom:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.6 15.6L21 21" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>'
};
const TOOLS=[
  ['pencil','铅笔'],['eraser','橡皮'],['fill','填充'],['spray','喷枪'],
  /* 曲线紧跟在直线后面 —— 它俩是一伙的，都是「拉出一条线」 */
  ['line','直线'],['curve','曲线'],['rect','矩形'],['ellipse','椭圆'],['select','选区'],
  ['move','移动'],['picker','取色'],['outline','描边'],
  ['zoom','缩放']
  /* 【改色】和【平移】两个工具删掉了：
     改色 = 把某个颜色整体换成另一个，用「选区(魔棒) + 填充」一样做得到，单独一个工具多余。
     平移 = 手机上双指按住屏幕拖就行（缩放工具也能单指拖），没必要单占一个按钮。 */
];
/* 参数栏的开合。收起状态记在 body 的 propHidden 上（样式也读它） */
function propOpen(){ return !document.body.classList.contains('propHidden'); }
function toggleProp(){
  document.body.classList.toggle('propHidden');
  if(propOpen()) buildProp();
}

/* 双击判定窗口 */
const DBL_MS = 380;
let tapT = 0, tapTool = null;

function buildTools(){
  $('#tools').innerHTML=TOOLS.map(t=>
    /* 描边工具：没选区就是灰的。想给谁描边得先框住谁 ——
       不然一点画面，画布上每个东西都被描一圈，根本不是想要的效果 */
    `<button class="tool ${t[0]===S.tool?'on':''} ${t[0]==='outline'&&!sel?'off':''}" data-t="${t[0]}">${ICONS[t[0]]}<span>${t[1]}</span></button>`
  ).join('');
  $('#tools').querySelectorAll('.tool').forEach(b=>{
    /* 单击 = 选中工具（面板开着就顺带换成这个工具的参数）
       双击 = 展开 / 收起参数栏

       【重要规则，别改】双击只对「当前正在用的工具」生效。
       也就是说：双击一个还没选中的工具，第一下只是「选中它」，
       得点第三下才构成双击。这是故意的，不是 bug ——
       扩展参数是对「我正在用的工具」的操作，
       没道理跳到一个没在用的工具上去调它的参数。
       而且要是让「第一下选中 + 第二下展开」成立，
       选择和双击就混成一回事了，行为会不自洽。

       下面这行清空就是在守这条规则：这一下如果是在换工具，
       就不许它跟下一 tap 凑成一对双击。pointerup 先于 click 执行，
       所以这里清得掉。 */
    b.onclick=()=>{
      /* 灰掉的工具点不动，只说一句为什么 */
      if(b.dataset.t==='outline'&&!sel){ toast('先用选区框住要描边的那一个'); return; }
      const prev=S.tool;
      S.tool=b.dataset.t;
      if(prev!==S.tool){
        tapT=0; tapTool=null;
        /* 换工具 = 画到一半的曲线作废。曲线是多步操作（掰完还得点完成），
           不跟着换工具一起清掉的话，它会一直挂在画面上挡着。 */
        cancelCurve();
      }
      buildTools(); if(propOpen()) buildProp(); updSelbar(); render();
    };
    // 双击同一个工具 = 展开 / 收起参数
    // 自己算时间差而不是用 dblclick，手机上更稳
    b.addEventListener('pointerup',()=>{
      const now=Date.now();
      if(tapTool===b.dataset.t && now-tapT<DBL_MS){ toggleProp(); tapT=0; tapTool=null; return; }
      tapT=now; tapTool=b.dataset.t;
    });
  });
}
