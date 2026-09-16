/* ==========================================================
   gif.js  —— GIF89a 编码器（支持透明、循环播放）
   全部图层当成一帧帧来拼，帧间不叠加（disposal=2 每帧重铺）。
   调色板：统计全部帧的不透明显色，超过 255 种就按出现频率保留前 255，
           其余就近取色（像素画一般 ≤16 色，照片导入才可能触发）。
   用法：encodeGIF(frames, delayCs)
         frames = [{w,h,data:Uint8ClampedArray RGBA}]（同尺寸）
         delayCs = 每帧间隔（百分秒，即 毫秒/10）
   返回 Uint8Array（GIF 二进制）
   ========================================================== */
(function(){
  function encode(frames, delayCs){
    const W=frames[0].w, H=frames[0].h;
    /* ---- 统计颜色频率（只看不透明显色）---- */
    const freq=new Map();
    for(const f of frames){ const d=f.data;
      for(let i=0;i<d.length;i+=4){ if(d[i+3]<128) continue;
        const k=(d[i]<<16)|(d[i+1]<<8)|d[i+2]; freq.set(k,(freq.get(k)||0)+1); } }
    /* 调色板：0 号固定给透明，其余按频率排。GIF 最多 256 色，留 1 个给透明 → 显色上限 255 */
    const cols=[...freq.entries()].sort((a,b)=>b[1]-a[1]);
    const used=cols.slice(0,255);
    const pal=[[0,0,0]];                       /* index 0 = 透明 */
    const map=new Map();
    used.forEach((e,idx)=>{ const k=e[0]; pal.push([(k>>16)&255,(k>>8)&255,k&255]); map.set(k,idx+1); });
    /* 没进调色板的颜色 → 找最近的那个（照片导入才会走到） */
    function nearest(r,g,b){ let bi=1,bd=1e9;
      for(let i=1;i<pal.length;i++){ const dr=pal[i][0]-r,dg=pal[i][1]-g,db=pal[i][2]-b;
        const dd=dr*dr+dg*dg+db*db; if(dd<bd){bd=dd;bi=i;} } return bi; }
    /* ---- 逐帧把像素翻译成调色板下标 ---- */
    const streams=frames.map(f=>{ const d=f.data; const s=new Uint8Array(W*H);
      for(let i=0,p=0;i<d.length;i+=4,p++){
        if(d[i+3]<128){ s[p]=0; }
        else { const k=(d[i]<<16)|(d[i+1]<<8)|d[i+2]; const idx=map.get(k);
               s[p]= idx!==undefined?idx:nearest(d[i],d[i+1],d[i+2]); } }
      return s; });
    let bits=Math.max(2,Math.ceil(Math.log2(pal.length))); const size=1<<bits;
    /* ---- GCT ---- */
    const gct=new Uint8Array(size*3);
    for(let i=0;i<pal.length;i++){ gct[i*3]=pal[i][0];gct[i*3+1]=pal[i][1];gct[i*3+2]=pal[i][2]; }
    /* ---- 拼字节 ---- */
    const out=[]; const pb=(...a)=>{ for(const x of a) out.push(x); };
    'GIF89a'.split('').forEach(c=>out.push(c.charCodeAt(0)));
    /* 逻辑屏幕描述符：全局色表标记 + 色深 */
    pb(W&255,(W>>8)&255, H&255,(H>>8)&255, 0x80|((bits-1)<<4)|(bits-1), 0, 0);
    for(let i=0;i<gct.length;i++) out.push(gct[i]);
    /* 循环应用扩展（NETSCAPE2.0，loop=0 无限） */
    pb(0x21,0xFF,0x0B); 'NETSCAPE2.0'.split('').forEach(c=>out.push(c.charCodeAt(0)));
    pb(0x03,0x01,0,0,0x00);
    const minCode=Math.max(2,bits);
    for(const s of streams){
      /* 图形控制扩展：disposal=2(每帧重铺) + 透明标记 */
      pb(0x21,0xF9,0x04, (2<<2)|(1<<1), delayCs&255,(delayCs>>8)&255, 0, 0x00);
      /* 图像描述符 */
      pb(0x2C, 0,0,0,0, W&255,(W>>8)&255, H&255,(H>>8)&255, 0);
      /* 图像数据 */
      out.push(minCode);
      const lzw=gifLZW(minCode,s);
      let p=0; while(p<lzw.length){ const n=Math.min(255,lzw.length-p); out.push(n); for(let i=0;i<n;i++) out.push(lzw[p+i]); p+=n; }
      out.push(0);                              /* 块结束 */
    }
    out.push(0x3B);                             /* 文件尾 */
    return new Uint8Array(out);
  }
  /* ---- GIF 变长 LZW ---- */
  function gifLZW(minCodeSize, idx){
    const clear=1<<minCodeSize, eoi=clear+1;
    let codeSize=minCodeSize+1, next=eoi+1;
    let bitBuf=0,bitCnt=0; const bytes=[];
    const table=new Map();
    function write(code){ bitBuf|=(code<<bitCnt); bitCnt+=codeSize;
      while(bitCnt>=8){ bytes.push(bitBuf&0xff); bitBuf>>>=8; bitCnt-=8; } }
    function clearDict(){ next=eoi+1; codeSize=minCodeSize+1; table.clear(); }
    write(clear);
    let cur=idx[0];
    for(let i=1;i<idx.length;i++){
      const k=idx[i]; const key=cur*256+k;
      const found=table.get(key);
      if(found!==undefined){ cur=found; }
      else {
        write(cur);
        if(next<4096){ table.set(key,next++); if(next===(1<<codeSize)&&codeSize<12) codeSize++; }
        else { write(clear); clearDict(); }
        cur=k;
      }
    }
    write(cur); write(eoi);
    if(bitCnt>0) bytes.push(bitBuf&0xff);
    return bytes;
  }
  window.encodeGIF=encode;
})();
