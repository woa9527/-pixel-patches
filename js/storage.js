/* ==========================================================
   storage.js  —— 本机自动保存 / 读取
   ========================================================== */
/* ---------- 存读 ---------- */
function toB64(u8){let s='';for(let i=0;i<u8.length;i+=0x8000)s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));return btoa(s);}
function fromB64(b){const s=atob(b),u=new Uint8ClampedArray(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;}
let saveT=null;
/* 当前画布 → 可序列化对象（localStorage / 工作区共用） */
function serializeDoc(){
  return {w:S.w,h:S.h,cur:S.lyCur,
    ls:S.layers.map(L=>({n:L.name,v:L.vis?1:0,k:L.lock?1:0,d:toB64(L.buf)}))};
}
/* 反序列化对象 → 当前画布（兼容老存档：只有 d 一个字段） */
function applyDoc(o){
  S.w=o.w;S.h=o.h;off.width=o.w;off.height=o.h;
  let ls;
  if(Array.isArray(o.ls)&&o.ls.length){
    ls=o.ls.map((L,i)=>{ const px=fromB64(L.d||''); if(px.length!==o.w*o.h*4) throw 0;
      return {id:++lyUid,name:L.n||('图层 '+(i+1)),vis:L.v!==0,lock:!!L.k,buf:px}; });
  }else{
    const px=fromB64(o.d); if(px.length!==o.w*o.h*4) throw 0;
    ls=[{id:++lyUid,name:'图层 1',vis:true,lock:false,buf:px}];
  }
  S.layers=ls;
  S.lyCur=clamp(o.cur==null?0:o.cur,0,ls.length-1);
  rebuildFlat(); history.stack=[];history.i=-1;pushHistory();
}
function writeNow(){
  try{
    /* pp.doc：现在是【多层】的。老存档只有 d 一个字段，读的时候会当单层接住。 */
    localStorage.setItem('pp.doc',JSON.stringify(serializeDoc()));
    if(typeof wsMirror==='function') wsMirror();   /* 同步镜像进当前工作区（IndexedDB） */
    localStorage.setItem('pp.racks',JSON.stringify(S.myRacks));
    localStorage.setItem('pp.slot',JSON.stringify({
      kind:S.kind, sysName:S.sysName, myIdx:S.myIdx,
      rackFolded:S.rackFolded, paintPinned:S.paintPinned,
      dockSide:S.dockSide, dockMini:S.dockMini,
      lyMode:S.lyMode==='float'?'float':'drawer',
      lyMin:!!S.lyMin, lyTop:S.lyTop,
      /* 调色板：哪几块被摘出去当悬浮窗了、窗停在哪儿、临时卡槽攒了哪些颜色 */
      pop:{hsvBar:!!(S.pop&&S.pop.hsvBar), mixBar:!!(S.pop&&S.pop.mixBar)},
      fl:S.fl||{}, tmp:S.tmp||[],
      /* 颜色配比现在这一套 5 个颜色。
         跟下面的 color 是一对：两个都存，回来时当前色还在这一套里，
         配比就不重算 —— 跨刷新也保得住挑好的那一套。 */
      mix:Array.isArray(S.mix)&&S.mix.length===5?S.mix:null,
      /* 当前色。rgb 是「精确色」：吸管吸的、手输 HEX 的都记在这儿，
         只存 h/s/v 的话回来会差一两位（HSV 是取整的），看着就是「颜色变了一点」。 */
      color:{h:S.color.h,s:S.color.s,v:S.color.v},
      rgb:Array.isArray(S.rgb)&&S.rgb.length===3?S.rgb:null,
      /* 帧率：现在能自由输（1~60），所以按范围收，不再只认那四档 */
      animFps:(anim&&anim.fps)||12,
      animX:S.animX, animY:S.animY
    }));
  }catch(e){}
}
function save(){
  clearTimeout(saveT);
  saveT=setTimeout(()=>{saveT=null;writeNow();},400);
}
/* 手机上最常发生的事：画完随手切后台、锁屏、关标签页。
   存档是延迟 400ms 写的，这时候必须补写一次，否则最后几笔会丢。 */
function flushSave(){
  if(!saveT) return;
  clearTimeout(saveT); saveT=null; writeNow();
}
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') flushSave(); });
function load(){
  try{
    const raw=localStorage.getItem('pp.doc');
    if(raw){
      const o=JSON.parse(raw);
      if(o&&o.w&&(o.d||(Array.isArray(o.ls)&&o.ls.length))){
        try{ applyDoc(o); }catch(e){ newDoc(32,32); }
      }
    }
    /* 我的卡槽（可以有很多个） */
    S.myRacks=JSON.parse(localStorage.getItem('pp.racks')||'[]');
    if(!Array.isArray(S.myRacks)) S.myRacks=[];
    /* 老版本存在 pp.mypal 里的颜色，搬成第一个「我的卡槽」，别让人白攒 */
    if(!S.myRacks.length){
      const oldPal=JSON.parse(localStorage.getItem('pp.mypal')||'[]');
      if(Array.isArray(oldPal)&&oldPal.length) S.myRacks=[{name:'我的调色板',colors:oldPal}];
    }
    const slot=JSON.parse(localStorage.getItem('pp.slot')||'null');
    if(slot){
      S.kind=slot.kind==='my'?'my':'sys';
      S.sysName=slot.sysName||'PICO-8';
      S.myIdx=(slot.myIdx==null?-1:slot.myIdx);
      S.rackFolded=!!slot.rackFolded;
      S.paintPinned=!!slot.paintPinned;
      /* 吸附位置：只认三个值，别的数据一律当没吸过 */
      S.dockSide=['top','left','right'].indexOf(slot.dockSide)>=0 ? slot.dockSide : '';
      S.dockMini=S.dockSide ? !!slot.dockMini : false;   /* 没吸出去就谈不上收起来 */
      /* 图层面板：形态（抽屉 / 漂浮）和漂浮窗的上下位置记下来，下次进来还是老样子。
         开没开【不记】—— 一进来就弹出个面板挡着画布，没人想要。 */
      S.lyMode=(slot.lyMode==='float')?'float':'drawer';
      S.lyMin=!!slot.lyMin && S.lyMode==='float';
      S.lyTop=(slot.lyTop==null?null:+slot.lyTop);
      /* 调色板的两个二级悬浮窗：上次有没有摘出去、停在哪儿、收起来没有 */
      if(slot.pop){ S.pop={hsvBar:!!slot.pop.hsvBar, mixBar:!!slot.pop.mixBar}; }
      if(slot.fl&&typeof slot.fl==='object'){
        ['hsvBar','mixBar'].forEach(id=>{
          if(slot.fl[id]&&typeof slot.fl[id]==='object') S.fl[id]=slot.fl[id];
        });
      }
      /* 临时卡槽：只认字符串数组，坏数据一律当空 */
      S.tmp=Array.isArray(slot.tmp)?slot.tmp.filter(c=>typeof c==='string').slice(0,32):[];
      /* 颜色配比这一套：必须是 5 个字符串，差一个都不认（认了会画出空色块） */
      S.mix=Array.isArray(slot.mix)&&slot.mix.length===5
        ? slot.mix.filter(c=>typeof c==='string') : null;
      if(S.mix&&S.mix.length!==5) S.mix=null;
      /* 当前色（放在 mix 之后读：等下 syncColorUI 要用它去比对 mix） */
      if(slot.color&&typeof slot.color==='object'){
        S.color={ h:(+slot.color.h||0)%360,
                  s:clamp(+slot.color.s||0,0,100),
                  v:clamp(+slot.color.v||0,0,100) };
      }
      S.rgb=Array.isArray(slot.rgb)&&slot.rgb.length===3
        ? slot.rgb.map(n=>clamp(Math.round(+n)||0,0,255)) : null;
      /* 动画上次用的帧率：四档之外还能自由输，只要在 1~60 里都认 */
      if(anim){
        const f=Math.round(+slot.animFps);
        if(f>=1&&f<=60) anim.fps=f;
      }
      /* 播放悬浮窗上次被拖到哪儿（超出范围就当没拖过，用默认位置） */
      S.animX=(slot.animX==null?null:+slot.animX);
      S.animY=(slot.animY==null?null:+slot.animY);
    }
    if(S.kind==='my'&&!S.myRacks[S.myIdx]){ S.kind='sys'; S.myIdx=-1; }
  }catch(e){ newDoc(32,32); }
}
