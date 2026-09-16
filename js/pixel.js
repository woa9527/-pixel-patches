/* ==========================================================
   pixel.js  —— 像素缓冲区与最底层落笔
   —— 图层：每层一份 buf；S.pixels 指向「当前层」的那一份，
      所以下面这些读写函数一行都不用改，它们天然只作用在“当前层”上。
   ========================================================== */
function mkLayer(name){
  return {id:++lyUid, name:name, buf:new Uint8ClampedArray(S.w*S.h*4), vis:true, lock:false};
}
/* 换画布尺寸 / 换层之后，把 S.pixels（当前层引用）和 S.flat（合成那张）重新挂好。
   凡是改了层数或画布尺寸的地方，都得调它。 */
function syncPx(){ S.pixels=S.layers[clamp(S.lyCur,0,S.layers.length-1)].buf; }
function rebuildFlat(){
  S.flat=new Uint8ClampedArray(S.w*S.h*4);
  S.img=new ImageData(S.flat,S.w,S.h);
  syncPx(); flatDirty=true;
}
/* 把所有可见层合成到 S.flat 上（从最底下那层往上贴，后贴的盖在上面）。
   像素画只有「全透明 / 全不透明」两种，所以按 alpha 是否为 0 直接覆盖就行，
   不用做半透明混合。用 Uint32 视图一次搬一个像素，比逐字节快得多（手机上是几十毫秒的差别）。 */
function flatten(){
  if(!flatDirty||!S.flat||!S.layers) return;
  flatDirty=false;
  const n=S.w*S.h, ls=S.layers;
  const dst=new Uint32Array(S.flat.buffer);
  dst.fill(0);
  const lay=(L)=>{                     /* 把一整层贴上去 */
    if(!L||!L.vis) return;
    const src=new Uint32Array(L.buf.buffer);
    for(let i=0;i<n;i++){ const v=src[i]; if(v>>>24) dst[i]=v; }   /* v>>>24 = alpha（小端机器） */
  };
  /* 【播动画：一帧 = 一张图，第 N 帧只显示第 N 层】
     原来是「第 1~N 层叠起来」，播到后面越叠越糊，用户明确否掉了：
     「你不能把那个眼睛还开着啊…每播放一个图层，它就是按图片一张一张地播放，不能叠加」。

     这里【不去真的改 L.vis】：关眼睛 = 动数据，播完/中途退出都得还原，
     一旦中间出岔子就留下一个「眼睛莫名其妙关了」的烂摊子。
     合成时只取那一层，效果跟关掉其他眼睛一模一样，还不留后遗症。 */
  if(anim&&anim.at!=null){ lay(ls[clamp(anim.at,0,ls.length-1)]); return; }
  /* 不播：从最底下那层一路叠上来，照旧 */
  for(let k=ls.length-1;k>=0;k--) lay(ls[k]);
}
function newDoc(w,h){
  if(anim&&anim.open) animClose();     /* 层都换掉了，播放序列也跟着没了 */
  S.w=w; S.h=h; off.width=w; off.height=h;
  S.layers=[mkLayer('图层 1')]; S.lyCur=0;
  rebuildFlat();
  history.stack=[]; history.i=-1; pushHistory();
  clearSel(); ptrs.clear(); stroke=null; preview=null; pan=null; pinch=null; move=null;
  renderLayers(); fitView(); render(); save();
}
const IX=(x,y)=>y*S.w+x;
function putPix(x,y,r,g,b,a){
  if(x<0||y<0||x>=S.w||y>=S.h) return;
  const i=IX(x,y)*4;
  S.pixels[i]=r;S.pixels[i+1]=g;S.pixels[i+2]=b;S.pixels[i+3]=a;
  flatDirty=true;                 /* 当前层动了，合成那张就过期了 */
}
function getPix(x,y){
  if(x<0||y<0||x>=S.w||y>=S.h) return [0,0,0,0];
  const i=IX(x,y)*4;
  return [S.pixels[i],S.pixels[i+1],S.pixels[i+2],S.pixels[i+3]];
}
/* 当前要落笔的颜色：有精确值就用精确值，没有才按 HSV 换算 */
const curRGBA=()=>{
  if(S.rgb) return [S.rgb[0],S.rgb[1],S.rgb[2],255];
  const c=hsv2rgb(S.color.h,S.color.s,S.color.v);return [c.r,c.g,c.b,255];
};
/* 【这里原本有个 darker()（当前色调暗当描边色用），已经删了】——
   形状的外围描边改成固定纯黑了，不是当前色的暗版。 */

function paint(x,y,rgba,erase){
  if(x<0||y<0||x>=S.w||y>=S.h) return;
  if(erase) putPix(x,y,0,0,0,0); else putPix(x,y,rgba[0],rgba[1],rgba[2],255);
  if(S.symmetry){
    const mx=S.w-1-x;
    if(erase) putPix(mx,y,0,0,0,0); else putPix(mx,y,rgba[0],rgba[1],rgba[2],255);
  }
}
function stamp(x,y,rgba,erase){
  const s=S.size, o=Math.floor((s-1)/2);
  for(let dy=0;dy<s;dy++)for(let dx=0;dx<s;dx++) paint(x-o+dx,y-o+dy,rgba,erase);
}
