/* ==========================================================
   export.js  —— 导出 / 导入
   静态图：全部图层压成一张 PNG。
   动图 A（合成动图）：把每层当一帧，输出一个 GIF 或 APNG。
   动图 B（分图层）：每层一张 PNG，打包成 ZIP。
   导入：从相册选图 → 画布直接变成这张图（尺寸跟着图片走）。
   导出时文件还会归档进当前工作区的 static/、anim/ 两栏（见 workspace.js）。
   ========================================================== */
(function(){
  const EXP={fmt:'gif', mode:'anim'};          /* mode: 'anim'=A合成动图, 'layers'=B分图层 */

  function downloadBlob(blob,name){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  }

  /* 抓帧：每层（可见层）当一帧，单帧合成（不叠加，跟播放一致） */
  async function captureFrames(){
    const order=animList();
    if(!order.length) return [];
    const savedAt=anim.at;
    const frames=[];
    for(const idx of order){
      anim.at=idx; flatDirty=true; flatten();
      const rgba=new Uint8ClampedArray(S.img.data);
      const c=document.createElement('canvas'); c.width=S.w; c.height=S.h;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(S.img.data),S.w,S.h),0,0);
      const png=new Uint8Array(await new Promise(res=>
        c.toBlob(b=>b.arrayBuffer().then(ab=>res(new Uint8Array(ab))),'image/png')));
      frames.push({idx, name:S.layers[idx].name, w:S.w, h:S.h, rgba, png});
    }
    anim.at=savedAt; flatDirty=true; flatten(); render();
    return frames;
  }

  /* 静态图：全部可见层合一 */
  function doExportStatic(scale){
    const c=document.createElement('canvas'); c.width=S.w*scale; c.height=S.h*scale;
    const x=c.getContext('2d'); x.imageSmoothingEnabled=false;
    const tmp=document.createElement('canvas'); tmp.width=S.w; tmp.height=S.h;
    flatten(); tmp.getContext('2d').putImageData(S.img,0,0);
    x.drawImage(tmp,0,0,c.width,c.height);
    const url=c.toDataURL('image/png');
    const name=`像素涂鸦_静态_${S.w}x${S.h}_${scale}x.png`;
    const wsPath=`static/静图_${S.w}x${S.h}_${scale}x.png`;
    openSheet(`<h3>导出静态图 ${S.w*scale}×${S.h*scale}</h3>
      <img id="shot" src="${url}" alt="导出图">
      <div class="tip" style="margin:10px 0">点下面按钮保存 / 分享：手机上可存进相册、发微信，电脑上就是下载。</div>
      <a class="btn" href="${url}" download="${name}" style="display:block;text-decoration:none;line-height:22px">保存 / 分享 PNG</a>
      <div class="wtip">已归档到工作区：static/</div>`);
    c.toBlob(b=>{ if(b) b.arrayBuffer().then(ab=>wsFilingAdd(wsPath,new Uint8Array(ab))); },'image/png');
  }

  /* 动图：A 合成 / B 分图层 */
  async function doExportAnim(){
    const frames=await captureFrames();
    if(!frames.length){ toast('没有可导出的图层'); return; }
    if(EXP.mode==='anim' && frames.length<2){ toast('动图至少要两层（去图层里加一层当下一帧）'); return; }
    const fps=anim.fps||12;
    const delayCs=Math.max(2,Math.round(100/fps));     /* 百分秒 */
    if(EXP.mode==='anim'){
      let blob, ext=EXP.fmt, bytes;
      if(EXP.fmt==='gif'){ bytes=encodeGIF(frames.map(f=>({w:f.w,h:f.h,data:f.rgba})),delayCs);
                           blob=new Blob([bytes],{type:'image/gif'}); }
      else { bytes=await encodeAPNG(frames.map(f=>({w:f.w,h:f.h,rgba:f.rgba})),fps); blob=new Blob([bytes],{type:'image/png'}); }
      const dlName=`像素涂鸦_动图_${fps}fps.${ext}`;
      const wsPath=`anim/动图_${fps}fps.${ext}`;
      const url=URL.createObjectURL(blob);
      openSheet(`<h3>导出动图（${EXP.fmt.toUpperCase()} · ${fps}fps · ${frames.length}帧）</h3>
        <img id="shot" src="${url}" alt="动图">
        <div class="tip" style="margin:10px 0">${EXP.fmt==='apng'?'APNG 在浏览器/相册里会动；':'GIF 到处都能动；'}点下面按钮保存 / 分享。</div>
        <a class="btn" href="${url}" download="${dlName}" style="display:block;text-decoration:none;line-height:22px">保存 / 分享 ${EXP.fmt.toUpperCase()}</a>
        <div class="wtip">已归档到工作区：anim/</div>`);
      wsFilingAdd(wsPath, bytes);                      /* 归档（不强制再下载，预览里已有下载入口） */
    }else{ /* B · 分图层 */
      const files=frames.map((f,i)=>({name:`anim/帧${i+1}_${f.name}.png`, data:f.png}));
      const zip=zipBlob(files);
      const dlName=`像素涂鸦_分图层_${frames.length}帧.zip`;
      const wsPath=`anim/分图层_${frames.length}帧.zip`;
      const url=URL.createObjectURL(zip);
      openSheet(`<h3>导出分图层（${frames.length} 张 PNG → ZIP）</h3>
        <div class="tip" style="margin:6px 0 10px">每层导成一张 PNG，打包成一个 ZIP 下载；解压后就是 ${frames.length} 张静图。</div>
        <a class="btn" href="${url}" download="${dlName}" style="display:block;text-decoration:none;line-height:22px">保存 / 分享 ZIP（${frames.length} 张）</a>
        <div class="wtip">已归档到工作区：anim/（每层一张 + 这个 ZIP）</div>`);
      for(const f of files) wsFilingAdd(f.name,f.data);
      zip.arrayBuffer().then(ab=>wsFilingAdd(wsPath,new Uint8Array(ab)));
    }
  }

  /* ---------- 导入：相册选图 → 画布变成这张图 ---------- */
  function importImage(file){
    if(!file) return;
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      let w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
      const CAP=1024;
      if(w>CAP||h>CAP){ const s=Math.min(CAP/w,CAP/h); w=Math.max(1,Math.round(w*s)); h=Math.max(1,Math.round(h*s)); toast('图片偏大，已缩到 '+w+'×'+h); }
      S.w=w; S.h=h; off.width=w; off.height=h;
      const tmp=document.createElement('canvas'); tmp.width=w; tmp.height=h;
      tmp.getContext('2d').drawImage(img,0,0,w,h);
      const px=tmp.getContext('2d').getImageData(0,0,w,h);
      S.layers=[mkLayer('图层 1')]; S.layers[0].buf=new Uint8ClampedArray(px.data);
      S.lyCur=0;
      rebuildFlat(); history.stack=[]; history.i=-1; pushHistory();
      clearSel(); if(ptrs&&ptrs.clear) ptrs.clear();
      stroke=null; preview=null; pan=null; pinch=null; move=null;
      if(anim&&anim.open) animClose();
      renderLayers(); fitView(); render(); save();
      URL.revokeObjectURL(url);
      toast('已导入图片，画布变成 '+w+'×'+h);
    };
    img.onerror=()=>{ toast('这张图片读不出来'); URL.revokeObjectURL(url); };
    img.src=url;
  }

  /* ---------- 隐藏的相册选图 input ----------
     必须定义在 build/bindWorkspaceSection 之前：绑定函数里 imp.click()
     会引用到它，脚本是从上往下执行的。 */
  const imp=document.createElement('input'); imp.type='file'; imp.accept='image/*'; imp.style.display='none';
  document.body.appendChild(imp);
  imp.onchange=()=>{ if(imp.files&&imp.files[0]) importImage(imp.files[0]); imp.value=''; };

  /* ---------- 菜单里要塞的两块 ---------- */
  function buildExportSection(){
    return `<section class="sec">
      <div class="pt">导出 · 静态图（全部图层压成一张）</div>
      <div id="exps"></div>
    </section>
    <section class="sec">
      <div class="pt">导出 · 动图</div>
      <div class="fmt">格式
        <span class="chip ${EXP.fmt==='gif'?'on':''}" data-fmt="gif">GIF</span>
        <span class="chip ${EXP.fmt==='apng'?'on':''}" data-fmt="apng">APNG</span>
      </div>
      <div class="modes">
        <div class="sw ${EXP.mode==='anim'?'on':''}" data-mode="anim"><span class="dot"></span><div><b>A · 合成动图</b><small>输出一个 ${EXP.fmt.toUpperCase()} 动图文件</small></div></div>
        <div class="sw ${EXP.mode==='layers'?'on':''}" data-mode="layers"><span class="dot"></span><div><b>B · 分图层</b><small>每层一张 PNG，打包成 ZIP</small></div></div>
      </div>
      <button class="btnw" id="expGo" style="margin-top:8px">导出动图</button>
    </section>`;
  }
  function bindExportSection(){
    const sh=$('#sheet'); if(!sh) return;
    syncExps();
    sh.querySelectorAll('[data-fmt]').forEach(n=>n.onclick=()=>{ EXP.fmt=n.dataset.fmt; if(typeof refreshMenu==='function') refreshMenu(); });
    sh.querySelectorAll('[data-mode]').forEach(n=>n.onclick=()=>{ EXP.mode=n.dataset.mode; if(typeof refreshMenu==='function') refreshMenu(); });
    const go=$('#expGo'); if(go) go.onclick=()=>doExportAnim();
  }
  function buildWorkspaceSection(){
    return `<section class="sec">
      <div class="pt">工作区（创建 / 导入 / 打开）</div>
      <div class="wsnow">当前工作区：<b id="wsName">${wsCurrent||'（无）'}</b></div>
      <div class="row">
        <button class="chip" id="wsCreate2">＋ 创建</button>
        <button class="chip" id="wsImport">导入图片</button>
        <button class="chip" id="wsZip">导出工作区 ZIP</button>
      </div>
      <div class="wlist" id="wsList"><div class="wempty">读取中…</div></div>
      <div class="wtip">创建/打开后会自动保存进度；导出时图片归档进工作区的 static/、anim/ 两栏；「导出工作区 ZIP」把它们拼成一个带文件夹的压缩包。<br>
      <b>导入</b>：从相册选一张图 → 画布直接变成这张图（尺寸跟着图片走）。</div>
    </section>`;
  }
  function bindWorkspaceSection(){
    const sh=$('#sheet'); if(!sh) return;
    const c2=$('#wsCreate2'); if(c2) c2.onclick=()=>{ const n=prompt('给新工作区起个名字（当前画布会收进它当初始内容）：','我的工作区'); if(n!==null) wsCreate(n); };
    const im=$('#wsImport'); if(im) im.onclick=()=>imp.click();
    const z=$('#wsZip'); if(z) z.onclick=()=>{
      wsZip(b=>{ if(!b){ toast('这个工作区还没有导出过任何图'); return; }
        downloadBlob(b,(wsCurrent||'工作区')+'_导出.zip'); toast('工作区 ZIP 已导出（含 static/、anim/）'); }); };
    wsList(names=>{ const box=$('#wsList'); if(!box) return;
      if(!names||!names.length){ box.innerHTML='<div class="wempty">还没有别的工作区</div>'; return; }
      box.innerHTML=names.map(nm=>{
        const cur = nm===wsCurrent ? ' style="box-shadow:inset 0 0 0 1px var(--ac)"':'';
        return `<div class="witem"${cur}><span class="nm">${nm}</span>
          <button data-open="${encodeURIComponent(nm)}">打开</button>
          <button class="del" data-del="${encodeURIComponent(nm)}">删</button></div>`; }).join('');
      box.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>wsOpen(decodeURIComponent(b.dataset.open)));
      box.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ if(confirm('删除「'+decodeURIComponent(b.dataset.del)+'」？里面的导出文件也会没。')) wsDelete(decodeURIComponent(b.dataset.del)); });
    });
  }
  function syncWsUI(){ const nm=$('#wsName'); if(nm) nm.textContent=wsCurrent||'（无）';
    if($('#wsList') && $('#sheet')) bindWorkspaceSection(); }

  /* 给 ui.js 用 */
  window.doExportStatic=doExportStatic;
  window.doExportAnim=doExportAnim;
  window.exportPNG=doExportStatic;        /* 旧菜单「导出 PNG」仍指向静态图 */
  window.buildExportSection=buildExportSection;
  window.bindExportSection=bindExportSection;
  window.buildWorkspaceSection=buildWorkspaceSection;
  window.bindWorkspaceSection=bindWorkspaceSection;
  window.syncWsUI=syncWsUI;
})();
