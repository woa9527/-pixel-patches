/* ==========================================================
   md.js  —— 一个够用的 Markdown 渲染器（给帮助面板用）

   为什么是【外挂 help.md + 运行时读】，而不是把说明书写死在 js 里：
     以后改说明书只需要用文本编辑器改 help.md，不用碰代码、不用重新打包 App。
     （用户明确提的：以后做成 App 了，在代码里翻文档太慢，还怕手滑删错代码。）

   支持：# 标题 / 段落 / - 列表 / 1. 有序 / | 表格 | / > 引用 / --- 分隔线 /
         ``` 代码块 / `行内代码` / **粗** / *斜* / [链接](url) / ![图](url)

   【安全】全文先转义再解析，不放行任何原生 HTML ——
     帮助文档是纯文本的，没必要为它开 HTML 注入的口子。
     链接只放行 http(s) / #锚点 / 相对路径；图片只放行相对路径。
   ========================================================== */
function mdEsc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
/* 地址白名单：不在这几类里的一律退化成纯文字 */
function mdSafeUrl(u){
  return /^(https?:\/\/|#|\.?\/|[\w.-]+\.(png|jpe?g|gif|webp|svg|html?)$)/i.test(u) ? u : '';
}
/* ---------- 行内 ---------- */
function mdInline(s){
  const cs=[];
  /* 先把行内代码抠出去 —— 免得里面的 * 和 | 被当成强调 / 表格分隔符 */
  s=s.replace(/`([^`]+)`/g,(m,c)=>{ cs.push(c); return '\u0002'+(cs.length-1)+'\u0002'; });
  s=mdEsc(s);
  s=s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g,(m,t,u)=>{
      const ok=mdSafeUrl(u);
      return ok?'<img class="mdimg" src="'+ok+'" alt="'+t+'">':t;
    })
   .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(m,t,u)=>{
      const ok=mdSafeUrl(u);
      if(!ok) return t;
      return '<a href="'+ok+'"'+(/^https?:/i.test(u)?' target="_blank" rel="noopener"':'')+'>'+t+'</a>';
    })
   .replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')
   .replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<i>$2</i>')
   .replace(/\u0001/g,'&#124;')                      /* 单元格里转义过的竖线 */
   .replace(/\u0002(\d+)\u0002/g,(m,i)=>'<code>'+mdEsc(cs[+i])+'</code>');
  return s;
}
/* `| a | b |` → `<tr><td>a</td><td>b</td></tr>`
   注意：单元格里写的 `\|` 是「真竖线」，不能被当成列分隔符 ——
   直接 split('|') 会把 \| 也切开，`\` 留在左边格子、竖线留在右边，两边都错。
   这里手动扫一遍：碰到 \| 就吃进去当普通字符，碰到光杆 | 才分列。
   （不用后行断言 (?<!\\) —— 老 WebView 不一定支持。） */
function mdSplitRow(s){
  const out=[]; let cur='';
  for(let i=0;i<s.length;i++){
    if(s[i]==='\\'&&s[i+1]==='|'){ cur+='\u0001'; i++; continue; }
    if(s[i]==='|'){ out.push(cur); cur=''; continue; }
    cur+=s[i];
  }
  out.push(cur);
  return out;
}
function mdRow(line,tag){
  const body=line.replace(/^\s*\|/,'').replace(/\|\s*$/,'');
  return '<tr>'+mdSplitRow(body).map(c=>
    '<'+tag+'>'+mdInline(c.trim())+'</'+tag+'>').join('')+'</tr>';
}

/* ---------- 块级 ---------- */
function mdRender(src){
  if(!src) return '';
  src=String(src).replace(/\r\n?/g,'\n');

  /* 1. 先把整块代码抠出来占位 —— 里面的 # / | / - 不该被当成 md 记号 */
  const bs=[];
  src=src.replace(/```(\w*)\n?([\s\S]*?)```/g,(m,lang,code)=>{
    bs.push('<pre class="mdcode"><code>'+mdEsc(code.replace(/\n+$/,''))+'</code></pre>');
    return '\u0000'+(bs.length-1)+'\u0000';
  });

  const lines=src.split('\n');
  const out=[];
  let para=[], list=null;
  const flushP=()=>{ if(para.length){ out.push('<p>'+mdInline(para.join(' '))+'</p>'); para=[]; } };
  const flushL=()=>{
    if(!list) return;
    out.push('<'+list.t+'>'+list.it.map(t=>'<li>'+mdInline(t)+'</li>').join('')+'</'+list.t+'>');
    list=null;
  };
  const flushAll=()=>{ flushP(); flushL(); };

  /* 用下标循环而不是 for…of —— 表格要往后多看一行，得能手动推进 i */
  for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();

    let ph=line.match(/^\u0000(\d+)\u0000$/);
    if(ph){ flushAll(); out.push(bs[+ph[1]]); continue; }
    if(!line){ flushAll(); continue; }
    if(/^(-{3,}|\*{3,}|_{3,})$/.test(line)){ flushAll(); out.push('<hr>'); continue; }

    let h=line.match(/^(#{1,6})\s+(.*)$/);
    if(h){ flushAll(); const lv=h[1].length;
      out.push('<h'+lv+'>'+mdInline(h[2])+'</h'+lv+'>'); continue; }

    let q=line.match(/^>\s?(.*)$/);
    if(q){
      flushP(); flushL();
      /* 连着的多行 > 要合成【一条】引用，不能一行一条 ——
         文档里引用经常写成好几行（一行放不下），拆成好几块会中间空一条，很难看。 */
      const buf=[q[1]];
      while(i+1<lines.length){
        const n=lines[i+1].trim().match(/^>\s?(.*)$/);
        if(!n) break;
        buf.push(n[1]); i++;
      }
      out.push('<blockquote>'+mdInline(buf.join(' '))+'</blockquote>');
      continue;
    }

    /* 表格：本行是 |…|，下一行是 |---|---| 才算表格 */
    if(/^\|.*\|$/.test(line)){
      const nx=(lines[i+1]||'').trim();
      if(/^\|[\s:|-]+\|$/.test(nx)){
        flushAll();
        const rows=[mdRow(line,'th')];
        i+=2;
        while(i<lines.length&&/^\|.*\|$/.test(lines[i].trim())){ rows.push(mdRow(lines[i].trim(),'td')); i++; }
        i--;                                   /* for 自己会 +1，这里退一格 */
        out.push('<div class="mdtw"><table>'+rows.join('')+'</table></div>');
        continue;
      }
    }

    let ul=line.match(/^[-*+]\s+(.*)$/), ol=line.match(/^\d+\.\s+(.*)$/);
    if(ul||ol){
      flushP();
      const t=ol?'ol':'ul', txt=ol?ol[1]:ul[1];
      if(!list||list.t!==t){ flushL(); list={t:t,it:[]}; }
      list.it.push(txt); continue;
    }

    flushL();
    para.push(line);
  }
  flushAll();
  return out.join('\n');
}

/* ---------- 读文档 ----------
   三层兜底，保证什么情况下都有一份看得见的说明书：
     ① 联网/http 打开 → fetch('help.md')（正常情况，改 md 立刻生效）
     ② 断网 → Service Worker 缓存里那份（把它列进了离线清单）
     ③ 直接双击 index.html（file://，fetch 会被浏览器拦）→ 用 build-offline.py
        内联进 <script type="text/markdown"> 的那份备份
   ② 和 ③ 其实都是为了让「说明书不能消失」这件事在任何环境下成立。 */
let helpMD=null;
function helpFallback(){
  const n=document.getElementById('helpfall');
  return n?n.textContent:'';
}
function loadHelp(cb){
  if(helpMD){ cb(helpMD); return; }
  /* file:// 下（离线单文件版）fetch 一定被 CORS 拦，直接走内联备份，
     别再发那个注定失败的请求 —— 否则控制台会一直挂一条红色报错，看着像出事了。 */
  if(location.protocol==='file:'){ cb(helpFallback()); return; }
  /* 说明书也走资源基座：CDN 模式下会从补丁仓库读，所以帮助文档也能热更新
     （顺手修掉了这里写死 ?v=41 的老毛病 —— 别的资源早就到 43 了，
       它等于一直在发一个版本号对不上的请求）。
     PP.asset() 在本机模式下原样返回 'help.md'，跟以前一样。 */
  var url = (window.PP && PP.asset ? PP.asset('help.md') : 'help.md')
          + '?v=' + (window.PP ? PP.fileVb : '43');
  fetch(url,{cache:'no-cache'})
    .then(r=>{ if(!r.ok) throw 0; return r.text(); })
    .then(t=>{ helpMD=t; cb(t); })
    /* CDN 读不到就退回本机那份内置备份 */
    .catch(()=>{
      fetch('help.md?v=43',{cache:'no-cache'})
        .then(r=>{ if(!r.ok) throw 0; return r.text(); })
        .then(t=>{ helpMD=t; cb(t); })
        .catch(()=>{ cb(helpFallback()); });
    });
}
