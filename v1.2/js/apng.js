/* ==========================================================
   apng.js  —— APNG 编码器（把若干 RGBA 帧重组成动图）
   不依赖 canvas 吐出的 PNG 颜色类型（那玩意儿不透明时会被压成 RGB，
   各帧不一致就会让解码器报错）。这里自己把 RGBA 扫描线用 CompressionStream
   压成 zlib 流当 IDAT，IHDR 固定为 colortype=6(RGBA)，各帧一致。
   第 0 帧用 IDAT，其余帧用 fdAT；每帧 dispose=2 + blend=0（独立不叠加）。
   用法：encodeAPNG(frames, fps)   —— frames=[{w,h,rgba:Uint8ClampedArray}], 返回 Promise<Uint8Array>
   ========================================================== */
(function(){
  const T=(()=>{const t=new Uint32Array(256);
    for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
  function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=(c^T[(c^b[i])&0xff])>>>0;return (c^0xFFFFFFFF)>>>0;}
  function cat(...a){let n=0;for(const x of a)n+=x.length;const o=new Uint8Array(n);let p=0;for(const x of a){o.set(x,p);p+=x.length;}return o;}
  const u32=n=>new Uint8Array([(n>>>24)&255,(n>>16)&255,(n>>8)&255,n&255]);
  const u16=n=>new Uint8Array([(n>>8)&255,n&255]);
  function chunk(type,data){ const t=[...type].map(c=>c.charCodeAt(0));
    return cat(u32(data.length), new Uint8Array(t), data, u32(crc32(cat(new Uint8Array(t),data)))); }

  /* 把 RGBA 像素拼成「每行一个 0 过滤字节 + 像素」的扫描线 */
  function scanlines(rgba,w,h){
    const st=w*4, out=new Uint8Array(h*(1+st)); let p=0;
    for(let y=0;y<h;y++){ out[p++]=0; out.set(rgba.subarray(y*st,(y+1)*st), p); p+=st; }
    return out;
  }
  /* zlib 压缩（CompressionStream('deflate') 自带 0x78 头和 adler32，正好是 PNG 要的 IDAT） */
  function deflate(u8){
    return new Promise((res,rej)=>{
      try{
        const cs=new CompressionStream('deflate');
        const w=cs.writable.getWriter(); w.write(u8); w.close();
        new Response(cs.readable).arrayBuffer().then(ab=>res(new Uint8Array(ab))).catch(rej);
      }catch(e){ rej(e); }
    });
  }

  async function encode(frames, fps){
    const sig=new Uint8Array([137,80,78,71,13,10,26,10]);
    const W=frames[0].w, H=frames[0].h;
    /* IHDR：固定 RGBA（colortype=6, 8bit） */
    const ihdr=cat(u32(W),u32(H),new Uint8Array([8,6,0,0,0]));
    const out=[sig, chunk('IHDR', ihdr)];
    out.push(chunk('acTL', cat(u32(frames.length), u32(0))));   /* num_plays=0 → 无限循环 */
    const delayNum=Math.max(1,Math.round(1000/fps)), delayDen=1000;
    let seq=0;
    for(let i=0;i<frames.length;i++){
      const idat=await deflate(scanlines(frames[i].rgba, frames[i].w, frames[i].h));
      const fc=new Uint8Array(26);
      fc.set(u32(seq++),0); fc.set(u32(W),4); fc.set(u32(H),8);
      fc.set(u32(0),12); fc.set(u32(0),16);                    /* 偏移 0,0 */
      fc.set(u16(delayNum),20); fc.set(u16(delayDen),22);
      fc[24]=2; fc[25]=0;                                     /* dispose=2, blend=0 */
      out.push(chunk('fcTL', fc));
      if(i===0) out.push(chunk('IDAT', idat));
      else { const fd=new Uint8Array(4+idat.length); fd.set(u32(seq++),0); fd.set(idat,4); out.push(chunk('fdAT', fd)); }
    }
    out.push(chunk('IEND', new Uint8Array(0)));
    return cat(...out);
  }
  window.encodeAPNG=encode;
})();
