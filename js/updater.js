/* ==========================================================
   updater.js  —— 在线热更新：检查 / 预热 / 生效 / 回滚

   怎么更新的（原理见 index.html 里那段 BOOT）：
     App 里的资源本来都是从本机装的（基座 = '.'）。
     这个东西做的就是把基座的土地换到 CDN 上，再 location.reload() ——
     BOOT 一看 localStorage['pp.base'] 有值，就改从 CDN 装整套 css/js。
     连「重启 App」都不用，reload 一下就是新版本。

   三条纪律（更新做得烦人就没人用了）：
     ① 静默检查只在后台悄悄跑：6 小时内不重复联网、失败一句话不说、6 秒超时。
     ② 有更新也不弹窗：只给顶栏「⋯」和菜单里的「设置」行加个小红点。
        用户不主动进设置，就完全不会被打扰。
     ③ 唯一的「动口」时机是用户自己点了检查更新 / 立即更新。

   为什么不一边 Clinch 下载一边换：
     预热能做到的「原子性」—— 全部文件 200 才写 pp.base。
     写之前挂掉，磁盘上一个字节都没改，App 还是原样。
     写之后如果 CDN 又出问题了，那是 BOOT 的兜底在管（见 index.html 的 fail()）。
   ========================================================== */
(function(){
  var REPO  = 'https://cdn.jsdelivr.net/gh/woa9527/-pixel-patches@main';
  var T_CHK = 6000;                    /* 检查 patch.json 的超时 */
  var T_FILE= 10000;                   /* 预热单个文件的超时 */
  var GAP   = 6*3600*1000;             /* 静默检查的最小间隔：6 小时 */

  var st = { found:null, checking:false, busy:false };

  function LS(k,v){
    try{ if(arguments.length>1){ if(v==null) localStorage.removeItem(k);
                                 else localStorage.setItem(k,v); }
         return localStorage.getItem(k); }catch(e){ return null; }
  }
  function SS(k,v){
    try{ if(arguments.length>1){ if(v==null) sessionStorage.removeItem(k);
                                 else sessionStorage.setItem(k,v); }
         return sessionStorage.getItem(k); }catch(e){ return null; }
  }

  /* 版本号比较：'1.2' < '1.2.1' < '1.10'。按点分段比数字，不是字符串比。 */
  function cmp(a,b){
    var x = String(a==null?'':a).split('.').map(Number);
    var y = String(b==null?'':b).split('.').map(Number);
    var i, d;
    for(i=0;i<Math.max(x.length,y.length);i++){
      d = (isNaN(x[i])?0:x[i]) - (isNaN(y[i])?0:y[i]);
      if(d) return d>0 ? 1 : -1;
    }
    return 0;
  }
  function curVer(){ return LS('pp.ver') || (window.PP ? PP.ver : '1.2'); }

  function withTO(p, ms, tag){
    return Promise.race([
      p,
      new Promise(function(_,rej){ setTimeout(function(){ rej(new Error(tag||'超时')); }, ms); })
    ]);
  }
  /* 并发 n 个跑完 arr，出错即整体失败（Promise.all 的语义就够用了） */
  function pump(arr, n, fn){
    var i = 0;
    function next(){
      return i>=arr.length ? Promise.resolve() : Promise.resolve().then(function(){
        return fn(arr[i++]);
      }).then(next);
    }
    var ws = [], k;
    for(k=0;k<Math.min(n,arr.length);k++) ws.push(next());
    return Promise.all(ws);
  }

  /* ---------- 检查 ---------- */
  function check(manual){
    if(st.checking) return Promise.resolve(null);
    st.checking = true;
    return withTO(
      /* 那个 ?_= 是必须的：jsDelivr 会按 @main 分支缓存最长 12 小时，
         不带上时间戳的话，补丁传上去了，App 这边还在读 12 小时前的旧 patch.json。 */
      fetch(REPO + '/patch.json?_=' + Date.now(), {cache:'no-store'})
        .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }),
      T_CHK, '检查超时'
    ).then(function(j){
      st.checking = false;
      if(!j || !j.ver) throw new Error('patch.json 格式不对');

      /* 内置版本太老，这个补丁是给更高版本写的 —— 装了会炸，直接当没看见 */
      if(j.minVer && cmp((window.PP?PP.ver:'1.2'), j.minVer) < 0){
        st.found = null; save(); markUI(); return null;
      }
      /* 这版补丁以前崩过（BOOT 兜底记的），别再自动装。
         用户手动点还是会装 —— 万一那次只是网络抖一下呢。 */
      if(LS('pp.badVer') === String(j.ver) && !manual && !j.force){
        st.found = null; save(); markUI(); return null;
      }
      st.found = (cmp(j.ver, curVer()) > 0) ? j : null;
      save(); markUI();
      return st.found;
    }).catch(function(e){
      st.checking = false;
      if(manual) toast('检查失败：'+((e && e.message) || e));
      return null;
    });
  }
  function save(){
    try{ LS('pp.found', st.found ? JSON.stringify(st.found) : null); }catch(e){}
  }

  /* ---------- 红点（唯一的外部提示）---------- */
  function markUI(){
    var on = !!st.found;
    var bm = $('#btnMenu');
    if(bm) bm.classList.toggle('hasup', on);
    /* 菜单此刻正开着的话，顺便把「设置」那行重画一下（副标题会变成「· 有新版本」） */
    if(window.PPMenu && PPMenu.refresh) PPMenu.refresh();
  }

  /* ---------- 应用 ---------- */
  function apply(){
    var j = st.found;
    if(!j || st.busy) return;
    st.busy = true;

    var base = String(j.base || REPO).replace(/\/+$/,'');
    var v    = String(j.ver);
    var list = (Array.isArray(j.files) && j.files.length) ? j.files : null;
    if(!list){ toast('补丁里没写文件清单，不敢装'); st.busy = false; return; }

    var done = 0, N = list.length;
    bar(true, 0, N);
    busyBtn(true);

    /* 预热：把每个文件都 fetch 一遍塞进 HTTP 缓存。
       全部成功后才动 localStorage —— 写之前失败 = 一个字都没改，天然无副作用。
       写之后 reload 时这些文件大多已经在缓存里了，窗口从几十秒缩到一两秒。 */
    pump(list, 3, function(p){
      return withTO(
        fetch(base + '/' + p + '?v=' + encodeURIComponent(v))
          .then(function(r){ if(!r.ok) throw new Error(p+' '+r.status); return r.text(); })
          .then(function(t){
            if(!t || t.length < 2) throw new Error(p+' 内容是空的');
            done++; bar(true, done, N);
          }),
        T_FILE, p+' 超时');
    }).then(function(){
      LS('pp.base',  base);
      LS('pp.ver',   v);
      LS('pp.files', JSON.stringify(list));
      LS('pp.badVer', null);
      /* 清掉兜底标记：新基座自己也留一次「本机也起不来」的判断机会，
         不然一旦 false-positive 会被直接判死，看不到重试按钮。 */
      SS('pp.fallbackTried', null);
      toast('更新完成，正在重启…');
      setTimeout(function(){ location.reload(); }, 400);
    }).catch(function(e){
      st.busy = false; bar(false,0,0); busyBtn(false);
      toast('更新失败：'+((e && e.message) || e)+'（当前版本没动）');
    });
  }

  function bar(on, done, total){
    var b = $('#uppbar'); if(!b) return;
    b.classList.toggle('on', !!on);
    var i = b.querySelector('i');
    if(i) i.style.width = total ? Math.round(done/total*100)+'%' : '0%';
  }
  function busyBtn(on){
    var g = $('#uppgo'); if(!g) return;
    g.textContent = on ? '正在安装…' : '立即更新';
    g.disabled = !!on;
  }

  /* ---------- 设置页里那块卡片 ---------- */
  function mount(slot){
    if(!slot) return;
    if(st.found){
      var j = st.found;
      slot.innerHTML =
        '<div class="upcard">'
        + '<b>发现新版本 '+esc(j.ver)+(j.title ? ' · '+esc(j.title) : '')+'</b>'
        + '<div class="ds">'+esc(j.desc || j.title || '')+'</div>'
        + '<button class="btnw" id="uppgo">立即更新'
        +   (j.size ? '（约 '+Math.round(j.size/1024)+' KB）' : '')
        + '</button>'
        + '<div class="bar" id="uppbar"><i></i></div>'
        + '</div>';
      var g = $('#uppgo'); if(g) g.onclick = apply;
    }else{
      slot.innerHTML =
        '<div class="setrow">'
        + '<div class="st"><b>检查更新</b><small>当前 '+esc(PP.verOf())
        +   '（'+(PP.cdn ? '在线' : '内置')+'）</small></div>'
        + '<button class="tg" id="uppchk"></button>'
        + '</div>';
      var c = $('#uppchk');
      if(c) c.onclick = function(){
        toast('正在检查…');
        check(true).then(function(j){
          if(j) toast('发现新版本 '+j.ver);
          else if(!st.found) toast('已经是最新了');
        });
      };
    }
  }

  /* ---------- 启动时的静默检查 ----------
     延迟 2.5 秒：等 main.js 把画板铺好、让用户先看到自己的画，
     别一进来就去抢网络。 */
  setTimeout(function(){
    try{
      var s = LS('pp.found');
      if(s) st.found = JSON.parse(s);
    }catch(e){ st.found = null; }
    markUI();

    if(!window.PPSet || !PPSet.get('autoCheck')) return;
    if(Date.now() - (+LS('pp.lastChk') || 0) < GAP) return;
    check(false).then(function(){ LS('pp.lastChk', String(Date.now())); });
  }, 2500);

  window.PPUpdate = {
    get has(){ return !!st.found; },
    check:check, apply:apply, mount:mount,
    /* 回到 App 内置版本：把基座相关的三个键清掉，BOOT 下次就装机身里那套了 */
    reset:function(){
      LS('pp.base',null); LS('pp.ver',null); LS('pp.files',null); LS('pp.badVer',null);
      SS('pp.forceLocal',null); SS('pp.fallbackTried',null);
      location.reload();
    }
  };
})();
