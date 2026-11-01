/* Versioned offline player-data backups. Product versions never gate save-schema migration. */
(function(root,factory){
 if(typeof module==='object'&&module.exports) module.exports=factory(require('./engine.js'),require('./daily.js'),require('./voyage.js'),function(){return require('./favorites.js');});
 else root.NineRealmsBackup=factory(root.SudokuEngine,root.SudokuDaily,root.SudokuVoyage,function(){return root.NineRealmsFavorites;});
})(typeof globalThis!=='undefined'?globalThis:this,function(Engine,Daily,Voyage,favorites){
 'use strict';
 var KEYS=['nine-realms.sudoku.v1','nine-realms.history.v1','nine-realms.secrets.v1','nine-realms.daily.v1','nine-realms.voyage.v1','nine-realms.puzzle-deck.v1','nine-realms.generated-recent.v1','nine-realms.favorites.v1'];
 var JOURNAL='nine-realms.backup-rollback.v1',MAX=4*1024*1024,trusted=new WeakSet();
 function fail(message,code){var e=new Error(message);e.code=code||'INVALID_BACKUP';throw e;}
 function assert(value,message){if(!value)fail(message);}
 function object(x){return x&&typeof x==='object'&&!Array.isArray(x);}
 function keys(x,allowed){assert(object(x),'对象格式无效');assert(Object.keys(x).every(function(k){return allowed.indexOf(k)>=0;}),'包含未知字段');}
 function integer(x,max){return Number.isInteger(x)&&x>=0&&x<=max;}
 function number(x,max){return Number.isFinite(x)&&x>=0&&x<=max;}
 function id(x){return typeof x==='string'&&/^[a-zA-Z0-9_-]{1,96}$/.test(x);}
 function clone(x){return JSON.parse(JSON.stringify(x));}
 function stable(x){if(Array.isArray(x))return '['+x.map(stable).join(',')+']';if(object(x))return '{'+Object.keys(x).sort().map(function(k){return JSON.stringify(k)+':'+stable(x[k]);}).join(',')+'}';return JSON.stringify(x);}
 function safe(x,depth){assert(depth<=32,'数据嵌套过深');if(typeof x==='number')assert(Number.isFinite(x),'数字无效');if(x&&typeof x==='object'){Object.keys(x).forEach(function(k){assert(['__proto__','prototype','constructor'].indexOf(k)<0,'危险字段');safe(x[k],depth+1);});}}
 function board(a,n,max,min){return Array.isArray(a)&&a.length===n&&a.every(function(v){return integer(v,max)&&v>=(min||0);});}
 function frame(x,givens){assert(object(x)&&board(x.board,givens.length,9)&&board(x.notes,givens.length,511),'棋盘或笔记无效');assert(givens.every(function(v,i){return (!v||x.board[i]===v)&&(!x.board[i]||!x.notes[i]);}),'给定数或笔记不一致');if(x.selected!==undefined)assert(integer(x.selected,givens.length-1),'选中格无效');if(x.noteMode!==undefined)assert(typeof x.noteMode==='boolean','笔记状态无效');}
 function stats(x){assert(object(x)&&number(x.elapsedMs,1e12)&&integer(x.mistakes,1e9)&&integer(x.hints,1e9),'计时或成绩无效');}
 function makeValidator(queue,deadline){
  var cache=new Set();deadline=deadline||Date.now()+8000;
  function puzzle(g,version){
   var mode=version===1?'classic':g.mode,difficulty=g.difficulty==='expert'?'master':g.difficulty;
   assert(Engine.getModes().some(function(m){return m.id===mode;}),'未知玩法');assert(Engine.getDifficulties(mode).some(function(d){return d.id===difficulty;}),'未知难度');
   var clues=Engine.normalizeClues(mode,g.clues),context={mode:mode,clues:clues},n=Engine.getLayout(context).cellCount;
   if(g.clues!==undefined)assert(stable(clues)===stable(g.clues),'规则线索格式无效');
   assert(board(g.givens,n,9)&&board(g.solution,n,9,1),'题目尺寸或数字无效');
   assert(Engine.validateComplete(g.solution,context)&&g.givens.every(function(v,i){return !v||v===g.solution[i];}),'题目答案不符合规则');
   var key=stable([mode,g.givens,clues,g.solution]);if(!cache.has(key)){
    assert(Date.now()<deadline,'验证预算已用完，请减少备份内容后再试');
    var prove=function(){assert(Date.now()<deadline,'验证预算已用完');var proof=Engine.analyzeSolutions(g.givens,context,{limit:2,maxNodes:250000,timeLimitMs:100});
    assert(proof.count===1&&!proof.exhausted&&stable(proof.solution)===stable(g.solution),'题目未能在预算内证明唯一解');};
    if(queue)queue.push(prove);else prove();cache.add(key);
   }
   return {mode:mode,difficulty:difficulty,context:context,n:n};
  }
  function snapshot(s,history){
   keys(s,['version','preferences','game']);assert(integer(s.version,8)&&s.version>=1,'不支持此存档格式版本');assert(object(s.game),'缺少棋局');
   if(s.preferences!==undefined){
    var p=s.preferences;keys(p,['theme','fx','errorCheck','fog','sound','focus','zen','zenMotion','intensity']);
    Object.keys(p).forEach(function(k){if(k==='theme')assert(['nebula','aurora','ember','ivory','ocean','sakura','firefly','sunset'].indexOf(p[k])>=0,'主题无效');else if(k==='intensity')assert(['cinematic','balanced','soft'].indexOf(p[k])>=0,'画质无效');else assert(typeof p[k]==='boolean','设置无效');});
   }
   var g=s.game;keys(g,['generation','sessionId','createdAt','puzzleId','sourceId','difficulty','mode','clues','givens','solution','board','notes','history','selected','mistakes','hints','elapsedMs','started','paused','completed','branch','voyageId','dailyDate','fog','fogSeen','energy','noteMode']);
   var info=puzzle(g,s.version);frame(g,g.givens);stats(g);
   if(history||g.sessionId!==undefined)assert(id(g.sessionId),'棋局标识无效');
   ['started','paused','completed','fog','noteMode'].forEach(function(k){if(g[k]!==undefined)assert(typeof g[k]==='boolean','棋局状态无效');});
   if(g.createdAt!==undefined)assert(number(g.createdAt,1e15),'创建时间无效');
   ['sourceId','puzzleId'].forEach(function(k){if(g[k]!==undefined&&g[k]!==null)assert(typeof g[k]==='string'&&g[k].length<=512,'来源标识无效');});
   if(g.completed)assert(g.board.every(function(v,i){return v===g.solution[i];})&&!g.branch,'完成状态与棋盘不符');
   if(g.history!==undefined){assert(Array.isArray(g.history)&&g.history.length<=80,'撤销记录过多');g.history.forEach(function(h){keys(h,['board','notes','selected','noteMode']);frame(h,g.givens);});}
   if(g.branch){keys(g.branch,['board','notes','selected','noteMode','history','mistakes']);frame(g.branch,g.givens);assert(integer(g.branch.mistakes,1e9)&&Array.isArray(g.branch.history)&&g.branch.history.length<=80,'假设记录无效');g.branch.history.forEach(function(h){keys(h,['board','notes','selected','noteMode']);frame(h,g.givens);});}
   if(g.fogSeen!==undefined)assert(Array.isArray(g.fogSeen)&&g.fogSeen.length===info.n&&g.fogSeen.every(function(v){return typeof v==='boolean';}),'迷雾记录无效');
   if(g.energy!==undefined){var e=g.energy;keys(e,['points','combo','best','claimed','units']);assert(integer(e.points,50000)&&integer(e.combo,info.n)&&integer(e.best,info.n)&&e.best>=e.combo,'星能记录无效');assert(Array.isArray(e.claimed)&&e.claimed.length===info.n&&e.claimed.every(function(v){return typeof v==='boolean';}),'星能格无效');assert(Array.isArray(e.units)&&new Set(e.units).size===e.units.length&&e.units.every(function(u){return integer(u,Engine.getUnits(info.context).length-1);}),'星能区域无效');}
   if(g.generation){keys(g.generation,['version','seed','kind','difficultyBasis','fingerprint','givenCount','target','unique','checks','nodes','rejectedByBudget']);assert(g.generation.version===1&&g.generation.kind==='carved'&&g.generation.difficultyBasis==='clue-density'&&typeof g.generation.seed==='string'&&g.generation.seed.length<=256&&/^[a-f0-9]{32}$/.test(g.generation.fingerprint)&&g.generation.givenCount===g.givens.filter(Boolean).length,'生成来源无效');}
   if(g.dailyDate)assert(Daily.matchesPuzzle(g.dailyDate,g.givens,info.mode,info.difficulty,g.clues),'每日题目不匹配');
   if(g.voyageId)assert(Voyage.matchesPuzzle(g.voyageId,g.givens,info.mode,info.difficulty,g.clues),'旅程题目不匹配');
   return s;
  }
  function history(h){
   assert(JSON.stringify(h).length*2<=3*1024*1024,'历史超出应用容量，导入会丢失记录');
   keys(h,['version','currentId','removedRecords','records']);assert(h.version===1&&integer(h.removedRecords,1e9)&&Array.isArray(h.records)&&h.records.length<=40,'历史格式无效');var ids=new Set();
   h.records.forEach(function(r){
    keys(r,['sessionId','createdAt','updatedAt','origin','snapshot','base','steps','droppedSteps','replayRecovered']);snapshot(r.snapshot,true);var g=r.snapshot.game;
    assert(id(r.sessionId)&&r.sessionId===g.sessionId&&!ids.has(r.sessionId),'重复历史标识');ids.add(r.sessionId);
    assert(number(r.createdAt,1e15)&&number(r.updatedAt,1e15)&&r.updatedAt>=r.createdAt&&['new','legacy'].indexOf(r.origin)>=0&&integer(r.droppedSteps,1e9),'历史元数据无效');
    if(r.replayRecovered!==undefined)assert(typeof r.replayRecovered==='boolean','回放修复标记无效');
    var f=clone(r.base);keys(f,['board','notes','selected','noteMode','branch','elapsedMs','mistakes','hints','completed']);frame(f,g.givens);stats(f);
    ['noteMode','branch','completed'].forEach(function(k){assert(typeof f[k]==='boolean','回放状态无效');});
    if(f.completed)assert(!f.branch&&f.board.every(function(v,i){return v===g.solution[i];}),'回放完成状态无效');
    assert(Array.isArray(r.steps)&&r.steps.length<=3000,'回放步骤过多');
    r.steps.forEach(function(step){
     keys(step,['action','changes','selected','noteMode','branch','elapsedMs','mistakes','hints','completed']);assert(typeof step.action==='string'&&step.action.length<=60&&Array.isArray(step.changes)&&step.changes.length<=g.givens.length,'回放步骤无效');stats(step);assert(integer(step.selected,g.givens.length-1),'回放选中格无效');
     ['noteMode','branch','completed'].forEach(function(k){assert(typeof step[k]==='boolean','回放标记无效');});var touched=new Set();
     step.changes.forEach(function(c){assert(Array.isArray(c)&&c.length===3&&integer(c[0],g.givens.length-1)&&integer(c[1],9)&&integer(c[2],511)&&!touched.has(c[0]),'回放变更无效');touched.add(c[0]);f.board[c[0]]=c[1];f.notes[c[0]]=c[2];});
     ['selected','noteMode','branch','elapsedMs','mistakes','hints','completed'].forEach(function(k){f[k]=step[k];});frame(f,g.givens);if(f.completed)assert(!f.branch&&f.board.every(function(v,i){return v===g.solution[i];}),'回放完成状态无效');
    });
    assert(stable(f.board)===stable(g.board)&&stable(f.notes)===stable(g.notes)&&f.branch===Boolean(g.branch)&&f.completed===Boolean(g.completed)&&f.mistakes===g.mistakes&&f.hints===g.hints,'回放终点与存档不符');
   });
   assert(h.currentId===null||ids.has(h.currentId),'当前历史标识无效');
  }
  return {snapshot:snapshot,history:history};
 }
 function validateCore(input,queue,deadline){
  var text=typeof input==='string'?input:JSON.stringify(input);assert(typeof text==='string'&&text.length<=MAX,'备份文件过大');var b;try{b=JSON.parse(text);}catch(e){fail('不是有效的 JSON 备份');}safe(b,0);
  keys(b,['format','schemaVersion','appVersion','createdAt','entries']);assert(b.format==='nine-realms-backup'&&b.schemaVersion===1,'不支持此备份格式版本');assert(typeof b.appVersion==='string'&&/^\d+\.\d+\.\d+$/.test(b.appVersion)&&typeof b.createdAt==='string'&&Number.isFinite(Date.parse(b.createdAt)),'备份元数据无效');
  keys(b.entries,KEYS);assert(KEYS.every(function(k){return Object.prototype.hasOwnProperty.call(b.entries,k);}), '备份不完整');var v=makeValidator(queue,deadline);
  KEYS.forEach(function(k){var x=b.entries[k];if(x===null)return;
   if(k===KEYS[0])v.snapshot(x,false);
   else if(k===KEYS[1])v.history(x);
   else if(k===KEYS[2]){keys(x,['version','found']);assert(x.version===1&&Array.isArray(x.found)&&new Set(x.found).size===x.found.length&&x.found.every(function(id){return ['gate','visitor','lotus','constellation','gravity','rain','crane'].indexOf(id)>=0;}),'彩蛋记录无效');}
   else if(k===KEYS[3])assert(stable(Daily.normalizeRecords(x))===stable(x),'每日成绩无效');
   else if(k===KEYS[4])assert(stable(Voyage.normalizeProgress(x))===stable(x),'旅程成绩无效');
   else if(k===KEYS[5]){keys(x,['version','seen']);assert(x.version===1&&object(x.seen),'轮换格式无效');var pools={};Engine.getPuzzleCatalog().forEach(function(p){var key=p.mode+'/'+p.difficulty;(pools[key]||(pools[key]=new Set())).add(p.id);});Object.keys(x.seen).forEach(function(key){var ids=x.seen[key];assert(pools[key]&&Array.isArray(ids)&&ids.length<=pools[key].size&&new Set(ids).size===ids.length&&ids.every(function(id){return pools[key].has(id);}), '轮换来源无效');});}
   else if(k===KEYS[6])assert(Array.isArray(x)&&x.length<=256&&new Set(x).size===x.length&&x.every(function(s){return typeof s==='string'&&/^[a-f0-9]{32}$/.test(s);}), '生成去重记录无效');
   else {var F=favorites();assert(F&&typeof F.validateEnvelope==='function','收藏验证器未加载');if(queue)queue.push(function(){assert(typeof F.validateEnvelopeAsync==='function','异步收藏验证器未加载');return F.validateEnvelopeAsync(x,{deadline:deadline});});else F.validateEnvelope(x);}
  });return b;
 }
 function mark(b){function freeze(x){if(x&&typeof x==='object'){Object.keys(x).forEach(function(k){freeze(x[k]);});Object.freeze(x);}}freeze(b);trusted.add(b);return b;}
 function validate(input){if(input&&typeof input==='object'&&trusted.has(input))return input;return mark(validateCore(input));}
 async function validateAsync(input){
  if(input&&typeof input==='object'&&trusted.has(input))return input;
  var queue=[],deadline=Date.now()+8000,b=validateCore(input,queue,deadline);
  for(var i=0;i<queue.length;i++){await new Promise(function(resolve){setTimeout(resolve,0);});assert(Date.now()<deadline,'验证预算已用完，请减少备份内容后再试');await queue[i]();}
  assert(Date.now()<deadline,'验证预算已用完，请减少备份内容后再试');return mark(b);
 }
 function read(storage){var out={};KEYS.forEach(function(k){out[k]=storage.getItem(k);});return out;}
 function draft(storage,options){var raw=read(storage),entries={};KEYS.forEach(function(k){entries[k]=raw[k]===null?null:JSON.parse(raw[k]);});return {format:'nine-realms-backup',schemaVersion:1,appVersion:options&&options.appVersion||'1.0.1',createdAt:new Date().toISOString(),entries:entries};}
 function create(storage,options){return validate(draft(storage,options));}
 function createAsync(storage,options){return validateAsync(draft(storage,options));}
 function preview(b){b=validate(b);var e=b.entries,g=e[KEYS[0]]&&e[KEYS[0]].game,h=e[KEYS[1]],f=e[KEYS[7]];return {createdAt:b.createdAt,appVersion:b.appVersion,currentGame:g?{mode:g.mode||'classic',difficulty:g.difficulty,filled:g.board.filter(Boolean).length,total:g.board.length,elapsedMs:g.elapsedMs}:null,historyCount:h?h.records.length:0,historySteps:h?h.records.reduce(function(n,r){return n+r.steps.length;},0):0,favoritesCount:f?f.records.length:0,secretsCount:e[KEYS[2]]?e[KEYS[2]].found.length:0,dailyCount:Object.keys(e[KEYS[3]]||{}).length,voyageCount:Voyage.chapters().filter(function(c){return Boolean((e[KEYS[4]]||{})[c.id]);}).length};}
 function rawJournal(text){assert(typeof text==='string'&&text.length<=MAX*2,'恢复日志过大');var j=JSON.parse(text);keys(j,['format','version','previous']);assert(j.format==='nine-realms-rollback'&&j.version===1,'恢复日志格式无效');keys(j.previous,KEYS);assert(KEYS.every(function(k){return Object.prototype.hasOwnProperty.call(j.previous,k)&&(j.previous[k]===null||typeof j.previous[k]==='string');}),'恢复日志不完整');return j;}
 function restoreRaw(storage,previous){KEYS.forEach(function(k){storage.removeItem(k);});KEYS.forEach(function(k){if(previous[k]!==null)storage.setItem(k,previous[k]);});assert(stable(read(storage))===stable(previous),'原数据恢复校验失败');storage.removeItem(JOURNAL);}
 function recoveryError(error,text){var e=new Error('存储恢复尚未完成。请勿继续游戏；保留恢复文件后重试。');e.code='RECOVERY_REQUIRED';e.recoveryRequired=true;e.previousBackup=text;e.cause=error;return e;}
 function recover(storage){var text=storage.getItem(JOURNAL);if(text===null)return {recovered:false};try{var j=rawJournal(text);restoreRaw(storage,j.previous);return {recovered:true};}catch(e){throw recoveryError(e,text);}}
 function replace(storage,input){var b=validate(input);recover(storage);var previous=read(storage),journal=JSON.stringify({format:'nine-realms-rollback',version:1,previous:previous});
  try{storage.setItem(JOURNAL,journal);assert(storage.getItem(JOURNAL)===journal,'恢复日志写入验证失败');}catch(error){var e=new Error('空间或权限不足，无法安全保存回滚记录；原有进度未替换。');e.code='BACKUP_STAGING_FAILED';e.cause=error;throw e;}
  if(stable(read(storage))!==stable(previous)){storage.removeItem(JOURNAL);fail('其他页面修改了进度，请关闭其他游戏页面后重试','CONCURRENT_CHANGE');}
  try{
   KEYS.forEach(function(k){storage.removeItem(k);});KEYS.forEach(function(k){if(b.entries[k]!==null)storage.setItem(k,JSON.stringify(b.entries[k]));});
   KEYS.forEach(function(k){assert(storage.getItem(k)===(b.entries[k]===null?null:JSON.stringify(b.entries[k])),'写入校验失败');});storage.removeItem(JOURNAL);return {replaced:true};
  }catch(error){try{restoreRaw(storage,previous);}catch(rollbackError){throw recoveryError(rollbackError,journal);}var e=new Error('导入未完成，原有进度已恢复。');e.code='IMPORT_ROLLED_BACK';e.cause=error;throw e;}
 }
 return {keys:KEYS.slice(),journalKey:JOURNAL,limits:{maxBytes:8*1024*1024,maxChars:MAX},create:create,createAsync:createAsync,validate:validate,validateAsync:validateAsync,preview:preview,replace:replace,recover:recover};
});
