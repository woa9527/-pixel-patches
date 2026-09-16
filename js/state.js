/* ==========================================================
   state.js  —— 全局状态 / 画布对象
   ========================================================== */
/* ---------- 状态 ---------- */
const S = {
  w:32, h:32, pixels:null, img:null,
  /* ---- 图层 ----
     layers[0] = 最上面那层（跟 PS 一致），下标越大越靠下。
     每层 {id, name, buf(自己的像素), vis(显示), lock(锁定)}。
     pixels 是【当前层 buf 的引用】—— 所有读写像素的老代码一行都不用改，
     它们天然只作用在「当前层」上。切层时 syncPx() 换一下指向就行。
     flat 是【所有可见层合成】出来的那一张，屏幕和导出 PNG 看的都是它。 */
  layers:null, lyCur:0, flat:null,
  /* 图层面板：lyMode 形态（drawer 抽屉 / float 漂浮窗）
     lyOpen 开没开（两个形态共用一个开关 → 天然互斥）
     lyMin  漂浮窗收成一小条了没      lyTop 漂浮窗的上下位置（左右是吸附死的） */
  lyMode:'drawer', lyOpen:false, lyMin:false, lyTop:null,
  /* 【没有 lyN 了】新层的编号改成扫一遍现存名字算出来（见 layer.js 的 nextLayerNo），
     老存档里带着 lyN 字段也无所谓，读进来不用就是。 */
  /* 播放悬浮窗被拖到哪儿了（相对画布区的 left/top，null = 用默认位置）。
     它是个「用时才出现」的窗，所以位置要记，开没开不记。 */
  animX:null, animY:null,
  tool:'pencil',
  size:1, symmetry:false,
  /* 形状的两个独立开关，各管一摊，能一起勾也能一起不勾：
     shapeFill —— 中间填不填当前色。勾上 = 实心；不勾 = 只剩一圈轮廓（空心）
     shapeRing —— 外面多包一圈纯黑。这一圈是额外多出来的，不占形状自己那一圈像素
     两个都不勾 = 一个空心的轮廓线框 */
  shapeFill:true,
  shapeRing:false,
  sprayR:4, sprayD:2,
  selShape:'rect', selMode:'new',
  /* 【移动】不再有「移什么」的开关：有选区就搬选区里的东西，没选区就整幅一起搬。
     都先用选区框好了再用移动，意图已经很明确，再问一遍就是多此一举。 */
  replScope:'all',
  outlineW:1, outlineSide:'out',
  /* curveMode：曲线工具的两种画法。
     'simple' 简单 —— 拖直线 → 再拖一下掰弯 → 松手就落定（只能往一边弯）
     'free'   自由 —— 拖直线 → 自动打 5 个点 → 随便掰 → 点「完成」才落定（能出 S 形）
     两种画法共用一个工具，不占两个按钮 —— 它们都是「画曲线」，只是掰弯的方式不同。 */
  curveMode:'simple',
  grid:true,
  color:{h:220,s:64,v:100},
  /* rgb：当前色的「精确值」。点色块/吸管取色时会记下来，
     避免 HSV 转来转去丢 1/255（练配色的人会抠这个）。
     一旦拖动画板滑块就置 null，改回按 HSV 算。 */
  rgb:null,
  /* ---- 卡槽 ----
     myRacks：我的卡槽列表，每个 {name, colors:[]}，可以建很多个，像存档
     kind：当前载入的是 'sys'（系统，只读）还是 'my'（我的，可改） */
  myRacks:[],
  sysName:'PICO-8',
  kind:'sys',
  myIdx:-1,
  rackSel:0,
  rackFolded:false,
  /* dockSide：色块被吸到屏幕哪一边。'' = 老老实实待在底部，
     否则是 'top' / 'left' / 'right'。吸走之后底部只剩菜单行。 */
  dockSide:'',
  /* dockMini：色块已经吸出去了，但嫌它碍眼，双击手柄把它收成一小块。
     再双击吐回来。它跟 dockSide 是两回事 —— 收起来不是取消吸附。 */
  dockMini:false,
  paintOpen:false,
  paintPinned:false,
  /* ---- 调色板的两个【二级悬浮窗】----
     pop：哪一块被摘出去了（true = 正在外面当悬浮窗，面板里那块自动消失）
        hsvBar —— H / S / V 三条滑块，代替面板里的 SV 色板 + 色相条
        mixBar —— 颜色配比 5 档
     fl ：每个窗自己那点状态，按 id 分开记（位置 left/top、按比例还原用的 rx/ry、
          有没有收起来 mini、是不是往左长 flip、有没有被拖过 placed） */
  pop:{hsvBar:false, mixBar:false},
  fl:{hsvBar:{}, mixBar:{}},
  /* tmp：临时卡槽。随手攒颜色的地方 —— 点空格加当前色、长按删掉，
     攒够了按「加入卡槽」整批交给卡槽（新建我的卡槽 / 直接载入当前卡槽）。 */
  tmp:[],
  /* 颜色配比：现在正在用的那 5 个 hex。
     当前色还在这 5 个里 → 配比不动；不在 → 按新色重算一套（见 color.js 的 mixSteps）。 */
  mix:null
};
const V = {scale:8, ox:0, oy:0};
let cssW=0, cssH=0, dpr=Math.min(window.devicePixelRatio||1,2);
let sel=null;
let clip=null;
let dashT=0, dashTimer=null;
/* flat 是合成出来的那张，像素一动它就过期了。置 true 之后下一次 render() 会重算。
   不这么弄的话，512×512 五层的画布每帧都要合成一百万个像素，拖起来会卡死。 */
let flatDirty=true;
let lyUid=0;          /* 图层 id 发号器 */

/* ---------- 画布 ---------- */
const off=document.createElement('canvas'), octx=off.getContext('2d');
const cv=$('#view'), ctx=cv.getContext('2d');
