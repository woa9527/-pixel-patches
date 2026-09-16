/* ==========================================================
   native.js —— Android 打包（Capacitor）适配层
   在浏览器里这个文件等于不存在：isNative 为假，一行都不执行。
   只有打进 APK 后才顶上来，处理 WebView 跟浏览器不一样的三件事：
     ① 导出 / 下载：WebView 不认 <a download>，点了没反应。
        改成「写缓存文件 → 调系统分享面板」，可存相册、发微信、传电脑。
     ② 返回键：先关掉当前浮层；没有浮层时连按两次才退出，
        省得画到一半手指一碰就全没了。
     ③ 连点抖动：安卓 WebView 上有概率把一次点击报成两次。
   ========================================================== */
(function(){
  function cap(){ return window.Capacitor || null; }
  function native(){
    var c=cap();
    return !!(c && typeof c.isNativePlatform==='function' && c.isNativePlatform());
  }
  /* 插件要现取：capacitor.js 是打包时注入的，可能比本文件晚加载 */
  function plugin(n){
    var c=cap();
    try{ return (c && c.Plugins) ? (c.Plugins[n]||null) : null; }catch(e){ return null; }
  }
  function toast(m){ try{ if(typeof window.toast==='function') window.toast(m); }catch(e){} }
  function safeName(n){
    return String(n||'export').replace(/[\\/:*?"<>|\n\r]+/g,'_').slice(0,80);
  }
  function toB64(blob){
    return new Promise(function(res,rej){
      var r=new FileReader();
      r.onload=function(){ res(String(r.result).split(',')[1]||''); };
      r.onerror=rej; r.readAsDataURL(blob);
    });
  }

  /* ---------- ① 存成文件并呼出系统分享面板 ---------- */
  async function saveAndShare(blob, name){
    var FS=plugin('Filesystem'), SH=plugin('Share');
    if(!FS){ toast('导出失败：文件插件没装上'); return; }
    var path=safeName(name);
    try{
      try{ await FS.deleteFile({path:path, directory:'CACHE'}); }catch(e){}   /* 清掉同名旧文件 */
      await FS.writeFile({path:path, data:await toB64(blob), directory:'CACHE'});
      var u=await FS.getUri({path:path, directory:'CACHE'});
      /* 安卓上只有 share()，没有 shareFiles()：文件以 uri 字符串数组传进去，
         系统会按扩展名认类型（png / gif / zip），面板里就能存相册、发微信 */
      if(SH && SH.share){
        await SH.share({files:[u.uri], title:path, dialogTitle:'保存到相册或发给朋友'});
      }else{
        toast('已保存到：'+u.uri);
      }
    }catch(e){
      /* 用户在分享面板里按了返回，插件会抛 cancel —— 这不是错误，别吓唬人 */
      var m=String((e&&e.message)||e||'');
      if(/cancel/i.test(m)) return;
      toast('导出失败：'+m);
    }
  }

  /* 拦下所有带 download 的链接：export.js 的三个导出按钮、
     工作区 ZIP、以及 downloadBlob() 内部临时造的那个 <a>，全走这里 */
  document.addEventListener('click', function(e){
    if(!native()) return;
    var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
    if(!a) return;
    var href=a.getAttribute('href');
    if(!href) return;
    e.preventDefault();
    try{ e.stopImmediatePropagation(); }catch(err){}
    var name=a.getAttribute('download')||'export.png';
    toast('正在导出…');
    fetch(href).then(function(r){ return r.blob(); })
      .then(function(b){ return saveAndShare(b,name); })
      .catch(function(err){ toast('导出失败：'+((err&&err.message)||err)); });
  }, true);

  /* ---------- ② 返回键：先关浮层，再按一次才退出 ---------- */
  function closeTop(){
    /* 【动态浮层钩子】菜单的二级页之类的东西自己决定要不要吃掉这次返回。
         返回 true  = 我已经处理了（比如二级页退回一级）
         返回 false = 不归我管，继续走下面那一串老逻辑
       加 typeof 守卫是为了让这个钩子「不在」的时候（老版本、文件没加载上）
       行为跟以前一模一样；try/catch 是为了菜单代码万一抛错，
       最坏退化成「一次关掉整个菜单」，绝不会把返回键弄失灵。 */
    if(typeof window.__ppBackHook === 'function'){
      try{ if(window.__ppBackHook()) return true; }catch(e){}
    }
    var q=function(s){ return document.querySelector(s); };
    var hasOn=function(s){ var e=q(s); return (e && e.classList.contains('on')) ? e : null; };
    var e;
    var mask=q('#mask');
    if(mask && !mask.classList.contains('hidden')){          /* 底部菜单 sheet */
      mask.classList.add('hidden');
      var sh=q('#sheet'); if(sh) sh.innerHTML='';
      return true;
    }
    if((e=hasOn('#shLib'))){ e.classList.remove('on');
      var lm=q('#libMask'); if(lm) lm.classList.remove('on'); return true; }   /* 配色库 */
    if((e=hasOn('#dlgAdd'))){ e.classList.remove('on');
      var dm=q('#dlgMask'); if(dm) dm.classList.remove('on'); return true; }   /* 加入卡槽 */
    if((e=hasOn('#helppanel'))){ e.classList.remove('on'); return true; }      /* 帮助 */
    if((e=hasOn('#newRow'))){ e.classList.remove('on'); return true; }         /* 新建画布输入行 */
    if((e=hasOn('#pin'))){ e.classList.remove('on'); return true; }            /* 吸附色块 */
    return false;
  }

  var lastBack=0, backBound=false;
  function bindBack(){
    if(backBound) return;
    var App=plugin('App');
    if(!App || !App.addListener) return;
    backBound=true;
    App.addListener('backButton', function(){
      if(closeTop()) return;
      var now=Date.now();
      if(now-lastBack<2000){ App.exitApp(); return; }
      lastBack=now;
      toast('再按一次退出');
    });
  }

  /* capacitor.js 可能比本文件晚注入，多试几次；绑定成功后就不再重复 */
  function boot(){ if(!native()) return; bindBack(); }
  [0,300,1200,3000].forEach(function(t){ setTimeout(boot,t); });

  window.Native={ isNative:native, share:saveAndShare, closeTop:closeTop };
})();
