/* ==========================================================
   menu.js  —— 「⋯」菜单：一级列表 + 二级页

   为什么改成二级：
     以前是把「画布 / 导出 / 工作区 / 其他 / 帮助」全都平铺在一张长 sheet 里，
     从上往下划半天。既然装成 App 了，就该像系统设置那样 —— 一级只看一行推进一步。
     二级藏得深看不见状态的毛病，用每行右边的副标题补回来（当前画布尺寸、
     当前工作区名、版本号），一眼能扫到，不用点进去。

   二级页怎么切：
     【同一张 #sheet 里换内容】，不新开浮层。
     ui.js 的 openSheet() 每次都会重写 #sheet.innerHTML（右上角的「关闭」
     也是它重新生成的），所以二级页 = 再调一次 openSheet(另一段 html)。
     #mask 不关 → 背景、点遮罩关闭、安卓返回键全都是白拿的。
     唯一要注意：内容被整个换掉了，每个页面的事件必须在换完之后重新绑
     （export.js 的 bindExportSection 早就是这么干的）。
   ========================================================== */
(function(){
  /* 一级行的图标。24×24 实心路径，跟工具栏那套一个路子 */
  var ICON = {
    canvas:'<svg viewBox="0 0 24 24"><path d="M3 4h18v16H3V4zm2 2v12h14V6H5z"/>'+
           '<path d="M7 8h4v4H7V8zm6 0h4v4h-4V8zM7 14h4v2H7v-2zm6 0h4v2h-4v-2z" opacity=".55"/></svg>',
    exp   :'<svg viewBox="0 0 24 24"><path d="M12 15l-5-5h3V4h4v6h3l-5 5z"/>'+
           '<path d="M4 19h16v2H4z"/></svg>',
    ws    :'<svg viewBox="0 0 24 24"><path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6z"/>'+
           '<path d="M3 10h18" opacity=".45"/></svg>',
    set   :'<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm8.3 3.5'+
           'l-1.8-.5a7.7 7.7 0 00-.6-1.5l1-1.5-1.6-1.6-1.5 1a7.7 7.7 0 00-1.5-.6L13.8 5h-2.3'+
           'l-.5 1.8a7.7 7.7 0 00-1.5.6l-1.5-1-1.6 1.6 1 1.5a7.7 7.7 0 00-.6 1.5L4.2 12v2.3'+
           'l1.8.5c.1.5.4 1 .6 1.5l-1 1.5 1.6 1.6 1.5-1c.5.2.9.4 1.5.6l.5 1.8h2.3l.5-1.8'+
           'c.5-.1 1-.3 1.5-.6l1.5 1 1.6-1.6-1-1.5c.2-.5.4-1 .6-1.5z"/></svg>',
    help  :'<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1.1 15h-2.2v-2.2h2.2V17z'+
           'm1.6-7.4l-.9.9c-.6.6-.9 1.1-.9 2.2h-2v-.4c0-.9.3-1.7 1-2.3l1.2-1.2c.4-.4.6-.9.6-1.4'+
           'a2.1 2.1 0 00-4.2 0H8a4.2 4.2 0 018.4 0c0 1-.4 2-1.7 3z"/></svg>'
  };

  /* ---------- 一级行 ---------- */
  var ORDER = ['canvas','exp','ws','set','help'];

  var PAGES = {
    canvas:{ t:'画布', i:ICON.canvas,
             sub:function(){ return S.w+' × '+S.h; },
             html:canvasHTML, bind:canvasBind },
    exp   :{ t:'导出', i:ICON.exp,
             sub:function(){ return 'PNG / GIF / ZIP'; },
             html:function(){ return buildExportSection(); },
             bind:function(){ bindExportSection(); } },
    ws    :{ t:'工作区', i:ICON.ws,
             sub:function(){ return wsCurrent || '（无）'; },
             html:function(){ return buildWorkspaceSection(); },
             bind:function(){ bindWorkspaceSection(); } },
    set   :{ t:'设置', i:ICON.set,
             sub:function(){
               return PP.verOf() + (window.PPUpdate && PPUpdate.has ? ' · 有新版本' : '');
             },
             html:function(){ return window.PPSetPage ? PPSetPage() : '<div class="tip">设置页没加载</div>'; },
             bind:function(){ if(window.PPSetBind) PPSetBind(); } },
    /* 帮助不设二级页 —— 它本来就是一个全屏面板（自带关闭、返回键也认），
       再套一层纯属多余。 */
    help  :{ t:'帮助', i:ICON.help, sub:function(){ return '说明书'; } }
  };

  /* 返回栈：['home'] 或 ['home','canvas']。每次打开菜单都回到一级。 */
  var stack = ['home'];

  function upAvailable(){ return !!(window.PPUpdate && PPUpdate.has); }

  function rowHTML(k){
    var p = PAGES[k], up = (k==='set' && upAvailable());
    return '<button class="mrow'+(up?' hasup':'')+'" data-go="'+k+'">'
         +   '<span class="mi">'+p.i+'</span>'
         +   '<span class="mt"><b>'+p.t+'</b>'
         +     (p.sub ? '<em>'+esc(p.sub())+'</em>' : '')
         +   '</span>'
         +   '<span class="mdot"></span><span class="ma">›</span>'
         + '</button>';
  }

  function homeHTML(){
    stack = ['home'];
    openSheet('<h3>菜单</h3>'
            + '<div class="mlist">'+ORDER.map(rowHTML).join('')+'</div>');
    var sh = $('#sheet');
    sh.querySelectorAll('[data-go]').forEach(function(b){
      b.onclick = function(){ go(b.dataset.go); };
    });
    sh.scrollTop = 0;
  }

  function pageHTML(k){
    var p = PAGES[k];
    openSheet('<div class="mhead"><button class="mback" id="mb">‹</button><b>'+esc(p.t)+'</b></div>'
            + p.html());
    var mb = $('#mb'); if(mb) mb.onclick = back;
    if(p.bind) p.bind();
    $('#sheet').scrollTop = 0;
  }

  function go(k){
    if(k === 'help'){ closeSheet(); openHelp(); return; }
    if(stack[stack.length-1] !== k) stack.push(k);
    pageHTML(k);
  }
  function back(){
    if(stack.length > 1){
      stack.pop();
      var t = stack[stack.length-1];
      if(t === 'home') homeHTML(); else pageHTML(t);
    }else closeSheet();
  }

  /* ---------- 打开菜单 ---------- */
  window.openMenu = function(){ stack = ['home']; homeHTML(); };

  /* 重绘当前页（不清空返回栈）。
     export.js 里切 GIF / APNG、切 A·B 模式之后要刷新选中态，走的就是这个 ——
     直接调 openMenu() 会一路跳回一级，点一下格式就弹回主列表，很难受。 */
  window.refreshMenu = function(){
    var m = $('#mask');
    if(!m || m.classList.contains('hidden')){ window.openMenu(); return; }
    var t = stack[stack.length-1];
    if(t === 'home' || !t) homeHTML(); else pageHTML(t);
  };

  /* ★ 必须重新绑 onclick：ui.js 里那句 onclick=openMenu 抓的是【旧的函数对象】，
       光改 window.openMenu 对已经绑好的按钮不起作用。 */
  $('#btnMenu').onclick = function(){ window.openMenu(); };

  /* ---------- 画布页 ---------- */
  function canvasHTML(){
    return '<section class="sec">'
      +  '<div class="pt">创建新画布（会清空当前画面）</div>'
      +  '<div class="sizes">'+SIZE_PRESETS.map(function(s){
           return '<button data-new="'+s+'" class="'+((s===S.w&&s===S.h)?'on':'')+'">'+s+'</button>';
         }).join('')+'</div>'
      +  '<div class="custom">'
      +    '<input id="inW" type="number" inputmode="numeric" value="'+S.w+'" min="1" max="512">'
      +    '<span class="x">×</span>'
      +    '<input id="inH" type="number" inputmode="numeric" value="'+S.h+'" min="1" max="512">'
      +    '<button id="btnNew">创建</button>'
      +  '</div>'
      + '</section>'
      + '<section class="sec">'
      +  '<div class="pt">调整当前画布大小</div>'
      +  '<div class="cur">'
      +    '<span class="n">现在 <b id="curn">'+S.w+' × '+S.h+'</b></span>'
      +    '<button id="btnAdjust">'
      +      '<svg viewBox="0 0 24 24"><path d="M3 3h6v2H5v4H3V3zm18 0v6h-2V5h-4V3h6zM3 15h2v4h4v2H3v-6zm18 6h-6v-2h4v-4h2v6z"/></svg>'
      +      '调整大小'
      +    '</button>'
      +  '</div>'
      + '</section>'
      + '<section class="sec">'
      +  '<button class="btnw danger" id="clr">清空当前图层</button>'
      + '</section>';
  }
  function canvasBind(){
    var sh = $('#sheet'); if(!sh) return;
    sh.querySelectorAll('[data-new]').forEach(function(b){
      b.onclick = function(){
        var s = +b.dataset.new;
        if(confirm('新建 '+s+'×'+s+' 画布？当前画面会清空。')){
          newDoc(s,s); closeSheet(); toast('已新建 '+s+'×'+s);
        }
      };
    });
    var bn = $('#btnNew');
    if(bn) bn.onclick = function(){
      var w = clamp(Math.round(+$('#inW').value) || 32, 1, 512);
      var h = clamp(Math.round(+$('#inH').value) || 32, 1, 512);
      if(confirm('新建 '+w+'×'+h+' 画布？当前画面会清空。')){
        newDoc(w,h); closeSheet(); toast('已新建 '+w+'×'+h);
      }
    };
    var ba = $('#btnAdjust'); if(ba) ba.onclick = function(){ enterAdjust(); };
    /* 【图层化之后这里只清当前层】—— 一层层清是有意的设计：
       多层的时候「一键清空」会把别的层一起抹掉，太危险。想全清就一层层来。 */
    var cl = $('#clr');
    if(cl) cl.onclick = function(){
      if(lyWriteGuard()) return;
      if(confirm('确定清空「'+curLayer().name+'」？还能撤销回来。')){
        S.pixels.fill(0); flatDirty = true;
        pushHistory(); renderLayers(); render(); save(); closeSheet();
      }
    };
  }

  /* ---------- 安卓返回键钩子 ----------
     由 native.js 的 closeTop() 在最开头调用。
       返回 true  = 这次返回被我吃掉了（二级页退回一级）
       返回 false = 不归我管，继续走 native.js 后面那串（关掉菜单 / 双击退出）
     钩子外面有 typeof 守卫 + try/catch，所以这个文件没加载时也完全没副作用。 */
  window.__ppBackHook = function(){
    var m = $('#mask');
    if(!m || m.classList.contains('hidden')) return false;   /* 菜单没开，不关我事 */
    if(stack.length > 1){ back(); return true; }             /* 二级 → 退回一级 */
    return false;                                            /* 一级 → 交给 native 关掉 */
  };

  window.PPMenu = {
    go:go, back:back,
    depth:function(){ return stack.length; },
    /* 更新器发现新版本后调一下，把红点点上（如果菜单此刻正开着就连页面一起重画） */
    refresh:function(){
      var bm = $('#btnMenu'); if(bm) bm.classList.toggle('hasup', upAvailable());
      var m = $('#mask');
      if(m && !m.classList.contains('hidden')) refreshMenu();
    }
  };
})();
