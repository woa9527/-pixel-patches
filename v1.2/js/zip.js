/* ==========================================================
   zip.js  —— 极简 ZIP 打包（只存不压，PNG 本身已压缩过）
   用途：动图 B 把每层打包成一个 ZIP；工作区导出时把 static/、anim/
        子文件夹合成一个 ZIP。无外部依赖，可整段内联进离线版。
   用法：zipBlob([{name:'a/1.png', data:Uint8Array}, ...]) -> Blob
   ========================================================== */
(function(){
  /* CRC32 表 */
  const T=(()=>{const t=new Uint32Array(256);
    for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
  function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=(c^T[(c^b[i])&0xff])>>>0;return (c^0xFFFFFFFF)>>>0;}
  const u16=n=>new Uint8Array([n&255,(n>>8)&255]);
  const u32=n=>new Uint8Array([n&255,(n>>8)&255,(n>>16)&255,(n>>24)&255]);
  /* 把若干 Uint8Array 拼成一个 */
  function cat(...arrs){let n=0;for(const a of arrs)n+=a.length;const o=new Uint8Array(n);let p=0;for(const a of arrs){o.set(a,p);p+=a.length;}return o;}
  function zipBlob(files){
    const enc=new TextEncoder();
    const now=new Date();
    const t=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1);
    const d=(((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate())&0xFFFF;
    const parts=[],central=[];let off=0;
    for(const f of files){
      const nb=enc.encode(f.name);            /* 文件名走 UTF-8（0x0800 标记），中文路径不乱码 */
      const data=f.data, crc=crc32(data);
      const lh=cat(u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(t),u16(d),
                  u32(crc),u32(data.length),u32(data.length),u16(nb.length),u16(0),nb,data);
      parts.push(lh);
      const cd=cat(u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(t),u16(d),
                  u32(crc),u32(data.length),u32(data.length),u16(nb.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(off),nb);
      central.push(cd);
      off+=lh.length;
    }
    const cen=cat(...central);
    const end=cat(u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(cen.length),u32(off),u16(0));
    return new Blob([cat(...parts,cen,end)],{type:'application/zip'});
  }
  window.zipBlob=zipBlob;
})();
