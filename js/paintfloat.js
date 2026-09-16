/* ==========================================================
   paintfloat.js —— 调色板的两个【二级悬浮窗】+【临时卡槽】
   ------------------------------------------------------------
   ① H/S/V 悬浮窗（#hsvBar）  ← 面板头部那个「三横＋圆点」按钮摘出来
   ② 颜色配比悬浮窗（#mixBar）← 「颜色配比」标题左边那个「小窗＋箭头」按钮摘出来

   两个窗的规矩（一条都不能破，破一条就会出怪事）：
     · 只有【手柄】能拖窗，其它地方一律不动 —— 跟 H/S/V 三条滑块互不打扰
     · 只能【上下】吸附成一个整块，左右不算
     · 靠近 24px 以内才吸；拼上之后整块一起动
     · 收起时【高度不变，只收宽度】—— 老规矩，别把宽度当缩放用
     · 双击手柄 = 拆开，并且真的【弹开 76px】（吸附距离的三倍多），
       不然拆完还黏在一起，手指一碰又吸回去，等于没拆

   ③ 临时卡槽（#tmpRack）：临时攒颜色的小格子，
      「加入卡槽」把它们一次性交给卡槽（新建我的卡槽 / 直接载入当前卡槽）
   ========================================================== */
(function(){
  const PAD=4;                     /* 离机身边缘至少留这么多 */
  const SNAP=24;                   /* 上下 24px 以内才吸上去 */
  const UNSNAP=76;                 /* 双击拆开后弹开的空隙 */
  const UNSNAP_COOL=600;           /* 拆开后的冷却：这段时间内一律不吸 */

  /* ---------- 右边到哪儿为止 ----------
     【为什么要躲着调色板】面板右边那一列里站着「摘出去 / 收回来」那两颗按钮，
     悬浮窗要是压上去，想收回来还得先把窗挪开 —— 自己挡自己。
     所以【自动摆放】的时候一律躲开面板那一列；真用手拽过去的拦不住，那是你要的。
     小屏 / 横屏时左边确实放不下就不再躲 —— 躲了会被挤到屏幕正中间，更怪。 */
  function rightBound(w){
    const b=bodyEl().getBoundingClientRect(), pt=$('#paint'), full=b.width-PAD;
    if(!pt||!pt.classList.contains('open')||!pt.offsetWidth) return full;
    const cand=(pt.getBoundingClientRect().left-b.left)-PAD;
    return (cand-PAD>=w)?cand:full;
  }
  /* 用法一致：给它「想要的 left」，它返回一个合法值 */
  function clampL(fl,l){ return Math.max(PAD,Math.min(rightBound(fl.offsetWidth)-fl.offsetWidth,l)); }

  /* ---------- 更彻底的躲法：躲不开就躲到面板【下面】----------
     悬浮窗 252px，面板那一列 162px —— 往左躲基本躲不开。
     但面板现在高度是裹着内容的（东西被摘出去就更短了），底下有的是地方，
     所以横向躲不开时整块搬到面板下沿以下，一眼能找到，也绝不挡那两颗按钮。
     只在【自动摆放】时生效（刚摘出来 / 转屏 / 面板开关）；自己用手拽过去的
     不拦 —— 那是你自己拽的，爱放哪儿放哪儿。 */
  function clearOfPanel(fl,l,t){
    const b=bodyEl().getBoundingClientRect(), pt=$('#paint');
    if(!pt||!pt.classList.contains('open')||!pt.offsetWidth) return {l:l,t:t};
    const pr=pt.getBoundingClientRect();
    const pL=pr.left-b.left, pB=pr.bottom-b.top;
    const w=fl.offsetWidth, h=fl.offsetHeight;
    if(l+w<=pL-PAD) return {l:l,t:t};            /* ① 本来就在面板左边 */
    if(t   >=pB)    return {l:l,t:t};            /* ② 本来就在面板下面 */
    if(pL-PAD-w>=PAD) return {l:pL-PAD-w,t:t};   /* ③ 往左挪挪得开 */
    return {l:Math.max(PAD,Math.min(b.width-w-PAD,l)),       /* ④ 搬到面板下面 */
            t:Math.max(PAD,Math.min(b.height-h-PAD,pB+PAD))};
  }

  const FLOATS=['hsvBar','mixBar'];
  /* 悬浮窗活在【机身区 #main】里。
     【为什么不放在 #cvwrap】cvwrap 有 overflow:hidden，调色板一开它就只剩 186px 宽，
     252px 的悬浮窗会被从右边活活裁掉一截。
     #main = 除了顶栏和底部卡槽以外的整个机身，画布、工具栏、调色板都能压，
     这跟手机上的实感一致：摘出来的悬浮条就该浮在最上面到处挪。 */
  const bodyEl=()=>$('#main');
  const F=id=>document.getElementById(id);
  const grpOf=id=>group&&group.indexOf(id)>=0?group:null;

  let group=null, noSnapUntil=0, snapRef=null, swapDone=false, pending=null;

  /* 位置记在 S.fl 里，下次打开还在老地方 */
  if(!S.fl) S.fl={};
  FLOATS.forEach(id=>{ if(!S.fl[id]) S.fl[id]={}; });

  /* ---------- 量宽度：必须掐掉动画，不然量到的是「变到一半」的值 ---------- */
  function measure(fl){
    fl.classList.add('nofx');
    const keep=fl.style.getPropertyValue('--grow');
    fl.style.setProperty('--grow','0px');
    const was=fl.classList.contains('mini');
    fl.classList.remove('mini'); const wOpen=fl.offsetWidth;
    fl.classList.add('mini');    const wShut=fl.offsetWidth;
    if(!was) fl.classList.remove('mini');
    void fl.offsetWidth;
    fl.style.setProperty('--grow',keep||'0px');
    fl.classList.remove('nofx');
    return {wOpen:wOpen,wShut:wShut};
  }
  function noGrow(id){ F(id).style.setProperty('--grow','0px'); }
  function syncWidth(){
    FLOATS.forEach(id=>{ noGrow(id); F(id).style.minWidth=''; });
    if(!group) return;
    const open=group.filter(id=>!F(id).classList.contains('mini'));
    const shut=group.filter(id=> F(id).classList.contains('mini'));
    FLOATS.forEach(id=>F(id).classList.add('nofx'));
    if(open.length===2){
      const nat={}; open.forEach(id=>{ nat[id]=F(id).offsetWidth; });
      const W=Math.max.apply(null,open.map(id=>nat[id]));
      open.forEach(id=>{
        const add=W-nat[id];
        F(id).style.setProperty('--grow',(id==='mixBar'?add/5:add)+'px');
      });
    }
    /* 两个都收起的情况什么都不用做：CSS 的 .mixfloat.mini 已经让它们天生一样宽。
       【别】再用 min-width 把窄的撑宽 —— 一撑，里面那条把手就不居中了。 */
    void F(group[0]).offsetWidth;
    FLOATS.forEach(id=>F(id).classList.remove('nofx'));
  }
  function stack(anchor){
    if(!group) return;
    const A=F(anchor), O=F(group[0]===anchor?group[1]:group[0]);
    const al=parseFloat(A.style.left)||0, at=parseFloat(A.style.top)||0;
    O.style.left=al+'px';
    O.style.top=(group[0]===anchor) ? (at+A.offsetHeight)+'px'
                                    : (at-O.offsetHeight)+'px';
  }
  const layout=()=>{ if(group) stack(group[0]); };
  function attach(aId,bId,aIsTop){
    group=aIsTop?[aId,bId]:[bId,aId];
    group.forEach(id=>F(id).classList.add('grp'));
    F(group[0]).classList.add('above');
    F(group[1]).classList.add('below');
    layout(); syncWidth();
  }
  function detach(push){
    if(!group) return;
    const ids=group.slice();
    ids.forEach(id=>F(id).classList.remove('grp','above','below'));
    group=null; snapRef=null; noSnapUntil=Date.now()+UNSNAP_COOL;
    FLOATS.forEach(noGrow);
    if(push) shove(ids);
  }
  function shove(ids){
    const b=bodyEl().getBoundingClientRect();
    const A=F(ids[0]), B=F(ids[1]);
    const aT=parseFloat(A.style.top)||0, bT=parseFloat(B.style.top)||0;
    const upRoom=Math.max(0,aT-PAD);
    const dnRoom=Math.max(0,(b.height-B.offsetHeight-PAD)-bT);
    const gap=Math.min(UNSNAP,upRoom+dnRoom);
    const dn=Math.min(dnRoom,gap-Math.min(upRoom,gap/2));
    const up=Math.min(upRoom,gap-dn);
    [A,B].forEach(el=>{ el.style.transition='top .26s cubic-bezier(.2,.85,.3,1)'; });
    A.style.top=Math.max(PAD,aT-up)+'px';
    B.style.top=(bT+dn)+'px';
    setTimeout(()=>{ A.style.transition=''; B.style.transition=''; },320);
  }
  /* ---- 靠近了就吸：四条一起满足才吸 ---- */
  function trySnap(id){
    if(group||Date.now()<noSnapUntil) return false;
    const oid=FLOATS.filter(x=>x!==id)[0], A=F(id), B=F(oid);
    if(!B||!B.classList.contains('on')) return false;
    const ra=A.getBoundingClientRect(), rb=B.getBoundingClientRect();
    const ovx=Math.min(ra.right,rb.right)-Math.max(ra.left,rb.left);
    if(ovx < Math.min(ra.width,rb.width)*0.5) return false;   /* ① 横向压住一半以上 */
    const aTop=(ra.top+ra.height/2)<(rb.top+rb.height/2);
    const gap=aTop?rb.top-ra.bottom:ra.top-rb.bottom;
    if(gap<-12||gap>SNAP) return false;                        /* ② 上下 24px 以内 */
    A.style.left=B.style.left;
    attach(id,oid,aTop);
    if(A.classList.contains('mini')!==B.classList.contains('mini'))
      A.classList.toggle('mini',B.classList.contains('mini'));
    syncWidth(); stack(oid);
    return true;
  }

  /* ---------- 收起 ⇄ 展开：右边放不下就往左长 ---------- */
  function toggleMini(fl){
    const b=bodyEl().getBoundingClientRect();
    const r0=fl.getBoundingClientRect();
    const wasMini=fl.classList.contains('mini');
    const m=measure(fl);
    fl.style.transition='left .22s ease';
    if(wasMini){
      const limR=rightBound(m.wOpen)-m.wOpen;   /* 展开之后最右能到哪 */
      let left=r0.left-b.left;
      if(left>limR){
        const right0=r0.right-b.left;
        /* 右边顶住了就往左长（flip）：右沿钉住不动，左边甩出去 */
        if(right0-m.wOpen>=PAD && right0<=rightBound(m.wOpen)){ fl.classList.add('flip'); left=right0-m.wOpen; }
        else{ fl.classList.remove('flip'); left=Math.max(PAD,limR); }
      }else fl.classList.remove('flip');
      fl.style.left=left+'px';
      fl.classList.remove('mini');
    }else{
      const hugRight=fl.classList.contains('flip') || (rightBound(r0.width)-(r0.right-b.left)<=PAD+2);
      const left=hugRight ? (r0.right-b.left)-m.wShut : (r0.left-b.left);
      fl.style.left=Math.max(PAD,Math.min(rightBound(m.wShut)-m.wShut,left))+'px';
      fl.classList.add('mini');
    }
    syncWidth(); layout(); saveFloat();
  }
  /* ---------- 拼着的时候两个一起收／放，方向也一起翻 ---------- */
  function toggleGroup(){
    const ids=group.slice(); if(!ids.length) return;
    const b=bodyEl().getBoundingClientRect();
    const wasMini=F(ids[0]).classList.contains('mini');
    const left0=parseFloat(F(ids[0]).style.left)||0;
    const setMini=v=>ids.forEach(id=>F(id).classList.toggle('mini',v));
    ids.forEach(id=>F(id).classList.add('nofx'));
    setMini(false); syncWidth(); const wOpen=F(ids[0]).offsetWidth;
    setMini(true);  syncWidth(); const wShut=F(ids[0]).offsetWidth;
    setMini(wasMini); syncWidth();
    void F(ids[0]).offsetWidth;
    ids.forEach(id=>F(id).classList.remove('nofx'));

    let left=left0, flip=false;
    if(wasMini){
      const limR=rightBound(wOpen)-wOpen;
      if(left>limR){
        const right0=left0+wShut;
        if(right0-wOpen>=PAD && right0<=rightBound(wOpen)){ flip=true; left=right0-wOpen; }
        else left=Math.max(PAD,limR);
      }
    }else{
      /* 右边本来就贴着边界的（或翻转过的），收起来时右沿要钉住 ——
         收的时候是从右往左收的，看着才像抽屉拉上。 */
      const hugRight=ids.some(id=>F(id).classList.contains('flip'))
                   || (rightBound(wOpen)-left0-wOpen<=PAD+2);
      left=hugRight ? (left0+wOpen)-wShut : left0;
      left=Math.max(PAD,Math.min(rightBound(wShut)-wShut,left));
      flip=hugRight;
    }
    ids.forEach(id=>{
      F(id).style.transition='left .22s ease';
      F(id).classList.toggle('flip',flip);
      F(id).style.left=left+'px';
      F(id).classList.toggle('mini',!wasMini);
    });
    syncWidth(); stack(ids[0]); saveFloat();
  }
  /* ---- 拼着时往对方那边推过 60px = 上下换个儿 ---- */
  function pushSwap(id,ey){
    if(!group||!snapRef||swapDone) return false;
    const push=ey-snapRef.y;
    const aIsTop=group[0]===id;
    if(!(aIsTop ? push>60 : push<-60)) return false;
    const O=F(group[0]===id?group[1]:group[0]);
    const ot=parseFloat(O.style.top)||0;
    group.reverse();
    F(group[0]).classList.add('above'); F(group[0]).classList.remove('below');
    F(group[1]).classList.add('below'); F(group[1]).classList.remove('above');
    swapDone=true; snapRef=null;
    syncWidth();
    return {top:ot};
  }
  /* ---- 点手柄：没拼上 = 直接收／放；拼上了 = 双击才拆开 ---- */
  function tap(fl){
    if(!grpOf(fl.id)){ toggleMini(fl); return; }
    if(pending&&pending.id==='G'){ clearTimeout(pending.t); pending=null; detach(true); saveFloat(); return; }
    pending={id:'G',t:setTimeout(()=>{ pending=null; toggleGroup(); },240)};
  }
  function saveFloat(){
    FLOATS.forEach(id=>{
      const fl=F(id), st=S.fl[id];
      st.l=parseFloat(fl.style.left)||0;
      st.t=parseFloat(fl.style.top)||0;
      st.mini=fl.classList.contains('mini');
      st.flip=fl.classList.contains('flip');
    });
    save();
  }

  /* ---------- 拖窗 ---------- */
  FLOATS.forEach(id=>{
    const fl=F(id); if(!fl) return;
    let on=false,sx=0,sy=0,moved=false,start=null;
    fl.addEventListener('pointerdown',e=>{
      if(!e.target.closest('.grip')) return;              /* 只有手柄能挪窗 */
      start={ f:fl, l:parseFloat(fl.style.left)||0, t:parseFloat(fl.style.top)||0,
              w:fl.offsetWidth, h:fl.offsetHeight };
      sx=e.clientX; sy=e.clientY; on=true; moved=false; swapDone=false;
      FLOATS.forEach(x=>{ F(x).style.transition='none'; });
      try{ fl.setPointerCapture(e.pointerId); }catch(err){}
      e.preventDefault();
    });
    fl.addEventListener('pointermove',e=>{
      if(!on) return;
      const dx=e.clientX-sx, dy=e.clientY-sy;
      if(!moved){ if(Math.abs(dx)<6&&Math.abs(dy)<6) return; moved=true; }
      if(e.cancelable) e.preventDefault();
      const b=bodyEl().getBoundingClientRect();
      let minL=PAD, maxL=b.width-start.w-PAD;
      let minT=PAD, maxT=b.height-start.h-PAD;
      if(group){
        const O=F(group[0]===id?group[1]:group[0]), ow=O.offsetWidth, oh=O.offsetHeight;
        maxL=b.width-Math.max(start.w,ow)-PAD;
        if(group[0]===id) maxT=b.height-(start.h+oh)-PAD;
        else              minT=PAD+oh;
      }
      const nl=Math.max(minL,Math.min(maxL,start.l+dx));
      const nt=Math.max(minT,Math.min(maxT,start.t+dy));
      start.f.style.left=nl+'px';
      start.f.style.top =nt+'px';
      if(group){
        const sw=pushSwap(id,e.clientY);
        if(sw){
          fl.style.top=sw.top+'px';
          sx=e.clientX; sy=e.clientY;
          start={ f:fl, l:parseFloat(fl.style.left)||0, t:sw.top,
                  w:fl.offsetWidth, h:fl.offsetHeight };
        }
        stack(id);
      }else if(trySnap(id)){
        sx=e.clientX; sy=e.clientY; snapRef={y:e.clientY};
        start={ f:fl, l:parseFloat(fl.style.left)||0, t:parseFloat(fl.style.top)||0,
                w:fl.offsetWidth, h:fl.offsetHeight };
      }
    });
    const up=()=>{
      if(!on) return; on=false;
      FLOATS.forEach(x=>{ F(x).style.transition=''; });
      if(!moved){ tap(fl); return; }
      if(group){ saveFloat(); return; }
      fl.style.transition='left .18s ease,top .18s ease';
      const b=bodyEl().getBoundingClientRect(), r=fl.getBoundingClientRect();
      const d=[['top',r.top-b.top],['bottom',b.bottom-r.bottom],
               ['left',r.left-b.left],['right',b.right-r.right]].sort((a,c)=>a[1]-c[1]);
      const side=d[0][0];
      if(side==='top')    fl.style.top=PAD+'px';
      if(side==='bottom') fl.style.top=(b.height-fl.offsetHeight-PAD)+'px';
      if(side==='left')   fl.style.left=PAD+'px';
      if(side==='right')  fl.style.left=(rightBound(fl.offsetWidth)-fl.offsetWidth)+'px';
      saveFloat();
    };
    fl.addEventListener('pointerup',up);
    fl.addEventListener('pointercancel',up);
    fl.addEventListener('lostpointercapture',up);
  });

  /* ==========================================================
     H / S / V 三条滑块
     ------------------------------------------------------------
     两条铁律（都是踩出来的坑）：
       ① 按【每一小段位移】累加，不是「起点 + 总位移」。用总位移的话，
          慢速开关一变，整段位移被重新乘一遍 → 数值瞬移／自动跳回起点。
       ② 慢速要有迟滞（>44 进、<26 出）。只在一个点上判断，手指一抖
          就连着进出，速度来回翻 3.3 倍。
     ========================================================== */
  const rd=$('#hsvRd');
  const spec={barH:[360,'H','h'],barS:[100,'S','s'],barV:[100,'V','v']};
  (function(){
    const showRd=(n,v,max)=>{ if(!rd) return;
      rd.textContent=n+' '+Math.round(v)+(max===360?'°':'%'); rd.style.opacity='1'; };
    const hideRd=()=>{ if(rd) rd.style.opacity='0'; };
    Object.keys(spec).forEach(id=>{
      const el=$( '#'+id ); if(!el) return;
      const max=spec[id][0], name=spec[id][1], k=spec[id][2];
      let on=false,lastX=0,slowMode=false;
      el.addEventListener('pointerdown',e=>{
        on=true; lastX=e.clientX; slowMode=false;
        try{ el.setPointerCapture(e.pointerId); }catch(err){}
        showRd(name,S.color[k],max);
        e.preventDefault(); e.stopPropagation();     /* 别让外层把它当「拖窗」 */
      });
      el.addEventListener('pointermove',e=>{
        if(!on) return;
        const r=el.getBoundingClientRect();
        const dy=Math.abs(e.clientY-(r.top+r.height/2));
        if(!slowMode && dy>44) slowMode=true;
        else if(slowMode && dy<26) slowMode=false;
        const slow=slowMode?0.3:1;
        const dx=e.clientX-lastX; lastX=e.clientX;
        /* 以前吸管取得的「精确色」要作废 —— 不然 curHex() 还在返回那个旧值，
           拖了半天颜色纹丝不动。 */
        dropExact();
        S.color[k]=clamp(S.color[k]+dx/r.width*max*slow,0,max);
        syncColorUI(); showRd(name,S.color[k],max);
      });
      const up=()=>{ if(!on) return; on=false; slowMode=false; hideRd(); save(); };
      el.addEventListener('pointerup',up);
      el.addEventListener('pointercancel',up);
      el.addEventListener('lostpointercapture',up);
    });
  })();
  /* 面板那边改了颜色 → 把三条滑块刷过来（只读不写，不会打圈） */
  function paintFloat(){
    const full=hsv2rgb(S.color.h,100,100), grey=hsv2rgb(S.color.h,0,100);
    const fh='#'+hx(full.r)+hx(full.g)+hx(full.b), gh='#'+hx(grey.r)+hx(grey.g)+hx(grey.b);
    if(F('barH')) F('barH').style.background=
      'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)';
    if(F('barS')) F('barS').style.background='linear-gradient(to right,'+gh+','+fh+')';
    if(F('barV')) F('barV').style.background='linear-gradient(to right,#000,'+fh+')';
    const set=(id,pct)=>{ const c=F(id)&&F(id).querySelector('.cal'); if(c) c.style.left=clamp(pct,0,100)+'%'; };
    set('barH',S.color.h/3.6); set('barS',S.color.s); set('barV',S.color.v);
  }
  window.paintFloat=paintFloat;

  /* ==========================================================
     弹出 / 收回：由面板里那两个按钮驱动
     —— 新冒出来的窗停在哪儿（home）：
        具体位置交给 clearOfPanel() 定，不够地方它自会把整块挪到面板下面。
        已经有伙伴在外面的话，接着它往下排 —— 别两块叠在一起。
     ========================================================== */
  function home(id){
    const b=bodyEl().getBoundingClientRect(), fl=F(id);
    const h=fl.offsetHeight||60;
    const t0=id==='hsvBar'?b.height*0.10:b.height*0.38;
    const p=clearOfPanel(fl,PAD,Math.max(PAD,Math.min(b.height-h-PAD,t0)));
    let t=p.t;
    FLOATS.forEach(x=>{
      const O=F(x);
      if(x!==id&&O.classList.contains('on'))
        t=Math.max(t,(parseFloat(O.style.top)||0)+O.offsetHeight+PAD);
    });
    return {l:p.l,t:Math.max(PAD,Math.min(b.height-h-PAD,t))};
  }
  /* 面板开了 / 转屏了之后，把压在面板上的窗挪开（1 号用到） */
  function settle(){
    FLOATS.forEach(id=>{
      const fl=F(id); if(!fl.classList.contains('on')) return;
      const l=parseFloat(fl.style.left)||0, t=parseFloat(fl.style.top)||0;
      const p=clearOfPanel(fl,l,t);
      if(Math.abs(p.l-l)<.5&&Math.abs(p.t-t)<.5) return;
      fl.style.transition='left .2s ease,top .2s ease';
      fl.style.left=p.l+'px'; fl.style.top=p.t+'px';
      setTimeout(()=>{ fl.style.transition=''; },280);
    });
    /* 两个被搬到一块了 → 把偏下的那个再往下岔开 */
    const on=FLOATS.filter(id=>F(id).classList.contains('on'));
    if(on.length!==2) return;
    const A=F(on[0]),B=F(on[1]);
    const at=parseFloat(A.style.top)||0, bt=parseFloat(B.style.top)||0;
    if(Math.abs(at-bt)>=A.offsetHeight) return;
    const lo=at<=bt?A:B, hi=at<=bt?B:A;
    const nt=Math.max(PAD,Math.min(bodyEl().getBoundingClientRect().height-hi.offsetHeight-PAD,
                                   (parseFloat(lo.style.top)||0)+lo.offsetHeight+PAD));
    hi.style.transition='top .2s ease'; hi.style.top=nt+'px';
    setTimeout(()=>{ hi.style.transition=''; },280);
    saveFloat();
  }
  window.pfSettle=settle;
  function pop(id){
    const fl=F(id); if(!fl) return;
    const st=S.fl[id], b=bodyEl().getBoundingClientRect();
    fl.classList.add('on');
    if(st.placed){
      /* 上次拖到过 → 回到老地方（换算成「离边缘的比例」，换手机也不会跑到屏幕外） */
      const       rx=st.rx==null?0:+st.rx, ry=st.ry==null?0.1:+st.ry;
      fl.style.left=clampL(fl,Math.max(PAD,Math.min(b.width-fl.offsetWidth-PAD, rx*b.width)))+'px';
      fl.style.top =Math.max(PAD,Math.min(b.height-fl.offsetHeight-PAD, ry*b.height))+'px';
    }else{
      const p=home(id);
      fl.style.left=p.l+'px'; fl.style.top=p.t+'px';
      st.placed=1; st.rx=p.l/b.width; st.ry=p.t/b.height;
    }
    if(st.mini) fl.classList.add('mini'); else fl.classList.remove('mini');
  }
  /* 悬浮窗游移时把「相对位置」记下来，下次按比例还原 */
  function remember(){
    const b=bodyEl().getBoundingClientRect();
    FLOATS.forEach(id=>{
      const fl=F(id), st=S.fl[id];
      st.rx=(parseFloat(fl.style.left)||0)/b.width;
      st.ry=(parseFloat(fl.style.top)||0)/b.height;
    });
  }
  /* 面板里的按钮 ←→ 悬浮窗 */
  function setFloat(id,out){
    const fl=F(id); if(!fl) return;
    const sv=$('#sv'), hue=$('#hue'), mixRow=$('#mixRow'), mixSect=$('#mixSect');
    if(out){
      /* 【顺序有讲究】先把面板里那一份收掉，面板变短之后再放悬浮窗 ——
         悬浮窗万一要躲到面板下面，躲的是【变短以后】的下沿，位置才准。 */
      if(id==='hsvBar'){ if(sv) sv.style.display='none'; if(hue) hue.style.display='none'; }
      else if(mixSect) mixSect.style.display='none';
      pop(id);
    }else{
      detach();
      fl.classList.remove('on');
      if(id==='hsvBar'){ if(sv) sv.style.display=''; if(hue) hue.style.display=''; }
      else if(mixSect) mixSect.style.display='';
      settle();          /* 面板又长回来了，看看有没有把谁埋住 */
    }
    S.pop[id]=out; save();
  }
  $('#btnHSV') && $('#btnHSV').addEventListener('click',()=>{
    const b=$('#btnHSV'), out=!b.classList.contains('on');
    b.classList.toggle('on',out); setFloat('hsvBar',out);
  });
  const ab=$('#btnMix');
  ab && ab.addEventListener('click',()=>{
    const out=!ab.classList.contains('on');
    ab.classList.toggle('on',out); setFloat('mixBar',out);
  });

  /* ==========================================================
     临时卡槽 + 加入卡槽
     ========================================================== */
  /* S.tmp：临时攒的颜色。
     · 点末尾 ＋ 空格 ＝ 把当前色加进来
     · 点颜色格 ＝ 取它来用
     · 长按颜色格 ＝ 删掉这一格（跟底部卡槽一个规矩）
     · 点末尾 🗑 ＝ 一次性全清（快捷清空，空着的时候点了没反应，也不会有提示烦你） */
  function drawTmp(){
    const box=$('#tmpRack'); if(!box) return;
    box.innerHTML=S.tmp.map((c,i)=>
      `<i style="background:${c}" data-i="${i}" data-c="${c}"></i>`).join('')+
      '<i class="empty" data-add="1"></i>'+
      '<i class="bin" data-bin="1" title="清空临时卡槽">'+
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" '+
        'stroke-linecap="round" stroke-linejoin="round">'+
        '<path d="M4.2 7h15.6M9.2 7V4.8h5.6V7M6.6 7l.9 12.2h9L17.4 7M10.2 11v5.4M13.8 11v5.4"/>'+
        '</svg></i>';
    box.querySelectorAll('i').forEach(e=>{
      const add=e.dataset.add, bin=e.dataset.bin;
      let lp=null,fired=false;
      e.addEventListener('pointerdown',()=>{ fired=false; if(add||bin) return;
        lp=setTimeout(()=>{ fired=true; delTmp(+e.dataset.i); },520); });
      const cancel=()=>clearTimeout(lp);
      ['pointerup','pointermove','pointercancel'].forEach(t=>e.addEventListener(t,cancel));
      e.addEventListener('click',()=>{
        if(fired) return;
        if(add){ addTmp(); }
        else if(bin){ clearTmp(); }
        else { setHex(e.dataset.c); }
      });
    });
  }
  function addTmp(){
    const hex=curHex();
    if(S.tmp.length>=RACK_MAX){ toast('临时卡槽满了（'+RACK_MAX+'），先长按删掉几个'); return; }
    S.tmp.push(hex); save(); drawTmp(); toast('临时卡槽 + '+hex);
  }
  function delTmp(i){
    const c=S.tmp[i]; if(c==null) return;
    S.tmp.splice(i,1); save(); drawTmp(); toast('已移出临时卡槽 '+c);
  }
  /* 快捷清空：一行不留。什么都不剩的时候点它不吭声 —— 没东西可清还弹提示，纯属添乱 */
  function clearTmp(){
    if(!S.tmp.length) return;
    const n=S.tmp.length;
    S.tmp=[]; save(); drawTmp(); toast('临时卡槽已清空（'+n+' 色）');
  }
  window.drawTmp=drawTmp;

  /* ---- 加入卡槽：临时卡槽整批交给卡槽 ---- */
  const dlg=$('#dlgAdd'), mask=$('#dlgMask');
  const closeDlg=()=>{ if(dlg) dlg.classList.remove('on'); if(mask) mask.classList.remove('on'); };
  mask && mask.addEventListener('click',closeDlg);
  $('#btnSave') && ($('#btnSave').onclick=()=>{
    if(!S.tmp.length){ toast('临时卡槽还是空的\n点里面那个 ＋ 格子先加几个颜色'); return; }
    $('#dlgN').textContent=S.tmp.length+' 色';
    $('#dlgN2').textContent=S.tmp.length;
    const ro=dlg.querySelector('[data-op="load"]');
    ro.disabled=isSys();
    $('#dlgLoadTip').textContent=isSys()
      ? '系统卡槽只读，加不进去（去配色库 → 我的卡槽）'
      : '塞进现在正在用的「'+curName()+'」，替掉它原来的颜色';
    dlg.classList.add('on'); mask.classList.add('on');
  });
  dlg && dlg.querySelectorAll('.op').forEach(b=>b.addEventListener('click',()=>{
    const op=b.dataset.op; closeDlg();
    if(op==='x') return;
    if(S.tmp.length>RACK_MAX){ toast('卡槽最多 '+RACK_MAX+' 色\n临时卡槽有 '+S.tmp.length+' 个，先删几个'); return; }
    /* 颜色已经送出去了 → 临时卡槽就地清空。
       不管送到哪儿（新建的也好、正在用的也好），留着就是下次又误加一遍。 */
    const n=S.tmp.length;
    const flush=()=>{ S.tmp=[]; save(); drawTmp(); };
    if(op==='new'){
      /* ① 新建我的卡槽：用临时卡槽的颜色建一个，并直接载入它 */
      const nm='我的色板 '+(S.myRacks.length+1);
      S.myRacks.push({name:nm,colors:S.tmp.slice()});
      S.kind='my'; S.myIdx=S.myRacks.length-1; S.rackSel=0;
      flush();
      save(); syncColorUI(); closeLib();
      toast('已新建「'+nm+'」并载入\n'+n+' 色已经在里面了');
    }else{
      /* ② 直接载入当前卡槽：写进正在用的那个（系统卡槽只读，挡掉） */
      if(isSys()){ toast('系统卡槽只读，加不进去'); return; }
      const r=S.myRacks[S.myIdx]; if(!r) return;
      r.colors=S.tmp.slice(); S.rackSel=0;
      flush();
      save(); syncColorUI();
      toast('已载入当前卡槽「'+r.name+'」\n'+n+' 色');
    }
  }));

  /* ---------- 启动：把上次的样子摆回去 ----------
     【为什么不在加载时直接干】本机存档是 main.js 里 load() 读完的，
     本文件排在它前面（脚本顺序就这样）。加载时 S.pop 还是默认值 false，
     这时候摆等于白摆。所以导出一个函数，等 load() 之后由 main.js 喊一声。 */
  drawTmp(); paintFloat();
  window.pfRestore=function(){
    const bh=$('#btnHSV'), bm=$('#btnMix');
    if(S.pop&&S.pop.hsvBar && bh){ bh.classList.add('on'); setFloat('hsvBar',true); }
    if(S.pop&&S.pop.mixBar && bm){ bm.classList.add('on'); setFloat('mixBar',true); }
    settle();
  };
  /* 画布区一动大小（面板开合会连带它变宽变窄），顺手把窗摆回合法位置 */
  window.addEventListener('resize',()=>{
    /* 换朝向 / 键盘弹出后，把窗拉回可视范围里，别跑到屏幕外找不着 */
    const b=bodyEl().getBoundingClientRect();
    FLOATS.forEach(id=>{
      const fl=F(id); if(!fl||!fl.classList.contains('on')) return;
      const p=clearOfPanel(fl,clampL(fl,parseFloat(fl.style.left)||0),
                              Math.max(PAD,Math.min(b.height-fl.offsetHeight-PAD,parseFloat(fl.style.top)||0)));
      fl.style.left=p.l+'px'; fl.style.top=p.t+'px';
    });
    remember(); layout();
  });
  /* #cvwrap 的尺寸变化（调色板开合就会带它一把），也认 —— window.resize 不管这种 */
  if('ResizeObserver' in window) new ResizeObserver(()=>settle()).observe($('#cvwrap'));
})();
