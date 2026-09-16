/* ==========================================================
   history.js  —— 撤销 / 重做
   —— 有了图层之后，一步操作可能同时改好几层（比如「没选区时整幅移动」），
      所以快照存的是【整个层结构】：每层的像素 + 名字 + 显示/锁定状态 + 当前在第几层。
      只存当前层的话，撤销一次移动会只撤一半。
   ========================================================== */
/* max 从 40 降到 24：快照是「层数 × 画布面积」，512×512 五层时一步就是 5MB，
   40 步能把手机内存吃光。24 步对画像素画够用了。 */
const history={stack:[],i:-1,max:24};
function snapLayers(){
  return {cur:S.lyCur, ls:S.layers.map(L=>
    ({id:L.id,name:L.name,vis:L.vis,lock:L.lock,buf:new Uint8ClampedArray(L.buf)}))};
}
/* 从快照还原。这里必须【复制】一份出来 —— 栈里那份要留着给下一次撤销用，
   直接拿它的 buf 当当前层，会被随后的落笔改掉。 */
function restoreLayers(s){
  S.layers=s.ls.map(L=>
    ({id:L.id,name:L.name,vis:L.vis,lock:L.lock,buf:new Uint8ClampedArray(L.buf)}));
  S.lyCur=clamp(s.cur,0,S.layers.length-1);
  syncPx(); flatDirty=true;
}
function pushHistory(){
  if(!S.layers) return;
  history.stack.length=history.i+1;
  history.stack.push(snapLayers());
  if(history.stack.length>history.max) history.stack.shift();
  history.i=history.stack.length-1;
  syncUndo();
}
function applyHistory(){
  const s=history.stack[history.i]; if(!s) return;
  restoreLayers(s);
  renderLayers(); render(); save(); syncUndo();
}
function undo(){ if(history.i>0){history.i--;applyHistory();toast('已撤销');} }
function redo(){ if(history.i<history.stack.length-1){history.i++;applyHistory();toast('已重做');} }
function syncUndo(){
  $('#btnUndo').disabled=history.i<=0;
  $('#btnRedo').disabled=history.i>=history.stack.length-1;
}
