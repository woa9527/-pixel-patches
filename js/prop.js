/* ==========================================================
   prop.js  —— 属性面板内容（每个工具的参数）
   ========================================================== */
/* ---------- 属性面板 ---------- */
function chipsRow(items,cur,key){
  return `<div class="chips">${items.map(v=>{
    const val=v[0], lab=v[1]===undefined?v[0]:v[1];
    return `<span class="${val==cur?'on':''}" data-k="${key}" data-v="${val}">${lab}</span>`;
  }).join('')}</div>`;
}
function swRow(on,label,key){
  return `<div class="sw ${on?'on':''}" data-k="${key}"><span class="box"></span>${label}</div>`;
}
/* 动作按钮 —— 跟上面的开关（swRow）完全是两回事：
   开关点一下是「勾上 / 取消」，状态留在那儿；按钮点一下是「干一件事」，没有勾。
   以前「适应屏幕」「居中画布」拿开关的样子顶着，前面还带个空方框，
   看着就跟能勾似的，其实它们是按钮。现在给它们自己的样子。 */
function actRow(act,label){
  return `<div class="act" data-act="${act}">${label}</div>`;
}
/* 曲线「怎么用」的整页说明。分画法写 ——
   两种画法的步骤数不一样（简单 3 步自动落定，自由 4 步要点完成），
   混在一起讲谁都看不明白。 */
function curveHelpHTML(){
  return `
    <h3>曲线怎么用</h3>
    <section class="sec">
      <div class="pt">简单（只能往一边弯）</div>
      <div class="tip">
        ① 按住，拖出一条直线，松手<br>
        ② <b>再拖一下</b>，把这条线掰弯<br>
        ③ 松手就画好了，不用点完成
      </div>
    </section>
    <section class="sec">
      <div class="pt">自由（能掰出 S 形）</div>
      <div class="tip">
        ① 按住，拖出一条直线，松手<br>
        ② 这条线上<b>自动打上 5 个点</b><br>
        ③ 按住蓝色小方块往外拉：拉中间出 C 形，
           两个四分点往<b>相反</b>方向拉就出 S 形<br>
        ④ 掰好了点底下的 <b>完成</b><br>
        <b>就这 5 个点，不能再加</b> —— 能随便加的话，点越拖越多，线也越拖越乱
      </div>
    </section>
    <section class="sec">
      <div class="pt">粗细和颜色</div>
      <div class="tip">跟别的工具一个规矩：<b>粗细</b>用这里的「粗细」，<b>颜色</b>就是当前色。</div>
    </section>`;
}
function buildProp(){
  const t=TOOLS.find(t=>t[0]===S.tool);
  $('#propTitle').textContent=t?t[1]:'';
  const P=$('#propBody'); let h='';
  const sizeRow=(key,cur)=>`<div class="pt">笔刷大小</div>`+chipsRow([1,2,3,4,6,8].map(v=>[v]),cur,key);
  switch(S.tool){
    case 'pencil':
      h=sizeRow('size',S.size)+`<div class="pt mt">选项</div>`
        +swRow(S.symmetry,'左右对称','symmetry');
      break;
    case 'eraser':
      h=sizeRow('size',S.size);
      break;
    case 'spray':
      h=`<div class="pt">喷幅</div>`+chipsRow([2,4,6,10].map(v=>[v]),S.sprayR,'sprayR')
        +`<div class="pt mt">密度</div>`+chipsRow([[1,'疏'],[2,'中'],[4,'密']],S.sprayD,'sprayD');
      break;
    case 'line':
      h=`<div class="pt">粗细</div>`+chipsRow([1,2,3].map(v=>[v]),S.size,'size')
        +`<div class="pt mt">选项</div>`+swRow(S.symmetry,'左右对称','symmetry');
      break;
    case 'curve':
      /* 两种画法共用一个工具 —— 都是「画曲线」，只是掰弯的方式不同，占两个按钮没道理。
         粗细跟直线一样走笔刷大小，颜色就是当前色，跟别的工具一个规矩。 */
      h=`<div class="pt">画法</div>`+chipsRow([['simple','简单'],['free','自由']],S.curveMode,'curveMode')
        +`<div class="pt mt">粗细</div>`+chipsRow([1,2,3].map(v=>[v]),S.size,'size')
        +actRow('curveHelp','怎么用');
      break;
    case 'rect': case 'ellipse':
      /* 两个独立开关，能各自勾、也能一起勾：
         填充 = 中间填当前色（不勾 → 空心，只剩一圈轮廓）
         描边 = 在外面多包一圈纯黑（不占形状自己那一圈） */
      h=`<div class="pt">画法</div>`
        +swRow(S.shapeFill,'填充','shapeFill')
        +swRow(S.shapeRing,'描边（外围黑）','shapeRing');
      break;
    case 'fill':
      h=`<div class="pt">填充范围</div>`
        +swRow(S.replScope==='all','整片连续区域','replScope:all')
        +swRow(S.replScope==='sel','整个选区','replScope:sel');
      break;
    case 'select':
      /* 「全选画布」删了 —— 全选之后能干的两件事（整幅填充 / 整幅删除）
         都有别的路走：填充切到「整个选区」，或者直接清空画布。专门留个按钮多余。 */
      h=`<div class="pt">选区形状</div>`+chipsRow([['rect','矩形'],['ellipse','椭圆'],['magic','魔棒']],S.selShape,'selShape')
        +`<div class="pt mt">模式</div>`+chipsRow([['new','新建'],['add','加上'],['sub','减去']],S.selMode,'selMode');
      break;
    case 'move':
      /* 不用选「移什么」：先用选区框好 → 搬的就是选区里的；没选区 → 整幅一起搬 */
      h=`<div class="pt">用法</div><div class="tip">${
        sel?'现在有选区 → 搬的是<b>选区里的东西</b>。'
           :'现在没选区 → <b>整幅画面一起搬</b>。先用选区框好，再搬就只动框里的。'
      }</div>`;
      break;
    case 'outline':
      /* 描边现在只认选区：框住哪个，就只给哪个加黑边。颜色固定纯黑，不用选色。 */
      h=`<div class="pt">粗细</div>`+chipsRow([1,2].map(v=>[v]),S.outlineW,'outlineW')
        +`<div class="pt mt">位置</div>`
        +swRow(S.outlineSide==='out','外侧','outlineSide:out')
        +swRow(S.outlineSide==='in','内侧','outlineSide:in')
        +`<div class="pt mt">用法</div><div class="tip">${
          sel?'先用选区框住要描边的那一个，再点画面 —— <b>只给框里的加黑边</b>（固定纯黑）。'
             :'<b>当前没有选区</b>：先用选区框住要描边的东西，这个工具才亮。'
        }</div>`;
      break;
    case 'zoom':
      /* 「适应屏幕 / 居中画布」原来是平移工具的，平移工具删了就挪到这儿 ——
         它俩是看图的动作，跟缩放是一伙的 */
      h=`<div class="pt">缩放</div>`
        +`<div class="chips"><span data-act="zoomOut">－</span><span data-act="zoomFit">适应</span><span data-act="zoomIn">＋</span></div>`
        +`<div class="pt mt">视图</div>`
        +swRow(S.grid,'显示像素网格','grid')
        +actRow('zoomFit','适应屏幕')
        +actRow('center','居中画布');
      break;
    case 'picker':
      h=`<div class="pt">用法</div><div class="tip">点画面任意像素，取它的颜色作为当前色。</div>`;
      break;
  }
  P.innerHTML=h;
  P.querySelectorAll('[data-k]').forEach(el=>{
    el.onclick=()=>{
      const k=el.dataset.k, v=el.dataset.v;
      if(k.indexOf(':')>0){
        const p=k.split(':'), key=p[0], val=p[1];
        if(typeof S[key]==='boolean') S[key]=!S[key]; else S[key]=val;
      } else if(v===undefined){
        /* 开关（swRow 生成的那一类）没有 data-v —— 以前走了下面那条分支，
           把 S[k] 写成了 undefined（假值），所以点了永远勾不上。左右对称就是这么坏的。 */
        S[k]=!S[k];
      } else {
        const num=Number(v);
        S[k]=isNaN(num)?v:num;
      }
      buildProp(); if(k==='grid') render();
    };
  });
  P.querySelectorAll('[data-act]').forEach(el=>{
    el.onclick=()=>{
      const a=el.dataset.act;
      /* 曲线的用法说明写在弹出层里 ——
         属性栏是 44px 高的一条横条，塞两三步操作说明进去会把它撑得没完没了地横向滚。 */
      if(a==='curveHelp'){ openSheet(curveHelpHTML()); return; }
      if(a==='zoomIn'){ V.scale=clamp(V.scale+1,1,48); }
      if(a==='zoomOut'){ V.scale=clamp(V.scale-1,1,48); }
      if(a==='zoomFit'){ fitView(); }
      if(a==='center'){ V.ox=Math.round((cssW-S.w*V.scale)/2); V.oy=Math.round((cssH-S.h*V.scale)/2); }
      buildProp(); render();
      /* 按下的回执：面板刚重建过，要在新的那个按钮上亮一下再退（0.24 秒）。
         现在还没加音效，颜色变化是唯一能告诉你「按到了」的东西。 */
      P.querySelectorAll('.act[data-act="'+a+'"]').forEach(n=>{
        n.classList.add('hit'); setTimeout(()=>n.classList.remove('hit'),240);
      });
    };
  });
}
