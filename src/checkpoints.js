/* Review candidates from observable history only, never a diagnosis of player ability. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.NineRealmsCheckpoints=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
var LIMIT=20,TYPES=['manual','hint','mistake','undo','rewrite'];
function fail(){throw new TypeError('卡点标记格式无效或超出每局 20 条容量。');}
function validate(input,maxStep){if(!Number.isInteger(maxStep)||maxStep<0||maxStep>1000003000)fail();if(input===undefined)return [];if(!Array.isArray(input)||input.length>LIMIT||Object.keys(input).length!==input.length)fail();var ids=new Set();return input.map(function(c){
 if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).length!==4||!Object.keys(c).every(function(k){return ['id','absoluteStep','createdAt','label'].indexOf(k)>=0;})||typeof c.id!=='string'||!/^cp-[a-zA-Z0-9_-]{1,70}$/.test(c.id)||ids.has(c.id)||!Number.isInteger(c.absoluteStep)||c.absoluteStep<0||c.absoluteStep>maxStep||!Number.isFinite(c.createdAt)||c.createdAt<=0||c.createdAt>=1e15||typeof c.label!=='string'||c.label.length>80||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(c.label))fail();ids.add(c.id);return {id:c.id,absoluteStep:c.absoluteStep,createdAt:c.createdAt,label:c.label};
 });}
function collect(record){if(!record||!record.snapshot||!record.base||!Array.isArray(record.steps))return [];var dropped=record.droppedSteps||0,total=dropped+record.steps.length;
 var g=record.snapshot.game,session=record.sessionId,points=[],board=record.base.board.slice(),hints=record.base.hints,mistakes=record.base.mistakes,writes=board.map(function(){return [];});
 function add(kind,index,text,cells,id){points.push({id:id||kind+'-'+(dropped+index),kind:kind,sessionId:session,absoluteStep:dropped+index,stepIndex:index,available:true,label:text,cells:cells||[],mode:g.mode,completed:Boolean(g.completed),updatedAt:record.updatedAt});}
 record.steps.forEach(function(s,i){var reasons=[],cells=[],idx=i+1;
  if(s.hints>hints)add('hint',idx,'提示计数增加 '+(s.hints-hints)+' · '+s.action);
  if(s.mistakes>mistakes)add('mistake',idx,'失误计数增加 '+(s.mistakes-mistakes)+' · '+s.action);
  if(/^撤销/.test(s.action))add('undo',idx,'记录了撤销操作 · '+s.action);
  s.changes.forEach(function(c){if(c[1]!==board[c[0]]){var list=writes[c[0]].filter(function(k){return i-k<12;});list.push(i);writes[c[0]]=list;if(list.length===3){cells.push(c[0]);reasons.push('格 '+(c[0]+1));}board[c[0]]=c[1];}});
  if(cells.length)add('rewrite',idx,'有 '+cells.length+' 格的数字在最近 12 个保留步骤中发生 3 次改写（回看对应步骤）',cells);
  hints=s.hints;mistakes=s.mistakes;
 });
 validate(record.checkpoints,total).forEach(function(c){var relative=c.absoluteStep-dropped;points.push({id:c.id,kind:'manual',sessionId:session,absoluteStep:c.absoluteStep,stepIndex:relative,available:relative>=0&&relative<=record.steps.length,label:c.label||'我想再看这一处',cells:[],mode:g.mode,completed:Boolean(g.completed),updatedAt:c.createdAt});});
 return points.sort(function(a,b){return b.absoluteStep-a.absoluteStep||(a.kind==='manual'?-1:1);});
}
function list(records,filter){filter=filter||{};var out=[];(records||[]).forEach(function(r){out=out.concat(collect(r));});return out.filter(function(p){return (!filter.kind||filter.kind==='all'||p.kind===filter.kind)&&(!filter.mode||p.mode===filter.mode)&&(!filter.sessionId||p.sessionId===filter.sessionId);}).sort(function(a,b){return b.updatedAt-a.updatedAt||b.absoluteStep-a.absoluteStep;});}
return {validate:validate,collect:collect,list:list,limit:LIMIT,types:TYPES.slice(),scope:'自动条目只反映保留日志中的提示、失误计数、撤销或改写，不代表你不懂某种技巧，也不推断原因。手动标记每局最多 20 条。卡点随本机历史保留，最多 40 局、每局 3000 步：较早步骤清理后不能精确回看，整局移除时其标记一同移除；重要题目可另行收藏或导出备份。'};
});
