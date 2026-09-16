/* ==========================================================
   main.js  —— 启动流程
   ========================================================== */
/* ---------- 启动 ---------- */
/* 顶栏真实高度 → CSS 变量 --bar-h。吸附的色块要贴着顶栏下沿，
   靠写死的数字迟早对不上（横屏、字体大小都会变），所以直接量。 */
function syncBarH(){
  document.documentElement.style.setProperty('--bar-h', $('#bar').offsetHeight + 'px');
}
syncBarH();
if('ResizeObserver' in window) new ResizeObserver(syncBarH).observe($('#bar'));
if('ResizeObserver' in window) new ResizeObserver(()=>resize()).observe($('#cvwrap'));
window.addEventListener('orientationchange',()=>setTimeout(resize,300));
buildTools(); load();
if(!S.layers) newDoc(32,32);
renderLayers();
resize(); fitView(); syncColorUI(); buildProp(); render();
requestAnimationFrame(()=>{resize();fitView();render();});

/* 恢复上次的界面状态：固定过的调色板一进来就挂着，收起过的卡槽保持收起 */
if(S.rackFolded) $('#rack').classList.add('folded');
$('#rackFold').classList.toggle('on', !S.rackFolded);
/* 上次把色块吸到哪一边，这次还吸在那儿 */
if(S.dockSide) applySide(S.dockSide, true);
if(S.paintPinned){
  $('#pin').classList.add('on');
  setPaint(true);
}
/* 调色板的两个二级悬浮窗：上次有没有摘出去（读本机存档拿到的），这次照原样摆回去。
   必须等 load() 之后 —— pt 状态的默认值要被存档覆盖才算数。 */
if(window.pfRestore) pfRestore();

// 参数栏默认是收起的，不吭一声没人知道双击能开
setTimeout(()=>toast('双击左边工具图标，能展开它的参数'),600);

/* Service Worker 只在【本机基座】下注册：
     CDN 模式下所有资源都从别的域名来（跨域拿到的是 opaque response），
     SW 拦不住它们，留在那儿只会碍事，所以那边干脆注销掉（见 index.html 的 killSW()）。
   另外：这里的资源现在全是动态注入的，window 的 load 事件有可能早就过去了，
   所以走 PP.onLoad() —— 它在 readyState 已经是 complete 时会立即补一次。 */
if('serviceWorker' in navigator && !(window.PP && PP.cdn)){
  PP.onLoad(()=>{ navigator.serviceWorker.register('sw.js?v='+PP.vb).catch(()=>{}); });
}
