/* ==========================================================
   workspace.js  —— 工作区（应用内，IndexedDB）
   一个工作区 = 一个项目：存着当前画布 + 一堆导出文件（static/、anim/ 两栏）。
   安卓网页版没法在手机里建真正的文件夹，所以用浏览器内置数据库顶上；
   打包成 APK 后这套结构能无缝换成手机里的真文件夹。
   当前画布会随自动保存镜像进「当前工作区」；导出时文件也归档进工作区；
   「导出工作区 ZIP」把 static/、anim/ 拼成一个带文件夹结构的压缩包下载。
   当前工作区名记在 localStorage('pp.ws')，刷新不丢。
   ========================================================== */
const WS_DB='pp-ws', WS_VER=1;
let wsDb=null;
let wsCurrent = (function(){ try{ return localStorage.getItem('pp.ws')||null; }catch(e){ return null; } })();

function wsOpenDB(cb){
  if(wsDb){ cb(wsDb); return; }
  if(!('indexedDB' in window)){ cb(null); return; }
  const r=indexedDB.open(WS_DB,WS_VER);
  r.onupgradeneeded=()=>{ const db=r.result;
    if(!db.objectStoreNames.contains('docs'))    db.createObjectStore('docs',{keyPath:'name'});
    if(!db.objectStoreNames.contains('exports')) db.createObjectStore('exports',{keyPath:'name'}); };
  r.onsuccess=()=>{ wsDb=r.result; cb(wsDb); };
  r.onerror =()=>{ cb(null); };
}
/* 当前画布序列化（复用 storage.js 的 serializeDoc） */
function wsMirror(){
  if(!wsCurrent) return;
  const doc = (typeof serializeDoc==='function') ? serializeDoc() : null;
  if(!doc) return;
  wsOpenDB(db=>{ if(!db) return;
    const tx=db.transaction('docs','readwrite'); tx.objectStore('docs').put({name:wsCurrent, doc, updated:Date.now()}); });
}
/* 启动：没有工作区就建一个默认的，顺便把当前画布镜像进去 */
function wsInit(){
  if(!wsCurrent){ wsCurrent='默认工作区'; try{ localStorage.setItem('pp.ws',wsCurrent); }catch(e){} }
  wsOpenDB(db=>{ if(db && S.layers && S.layers.length) wsMirror(); });
}
/* 列表 */
function wsList(cb){
  wsOpenDB(db=>{ if(!db){ cb([]); return; }
    const req=db.transaction('docs','readonly').objectStore('docs').getAll();
    req.onsuccess=()=>{ const a=(req.result||[]).map(r=>r.name); cb(a); };
    req.onerror  =()=>{ cb([]); }; });
}
/* 创建：不开新画布，只是把当前画布收进这个新工作区当初始内容（不丢已有的活儿） */
function wsCreate(name){
  name=(name||'').trim();
  if(!name){ toast('工作区名字不能为空'); return; }
  wsCurrent=name; try{ localStorage.setItem('pp.ws',name); }catch(e){}
  wsMirror();
  if(typeof syncWsUI==='function') syncWsUI();
  toast('已创建并切换到「'+name+'」');
}
/* 打开：把工作区里存的画布读回来 */
function wsOpen(name){
  wsOpenDB(db=>{ if(!db){ toast('打不开（浏览器不支持）'); return; }
    const req=db.transaction('docs','readonly').objectStore('docs').get(name);
    req.onsuccess=()=>{ const rec=req.result;
      if(!rec||!rec.doc){ toast('「'+name+'」里没有内容'); return; }
      try{ if(typeof applyDoc==='function') applyDoc(rec.doc); }catch(e){ toast('读取失败'); return; }
      wsCurrent=name; try{ localStorage.setItem('pp.ws',name); }catch(e){}
      if(anim&&anim.open) animClose();
      renderLayers(); fitView(); render(); save();
      if(typeof syncWsUI==='function') syncWsUI();
      toast('已打开「'+name+'」');
    };
    req.onerror=()=>toast('打开失败'); });
}
/* 删除 */
function wsDelete(name){
  wsOpenDB(db=>{ if(!db) return;
    db.transaction('docs','readwrite').objectStore('docs').delete(name);
    db.transaction('exports','readwrite').objectStore('exports').delete(name);
    if(wsCurrent===name){ wsCurrent=null; try{ localStorage.removeItem('pp.ws'); }catch(e){} }
    if(typeof syncWsUI==='function') syncWsUI();
    toast('已删除「'+name+'」'); });
}
/* ---- 导出文件归档：导出的图除了下载，还存进当前工作区的 static/ 或 anim/ ---- */
function wsFilingAdd(path, data){
  if(!wsCurrent) return;
  wsOpenDB(db=>{ if(!db) return;
    const st=db.transaction('exports','readwrite').objectStore('exports');
    const req=st.get(wsCurrent);
    req.onsuccess=()=>{ const rec=req.result||{name:wsCurrent,files:[]};
      if(!rec.files) rec.files=[];
      rec.files.push({path, data});          /* data: Uint8Array */
      st.put(rec); }; });
}
/* 导出工作区 ZIP（static/、anim/ 两栏都在） */
function wsZip(cb){
  if(!wsCurrent){ cb(null); return; }
  wsOpenDB(db=>{ if(!db){ cb(null); return; }
    const req=db.transaction('exports','readonly').objectStore('exports').get(wsCurrent);
    req.onsuccess=()=>{ const rec=req.result;
      if(!rec||!rec.files||!rec.files.length){ cb(null); return; }
      const z=zipBlob(rec.files.map(f=>({name:f.path,data:f.data})));
      cb(z); };
    req.onerror=()=>cb(null); });
}
wsInit();
