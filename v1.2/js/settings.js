/* ==========================================================
   settings.js  —— 设置项存取 + 设置页

   设置值单独存在 localStorage['pp.cfg']，不混进 pp.slot ——
   那一份是画布 / 界面状态（含当前画稿），两码事：
   以后要是有个「清掉画布重来」的动作，总不能把设置也一起清了。

   三个设置的现状（2026-09 v1.2）：
     sound / haptic —— 【占位】。值能存、能关能开也记得住，但不发声、不震动，
                        发声方案还没定，代码里留了 TODO 指明以后在哪接。
     autoCheck      —— 真的在用（updater.js 读它）。
   ========================================================== */
(function(){
  var KEY = 'pp.cfg';
  var DEF = { sound:false, haptic:false, autoCheck:true };
  var cfg = null;

  function load(){
    try{ cfg = Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch(e){ cfg = Object.assign({}, DEF); }
    return cfg;
  }
  function get(k){ if(!cfg) load(); return cfg[k]; }
  function set(k,v){
    if(!cfg) load();
    cfg[k] = v;
    try{ localStorage.setItem(KEY, JSON.stringify(cfg)); }catch(e){}
    return v;
  }
  window.PPSet = { get:get, set:set, all:function(){ return load(); } };

  /* 新 APK 的下载页。改了下载站或者换域名，改这一行就行 ——
     这个 js 走热更新，改完即使不重新打包，App 里也能拿到新地址。 */
  var APK_PAGE = 'https://a76ddd0efb96b581e.app.workbuddy.host/';

  /* ---------- 一行一个开关 ---------- */
  function item(k, t, d, on, todo){
    return '<div class="setrow'+(todo?' todo':'')+'">'
         +   '<div class="st"><b>'+t+'</b><small>'+d+'</small></div>'
         +   '<button class="tg'+(on?' on':'')+(todo?' todo':'')+'" data-k="'+k+'"></button>'
         + '</div>';
  }

  /* ---------- 设置页 ---------- */
  window.PPSetPage = function(){
    var c = load();
    return '<section class="sec">'
      +  '<div class="pt">通用</div>'
      +  item('sound','音效','落笔、点工具时出声音', !!c.sound, true)
      +  item('haptic','震动','长按、吸附时的震动反馈', !!c.haptic, true)
      + '</section>'

      + '<section class="sec">'
      +  '<div class="pt">画面</div>'
      +  item('grid','网格','画布上的格子线', !!S.grid)
      +  '<button class="btnw" id="btnFit2" style="margin-top:8px">让画布适应屏幕</button>'
      + '</section>'

      + '<section class="sec">'
      +  '<div class="pt">更新</div>'
      +  item('autoCheck','启动时检查更新','只在有新版本时给个小红点，不打断你', !!c.autoCheck)
      +  '<div id="upSlot"></div>'
      + '</section>'

      + '<section class="sec">'
      +  '<div class="pt">关于</div>'
      +  '<div class="abrow"><span>版本</span><b>'+esc(PP.verOf())+'</b></div>'
      +  '<div class="abrow"><span>资源</span><b>'+(PP.cdn ? '在线（CDN）' : '内置')+'</b></div>'
      +  '<a class="btnw" href="'+APK_PAGE+'" target="_blank" rel="noopener"'
      +     ' style="margin-top:8px;text-decoration:none">下载最新安装包</a>'
      +  (PP.cdn
           ? '<button class="btnw danger" id="btnLocal" style="margin-top:8px">回到内置版本</button>'
           : '')
      + '</section>';
  };

  window.PPSetBind = function(){
    var sh = $('#sheet'); if(!sh) return;

    sh.querySelectorAll('.tg[data-k]').forEach(function(b){
      b.onclick = function(){
        var k = b.dataset.k, v = !get(k);
        set(k, v);                       /* 先把值落盘，下面再谈副作用 */
        b.classList.toggle('on', v);

        /* ===== TODO 音效（v1.3）： =====
           值已经存在 pp.cfg.sound 里了，v 为真时在这里接上发声就行：
             · 网页 / WebView：Web Audio 现场合成一段极短的 click
               （不用带音频文件，APK 不会变大，也不用往补丁仓库传素材）
             · 或者用 Capacitor 的 @capacitor-community/native-audio 预加载 assets/sfx/*.mp3
           要放声音的时机（到时候都是一行调用，别的文件不用动）：
             - js/tools.js    选工具时
             - js/pointer.js  落笔 / 抬笔
             - js/ui.js       各个按钮点击
           方案定了再补，现在这里什么都不做 —— 开关照常能开能关能记住。 */

        /* ===== TODO 震动（v1.3）： =====
           Capacitor 6 里是 Haptics 插件的 impact({style:'LIGHT'})，
           浏览器里是 navigator.vibrate(12)（安卓 WebView 支持，iOS Safari 不支持）。
           调用点同上。 */

        if(k === 'grid'){ toggleGrid(); return; }
        if(k === 'autoCheck' && v && window.PPUpdate) PPUpdate.check(true);
      };
    });

    var bf = $('#btnFit2');
    if(bf) bf.onclick = function(){ fitView(); render(); };

    var bl = $('#btnLocal');
    if(bl) bl.onclick = function(){
      if(confirm('回到 App 内置的版本？\n在线补丁会停用，以后想用再装回来就行。')) PPUpdate.reset();
    };

    if(window.PPUpdate) PPUpdate.mount($('#upSlot'));
  };
})();
