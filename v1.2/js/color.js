/* ==========================================================
   color.js  —— 颜色换算 / 配色方案 / 明暗色阶
   （卡槽的增删管理在 rack.js；这里只管「当前色」和由它算出来的东西）
   ========================================================== */
/* ---------- 颜色 ---------- */
function hsv2rgb(h,s,v){
  h=(h%360+360)%360;s/=100;v/=100;
  const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;
  let r,g,b;
  if(h<60)[r,g,b]=[c,x,0];else if(h<120)[r,g,b]=[x,c,0];else if(h<180)[r,g,b]=[0,c,x];
  else if(h<240)[r,g,b]=[0,x,c];else if(h<300)[r,g,b]=[x,0,c];else[r,g,b]=[c,0,x];
  return {r:Math.round((r+m)*255),g:Math.round((g+m)*255),b:Math.round((b+m)*255)};
}
function rgb2hsv(r,g,b){
  r/=255;g/=255;b/=255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
  let h=0;
  if(d){ if(mx===r)h=60*(((g-b)/d)%6); else if(mx===g)h=60*((b-r)/d+2); else h=60*((r-g)/d+4); }
  if(h<0)h+=360;
  return {h:Math.round(h),s:Math.round(mx?d/mx*100:0),v:Math.round(mx*100)};
}
const hx=n=>n.toString(16).padStart(2,'0').toUpperCase();
function curHex(){
  if(S.rgb) return '#'+hx(S.rgb[0])+hx(S.rgb[1])+hx(S.rgb[2]);
  const c=hsv2rgb(S.color.h,S.color.s,S.color.v);return '#'+hx(c.r)+hx(c.g)+hx(c.b);
}
function setHex(hex){
  const m=/^#?([0-9a-f]{6})$/i.exec(String(hex).trim()); if(!m) return false;
  const n=parseInt(m[1],16), r=(n>>16)&255, g=(n>>8)&255, b=n&255, c=rgb2hsv(r,g,b);
  S.color={h:c.h,s:c.s,v:c.v}; S.rgb=[r,g,b]; syncColorUI(); return true;
}
/* 拖了色板/色相，就不再是那个精确色了 */
function dropExact(){ S.rgb=null; }

/* ---------- 把「当前色」刷到界面上 ---------- */
function syncColorUI(){
  const hex=curHex();
  $('#curSw').style.background=hex;
  $('#newSw').style.background=hex;
  const hi=$('#hexTx');
  if(hi && document.activeElement!==hi) hi.value=hex;   /* 正在输入就别抢 */
  $('#hue').value=S.color.h;
  $('#sv').style.background=
    `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${S.color.h},100%,50%))`;
  const k=$('#knob');
  k.style.left=S.color.s+'%'; k.style.top=(100-S.color.v)+'%';
  buildMix();
  /* 悬浮窗里那三条 H/S/V 也能反应（它在外面才需要；不在外面没人看，顺手刷了也不亏） */
  if(window.paintFloat) window.paintFloat();
  if(typeof renderRack==='function') renderRack();
}

/* ==========================================================
   颜色配比：一条明暗阶梯，上色就照着它挑
   ------------------------------------------------------------
   5 档：描边（最暗）→ 暗部 → 固有色 → 亮部 → 高光（最亮）
   · 固有色 = 前景色（正在用的那个），另外 4 档跟着它变
   · 往暗走：色相偏蓝、饱和度加、明度压
   · 往亮走：色相偏黄、饱和度减、明度顶上去
   面板里那块和悬浮窗里那块是【同一套颜色】，一次算好，两边都刷。
   ========================================================== */
const MIX_NAMES=['描边','暗部','固有色','亮部','高光'];
/* 按当前色算出那 5 档（返回 5 个 hex，顺序跟 MIX_NAMES 对齐）
   【固有色那一档直接拿 curHex()，不走 HSV 打个来回】
   以前也跟着走一遍 hsv2rgb，结果选 #3B6FD4 时固有色显示 #3B6ED4 ——
   HSV 是取整的（S/V 只到整数），来回一趟就丢一位。差 1 肉眼看不出，
   可「当前用的是哪一档」的高亮是拿 hex 比对的，这一丢就永远对不上，
   选了主色反而哪一档都不亮。 */
function mixCalc(){
  const h=S.color.h, s=S.color.s, v=S.color.v;
  const cl=(n,a,b)=>n<a?a:n>b?b:n;
  const hex=(hh,ss,vv)=>{ const c=hsv2rgb(hh,ss,vv); return '#'+hx(c.r)+hx(c.g)+hx(c.b); };
  return [
    hex(h-16, cl(s+20,0,100),   cl(v*0.34,8,100)),
    hex(h-9,  cl(s+9,0,100),    cl(v*0.66,10,100)),
    curHex(),
    hex(h+11, cl(s*0.78,0,100), cl(v+(100-v)*0.34,0,100)),
    hex(h+18, cl(s*0.45,0,100), cl(v+(100-v)*0.76,0,100))
  ];
}
/* ------------------------------------------------------------
   【什么时候重算 —— 这是整个配比的命门，别改成「当前色一变就重算」】
   判据只有一条：**新颜色还在不在这 5 个里**。
     · 还在 → 说明你是在这一套内部换档（点档位、吸管吸画面上的色、
       点卡槽里恰好是这 5 个之一的色，都算），配比**一动不动**；
     · 不在 → 你真的调出了一个新颜色（拖色板、拖色相、手输 HEX），
       这才按它重新生成一套。
   为什么非得这样：画像素画是「先定一套 5 色，然后在这 5 个之间来回调」，
   全程都判成「还在这一套」，配比自然稳如磐石；要是改成「当前色一变就重算」，
   点一下「描边」旁边 4 个立刻跟着跳，挑好的一套永远留不住。
   S.mix = 现在这一套（跟着存档走 —— 当前色也存档了，所以切后台被杀掉
   再回来，颜色还是那个颜色，配比也就还是这一套，不会被重新洗一遍）。
   ------------------------------------------------------------ */
function mixSteps(){
  const cur=curHex().toUpperCase();
  const ok=Array.isArray(S.mix)&&S.mix.length===MIX_NAMES.length;
  if(ok && S.mix.some(c=>String(c).toUpperCase()===cur)) return S.mix.slice();
  S.mix=mixCalc(); save();
  return S.mix.slice();
}
/* 注意：这里【不标「现在用的是哪一档」】。
   试过给当前那一档描一圈蓝边，但那圈边会把色块撑大一截，
   5 个格子一起看，选中的那个像凸出来一块，很别扭。
   而且底下工具栏那个当前色图标已经在说这件事了，这里再来一遍是多余的。 */
function buildMix(){
  const html=mixSteps().map((c,i)=>
    `<div data-c="${c}"><i style="background:${c}"></i><em>${MIX_NAMES[i]}</em></div>`).join('');
  /* 面板里那一份 + 悬浮窗里那一份：同一套 html，点了都能拿来用。
     这里不用做任何特殊处理 —— 点的是这一套里的某一档，
     mixSteps() 自己会认出来「还在这一套」，也就不会重算。 */
  [$('#mixRow'),$('#mixFloat')].forEach(box=>{
    if(!box) return;
    box.innerHTML=html;
    box.querySelectorAll('div').forEach(d=>d.onclick=()=>setHex(d.dataset.c));
  });
}
