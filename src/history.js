/* Nine Realms — independent local history with real action diffs. */
(function(root,factory){"use strict";if(typeof module==="object"&&module.exports)module.exports=factory(root,require("./drafts.js"),require("./checkpoints.js"));else root.NineRealmsHistory=factory(root,root.NineRealmsDrafts,root.NineRealmsCheckpoints);})(typeof globalThis!=="undefined"?globalThis:this,function(root,Drafts,Checkpoints){
"use strict";
var KEY="nine-realms.history.v1",LIMITS={records:40,steps:3000,bytes:3*1024*1024};
var singleton=null,hooks={},ui=null,flushTimer=null,persistenceSuspended=false;
function copy(x){return JSON.parse(JSON.stringify(x));}
function integer(x,f,max){return Number.isInteger(x)&&x>=0&&x<=max?x:f;}
function stamp(x,f){if(typeof x==="string")x=Date.parse(x);return Number.isFinite(x)&&x>0&&x<1e15?x:f;}
function createSessionId(){var r="";try{var b=new Uint32Array(2);root.crypto.getRandomValues(b);r=b[0].toString(36)+b[1].toString(36);}catch(e){r=Math.random().toString(36).slice(2,14);}return "nr-"+Date.now().toString(36)+"-"+r;}
function numbers(a,n,max,min){return Array.isArray(a)&&a.length===n&&a.every(function(v){return Number.isInteger(v)&&v>=(min||0)&&v<=max;});}
function practiceInfo(value){
 if(value===undefined||value===null)return null;
 if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==4||Object.keys(value).some(function(k){return ['version','sourceSessionId','absoluteStep','wasAssumption'].indexOf(k)<0;})||value.version!==1||typeof value.sourceSessionId!=='string'||!/^[a-zA-Z0-9_-]{1,96}$/.test(value.sourceSessionId)||!Number.isInteger(value.absoluteStep)||value.absoluteStep<0||value.absoluteStep>1000003000||typeof value.wasAssumption!=='boolean')throw new TypeError('复练来源格式无效。');
 return copy(value);
}
function cleanSnapshot(x,Engine){
 if(!x||typeof x!=="object"||!x.game||typeof x.game!=="object")return null;
 var g=x.game,n=Array.isArray(g.givens)?g.givens.length:0;
 if([81,153,369].indexOf(n)<0||typeof g.sessionId!=="string"||!/^[a-zA-Z0-9_-]{1,96}$/.test(g.sessionId)||
 !numbers(g.givens,n,9)||!numbers(g.board,n,9)||!numbers(g.solution,n,9,1)||!numbers(g.notes,n,511)||
 !g.givens.every(function(v,i){return !v||(v===g.board[i]&&v===g.solution[i]);})||
 !g.notes.every(function(v,i){return !g.board[i]||v===0;})||
 typeof g.mode!=="string"||typeof g.difficulty!=="string"||!Number.isFinite(g.elapsedMs)||g.elapsedMs<0||g.elapsedMs>1e12||
 !Number.isInteger(g.mistakes)||g.mistakes<0||!Number.isInteger(g.hints)||g.hints<0)return null;
 if(Engine){try{
   if(!Engine.getModes().some(function(m){return m.id===g.mode;})||!Engine.getDifficulties(g.mode).some(function(d){return d.id===g.difficulty;}))return null;
   if(Engine.getLayout&&Engine.getLayout(g.mode).cellCount!==n)return null;
   Engine.normalizeClues(g.mode,g.clues);
 }catch(e){return null;}}
 try{practiceInfo(g.practice);if(g.logicMode!==undefined&&typeof g.logicMode!=="boolean")return null;if(g.draft!==undefined)Drafts.validate(g.draft,n,g.clues||{});var out=copy(x);out.game.selected=integer(g.selected,0,n-1);out.game.noteMode=Boolean(g.noteMode);out.game.completed=Boolean(g.completed);return out;}catch(e){return null;}
}
function stateOf(s){var g=s.game;var out={board:g.board.slice(),notes:g.notes.slice(),selected:g.selected||0,noteMode:Boolean(g.noteMode),branchId:null,branchLabel:g.branch?"假设":"主盘",branch:Boolean(g.branch&&(g.branch.version!==2||g.branch.activeId!==null)),elapsedMs:Math.floor(g.elapsedMs),mistakes:g.mistakes,hints:g.hints,completed:Boolean(g.completed)};if(g.branch&&g.branch.version===2){out.branchId=g.branch.activeId;var node=g.branch.nodes.find(function(n){return n.id===g.branch.activeId;});out.branchLabel=node?node.label:"主盘";}if(g.logicMode!==undefined)out.logicMode=Boolean(g.logicMode);if(g.draft!==undefined)out.draft=Drafts.validate(g.draft,g.board.length,g.clues||{});return out;}
function validDraft(value,n,clues){try{if(value!==undefined)Drafts.validate(value,n,clues);return true;}catch(e){return false;}}
function validFrame(f,g,clues){return f&&(f.logicMode===undefined||typeof f.logicMode==='boolean')&&validDraft(f.draft,g.length,clues)&&numbers(f.board,g.length,9)&&numbers(f.notes,g.length,511)&&g.every(function(v,i){return !v||v===f.board[i];})&&f.notes.every(function(v,i){return !f.board[i]||!v;})&&Number.isFinite(f.elapsedMs)&&f.elapsedMs>=0&&f.elapsedMs<=1e12&&Number.isInteger(f.mistakes)&&f.mistakes>=0&&Number.isInteger(f.hints)&&f.hints>=0;}
function sameState(a,b){return Drafts.equal(a.draft,b.draft,a.board.length)&&(a.branchId||null)===(b.branchId||null)&&Boolean(a.logicMode)===Boolean(b.logicMode)&&a.branch===b.branch&&a.completed===b.completed&&a.mistakes===b.mistakes&&a.hints===b.hints&&a.board.every(function(v,i){return v===b.board[i]&&a.notes[i]===b.notes[i];});}
function applyStep(f,s){if(s.branchId!==undefined){f.branchId=s.branchId;f.branchLabel=s.branchLabel;}if(s.logicMode!==undefined)f.logicMode=s.logicMode;if(s.draft!==undefined)f.draft=copy(s.draft);s.changes.forEach(function(c){f.board[c[0]]=c[1];f.notes[c[0]]=c[2];});["selected","noteMode","branch","elapsedMs","mistakes","hints","completed"].forEach(function(k){f[k]=s[k];});return f;}
function makeStep(a,b,label){
 var changes=[];b.board.forEach(function(v,i){if(v!==a.board[i]||b.notes[i]!==a.notes[i])changes.push([i,v,b.notes[i]]);});
 var draftChanged=!Drafts.equal(a.draft,b.draft,b.board.length);
 if(!draftChanged&&!changes.length&&(a.branchId||null)===(b.branchId||null)&&Boolean(a.logicMode)===Boolean(b.logicMode)&&a.branch===b.branch&&a.hints===b.hints&&a.mistakes===b.mistakes&&a.completed===b.completed)return null;
 var title=typeof label==="string"?label.trim().slice(0,60):"";
 if(!title){
   if(draftChanged&&!changes.length)title="修改推理草稿";
   else if(a.branch!==b.branch)title=b.branch?"建立假设分支":"结束假设分支";
   else if(b.completed&&!a.completed)title="完成棋局";
   else if(b.hints>a.hints&&!changes.length)title="查看提示";
   else if(changes.length===1&&a.board[changes[0][0]]!==b.board[changes[0][0]])title=changes[0][1]?"填入数字":"擦除数字";
   else title=changes.every(function(c){return a.board[c[0]]===c[1];})?"修改候选笔记":"修改棋盘";
 }
 var result={action:title,changes:changes,selected:b.selected,noteMode:b.noteMode,branch:b.branch,elapsedMs:b.elapsedMs,mistakes:b.mistakes,hints:b.hints,completed:b.completed};if(b.branchId!==undefined){result.branchId=b.branchId;result.branchLabel=b.branchLabel;}if(b.logicMode!==undefined)result.logicMode=b.logicMode;if(draftChanged)result.draft=Drafts.validate(b.draft,b.board.length);return result;
}
function validStep(s,n,g,clues){
 if(!s||(s.logicMode!==undefined&&typeof s.logicMode!=='boolean')||!validDraft(s.draft,n,clues)||typeof s.action!=="string"||s.action.length>60||!Array.isArray(s.changes)||s.changes.length>n||
 !Number.isFinite(s.elapsedMs)||s.elapsedMs<0||s.elapsedMs>1e12||!Number.isInteger(s.selected)||s.selected<0||s.selected>=n||
 !Number.isInteger(s.mistakes)||s.mistakes<0||!Number.isInteger(s.hints)||s.hints<0||
 typeof s.branch!=="boolean"||typeof s.completed!=="boolean"||typeof s.noteMode!=="boolean")return false;
 var seen=new Set();return s.changes.every(function(c){
   if(!Array.isArray(c)||c.length!==3||!Number.isInteger(c[0])||c[0]<0||c[0]>=n||seen.has(c[0])||
   !Number.isInteger(c[1])||c[1]<0||c[1]>9||!Number.isInteger(c[2])||c[2]<0||c[2]>511||(c[1]&&c[2])||(g[c[0]]&&c[1]!==g[c[0]]))return false;
   seen.add(c[0]);return true;
 });
}
function createStore(options){
 options=options||{};var Engine=options.Engine||null,storage=options.storage||null,now=typeof options.now==="function"?options.now:Date.now;
 var limits={records:integer(options.maxRecords,LIMITS.records,40)||LIMITS.records,steps:integer(options.maxSteps,LIMITS.steps,3000)||LIMITS.steps,bytes:integer(options.maxBytes,LIMITS.bytes,LIMITS.bytes)||LIMITS.bytes};
 var records=[],currentId=null,dirty=false,warned=false,persistenceFailed=false,removed=0;
 function warn(s){persistenceFailed=true;if(!warned&&typeof options.onWarning==="function")options.onWarning(s);warned=true;}
 function raw(id){return records.find(function(r){return r.sessionId===id;});}
 function last(r){var f=copy(r.base);r.steps.forEach(function(s){applyStep(f,s);});return f;}
 function trim(r,n){r.steps.slice(0,n).forEach(function(s){applyStep(r.base,s);});r.steps.splice(0,n);r.droppedSteps+=n;}
 function eviction(){var current=raw(currentId),source=current&&current.snapshot.game.practice&&current.snapshot.game.practice.sourceSessionId;return records.filter(function(r){return r.sessionId!==currentId&&r.sessionId!==source;}).sort(function(a,b){return Number(b.snapshot.game.completed)-Number(a.snapshot.game.completed)||a.updatedAt-b.updatedAt;});}
 function envelope(){return {version:1,currentId:currentId,removedRecords:removed,records:records};}
 function enforce(){
   records.forEach(function(r){if(r.steps.length>limits.steps)trim(r,r.steps.length-limits.steps);});
   while(records.length>limits.records){var r=eviction()[0];if(!r)break;records.splice(records.indexOf(r),1);removed++;}
   var text=JSON.stringify(envelope());if(text.length*2<=limits.bytes)return text;
   eviction().concat(records.filter(function(r){return r.sessionId===currentId;})).forEach(function(r){
     while(text.length*2>limits.bytes&&r.steps.length){trim(r,Math.min(250,r.steps.length));text=JSON.stringify(envelope());}
   });
   while(text.length*2>limits.bytes&&records.length>1){var old=eviction()[0];if(!old)break;records.splice(records.indexOf(old),1);removed++;text=JSON.stringify(envelope());}
   return text;
 }
 function load(){
   if(!storage||typeof storage.getItem!=="function")return;
   try{
     var text=storage.getItem(KEY);if(!text)return;if(text.length>6*1024*1024)throw new Error("oversized");
     var data=JSON.parse(text);if(!data||data.version!==1||!Array.isArray(data.records))throw new Error("invalid history");
     removed=integer(data.removedRecords,0,1e9);
     data.records.slice(-80).forEach(function(s){
       var snap=cleanSnapshot(s&&s.snapshot,Engine);if(!snap||s.sessionId!==snap.game.sessionId||raw(s.sessionId))return;
       var r={sessionId:s.sessionId,createdAt:stamp(s.createdAt,now()),updatedAt:stamp(s.updatedAt,now()),origin:s.origin==="new"?"new":"legacy",snapshot:snap,base:s.base,steps:[],droppedSteps:integer(s.droppedSteps,0,1e9)};
       if(s.checkpoints!==undefined){try{r.checkpoints=Checkpoints.validate(s.checkpoints,r.droppedSteps+(Array.isArray(s.steps)?s.steps.length:0));}catch(e){warn("部分卡点标记无法读取，棋局及可用回放仍保留。");}}
       var valid=validFrame(r.base,snap.game.givens,snap.game.clues||{})&&Array.isArray(s.steps)&&s.steps.length<=3000;
       if(valid)valid=s.steps.every(function(step){return validStep(step,snap.game.board.length,snap.game.givens,snap.game.clues||{});});
       if(valid){
         r.base=copy(r.base);r.base.selected=integer(r.base.selected,0,snap.game.board.length-1);r.base.noteMode=Boolean(r.base.noteMode);r.base.branch=Boolean(r.base.branch);r.base.completed=Boolean(r.base.completed);r.steps=copy(s.steps);
         valid=sameState(last(r),stateOf(snap));
       }
       if(!valid){r.base=stateOf(snap);r.steps=[];r.origin="legacy";r.droppedSteps=0;r.replayRecovered=true;delete r.checkpoints;}
       else if(s.replayRecovered)r.replayRecovered=true;
       records.push(r);
     });
     currentId=records.some(function(r){return r.sessionId===data.currentId;})?data.currentId:null;enforce();
   }catch(e){records=[];currentId=null;warn("历史记录暂时无法读取，当前棋局不受影响。新的操作会从现在开始记录。");}
 }
 load();
 function capture(value,meta){
   meta=meta||{};var snapshot=cleanSnapshot(value,Engine);if(!snapshot)return false;
   var g=snapshot.game,r=raw(g.sessionId);
   if(r&&currentId===g.sessionId&&JSON.stringify(r.snapshot)===JSON.stringify(snapshot))return false;
   if(!r){currentId=g.sessionId;r={sessionId:g.sessionId,createdAt:stamp(g.createdAt,now()),updatedAt:now(),origin:meta.origin==="new"?"new":"legacy",snapshot:snapshot,base:stateOf(snapshot),steps:[],droppedSteps:0};records.push(r);}
   else{
     var prior=r.snapshot.game;
     if(g.mode!==prior.mode||g.difficulty!==prior.difficulty||JSON.stringify(g.givens)!==JSON.stringify(prior.givens)||JSON.stringify(g.clues||{})!==JSON.stringify(prior.clues||{})){
       warn("这一局的历史标识出现冲突，原有历史已保留。当前棋局仍可继续。");return false;
     }
     currentId=g.sessionId;var step=makeStep(stateOf(r.snapshot),stateOf(snapshot),meta.action);if(step)r.steps.push(step);
     r.snapshot=snapshot;r.updatedAt=now();
   }
   dirty=true;enforce();return true;
 }
 function summaries(){return records.slice().sort(function(a,b){return b.updatedAt-a.updatedAt;}).map(function(r){var g=r.snapshot.game;return {sessionId:r.sessionId,createdAt:r.createdAt,updatedAt:r.updatedAt,mode:g.mode,difficulty:g.difficulty,puzzleId:g.puzzleId,completed:Boolean(g.completed),started:Boolean(g.started),elapsedMs:g.elapsedMs,mistakes:g.mistakes,hints:g.hints,filled:g.board.filter(Boolean).length,total:g.board.length,steps:r.steps.length,droppedSteps:r.droppedSteps,current:r.sessionId===currentId,origin:r.origin};});}
 function frameAt(id,index){
   var r=raw(id);if(!r)return null;index=Math.max(0,Math.min(r.steps.length,Math.floor(Number(index)||0)));
   var f=copy(r.base),priorDraft;for(var i=0;i<index;i++){if(i===index-1)priorDraft=Drafts.validate(f.draft,f.board.length);applyStep(f,r.steps[i]);}
   f.index=index;f.totalSteps=r.steps.length;f.action=index?r.steps[index-1].action:"回放起点";f.changed=index?r.steps[index-1].changes.map(function(c){return c[0];}):[];
   if(index&&r.steps[index-1].draft!==undefined){var nextDraft=Drafts.validate(f.draft,f.board.length),changed=new Set(f.changed);nextDraft.colors.forEach(function(v,i){if(v!==priorDraft.colors[i]||nextDraft.marks[i]!==priorDraft.marks[i])changed.add(i);});if(JSON.stringify(priorDraft.links)!==JSON.stringify(nextDraft.links))priorDraft.links.concat(nextDraft.links).forEach(function(l){changed.add(l.a);changed.add(l.b);});if(JSON.stringify(priorDraft.cages)!==JSON.stringify(nextDraft.cages)){var cages=r.snapshot.game.clues&&r.snapshot.game.clues.cages||[];priorDraft.cages.concat(nextDraft.cages).forEach(function(c){if(cages[c.index])cages[c.index].cells.forEach(function(i){changed.add(i);});});}f.changed=Array.from(changed);}
   return f;
 }
 function practiceAt(id,absoluteStep){
   var record=raw(id);
   if(!record)throw new Error("原局已被历史保留策略移除，无法创建该卡点副本。");
   if(!Number.isInteger(absoluteStep)||absoluteStep<record.droppedSteps||absoluteStep>record.droppedSteps+record.steps.length)
     throw new Error("这个卡点的原步骤已清理，无法准确复练；原局最新进度仍可继续。");
   var frame=frameAt(id,absoluteStep-record.droppedSteps),snapshot=copy(record.snapshot),g=snapshot.game;
   g.sessionId=createSessionId();g.createdAt=now();g.board=frame.board.slice();g.notes=frame.notes.slice();
   g.draft=Drafts.clone(frame.draft,g.board.length,g.clues);g.selected=frame.selected;g.noteMode=frame.noteMode;
   g.history=[];g.redo=[];g.branch=null;g.elapsedMs=0;g.hints=0;g.mistakes=0;
   g.started=false;g.paused=false;g.completed=false;g.dailyDate=null;g.voyageId=null;delete g.energy;
   g.logicMode=Boolean(frame.logicMode||frame.branch);
   g.practice={version:1,sourceSessionId:id,absoluteStep:absoluteStep,wasAssumption:Boolean(frame.branch)};
   return snapshot;
 }
 function summarize(id){
   var r=raw(id);if(!r)return null;var frame=copy(r.base),events=[],counts={hints:0,mistakes:0,notes:0,drafts:0,undo:0,branches:0,completion:0};
   r.steps.forEach(function(step,index){var kinds=[];
     if(step.hints>frame.hints){counts.hints+=step.hints-frame.hints;kinds.push('hint');}
     if(step.mistakes>frame.mistakes){counts.mistakes+=step.mistakes-frame.mistakes;kinds.push('mistake');}
     if(step.changes.some(function(c){return frame.notes[c[0]]!==c[2];})){counts.notes++;kinds.push('notes');}
     if(step.draft!==undefined&&!Drafts.equal(frame.draft,step.draft,frame.board.length)){counts.drafts++;kinds.push('draft');}
     if(/撤销|undo/i.test(step.action)){counts.undo++;kinds.push('undo');}
     if(frame.branch!==step.branch||(frame.branchId||null)!==(step.branchId||null)){counts.branches++;kinds.push('branch');}
     if(!frame.completed&&step.completed){counts.completion++;kinds.push('completion');}
     if(kinds.length)events.push({stepIndex:index+1,absoluteStep:r.droppedSteps+index+1,action:step.action,kinds:kinds,elapsedMs:step.elapsedMs});
     applyStep(frame,step);
   });
   return {sessionId:id,counts:counts,events:events,retainedSteps:r.steps.length,droppedSteps:r.droppedSteps,partial:Boolean(r.droppedSteps||r.origin==='legacy'||r.replayRecovered),scope:'仅统计保留日志中的可观察事件，不推断未记录的解题技巧。'};
 }
 function checkpointList(filter){return Checkpoints.list(records,filter);}
 function markCheckpoint(id,index,label){
   var r=raw(id);if(!r)throw new Error("这局历史已不在本机保留范围内。");
   if(!Number.isInteger(index)||index<0||index>r.steps.length)throw new RangeError("这个回放步骤已不可用。");
   label=label===undefined?'我想再看这一处':String(label).trim();if(label.length>80)throw new RangeError("卡点备注最多 80 字。");
   var marks=Checkpoints.validate(r.checkpoints,r.droppedSteps+r.steps.length),absolute=r.droppedSteps+index;
   var existing=marks.find(function(mark){return mark.absoluteStep===absolute;});
   if(existing){existing.label=label;existing.createdAt=now();}
   else{if(marks.length>=Checkpoints.limit)throw new RangeError("每局最多保留 20 条手动卡点，请先取消不再需要的标记。");existing={id:'cp-'+now().toString(36)+'-'+Math.random().toString(36).slice(2,10),absoluteStep:absolute,createdAt:now(),label:label};marks.push(existing);}
   r.checkpoints=Checkpoints.validate(marks,r.droppedSteps+r.steps.length);dirty=true;var persisted=flush();return {checkpoint:copy(existing),persisted:persisted};
 }
 function removeCheckpoint(id,checkpointId){var r=raw(id);if(!r)return false;var marks=Checkpoints.validate(r.checkpoints,r.droppedSteps+r.steps.length),filtered=marks.filter(function(mark){return mark.id!==checkpointId;});if(marks.length===filtered.length)return false;r.checkpoints=filtered;dirty=true;return flush();}
 function flush(){
   if(!dirty)return !persistenceFailed;
   if(!storage||typeof storage.setItem!=="function"){warn("浏览器未允许保存历史，本次仍可查看回放；关闭窗口后这些新记录可能丢失。");return false;}
   try{var text=enforce();if(text.length*2>limits.bytes)throw new Error("History snapshot exceeds storage budget");storage.setItem(KEY,text);dirty=false;persistenceFailed=false;return true;}catch(e){warn("历史记录暂时无法保存到本机，本次仍可回放；当前棋局继续单独保存。");return false;}
 }
 return {capture:capture,flush:flush,practiceAt:practiceAt,summarize:summarize,checkpoints:checkpointList,markCheckpoint:markCheckpoint,removeCheckpoint:removeCheckpoint,exportData:function(){return copy(envelope());},getRecords:summaries,get:function(id){var r=raw(id);return r?copy(r):null;},getSnapshot:function(id){var r=raw(id);return r?copy(r.snapshot):null;},frameAt:frameAt,status:function(){return {currentId:currentId,records:records.length,persistenceFailed:persistenceFailed,removedRecords:removed,limits:copy(limits)};}};
}
function getStore(){
 if(!singleton){var storage=null;try{storage=root.localStorage;}catch(e){}singleton=createStore({storage:storage,Engine:hooks.Engine||root.SudokuEngine||null,onWarning:function(s){if(hooks.toast)hooks.toast(s);}});}
 return singleton;
}
function capture(snapshot,meta){if(persistenceSuspended)return false;var ok=getStore().capture(snapshot,meta);if(ok){clearTimeout(flushTimer);flushTimer=setTimeout(function(){flushTimer=null;getStore().flush();},700);if(ui&&ui.dialog.open)ui.refreshList(false);}return ok;}
function flush(){clearTimeout(flushTimer);flushTimer=null;return persistenceSuspended?true:getStore().flush();}
function suspendPersistence(value){clearTimeout(flushTimer);flushTimer=null;persistenceSuspended=Boolean(value);}

function init(options){
 if(ui)return api;hooks=options||{};
 if(!root.document||!hooks.Engine||typeof hooks.openDialog!=="function")return api;
 getStore();var doc=root.document;
 function el(tag,cls,text){var x=doc.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;}
 function btn(id,label,cls){var x=el("button",cls,label);x.type="button";if(id)x.id=id;return x;}
 var dialog=el("dialog","game-dialog history-dialog");dialog.id="history-dialog";dialog.setAttribute("aria-labelledby","history-title");
 var closeButton=btn("history-close","×","history-close icon-btn");closeButton.setAttribute("aria-label","关闭棋局历史");
 var heading=el("div","history-heading"),headingCopy=el("div"),title=el("h2","","棋局历史");
 title.id="history-title";headingCopy.append(el("div","eyebrow","YOUR PATH THROUGH THE REALMS"),title);
 var countLabel=el("span","history-count");countLabel.id="history-count";heading.append(headingCopy,countLabel);
 var intro=el("p","history-intro","继续一局未完的思考，或回看每一步是怎样走来的。"),main=el("div","history-main");
 var sidebar=el("section","history-sidebar");sidebar.setAttribute("aria-label","历史棋局列表");
 var filter=el("select","history-filter");filter.id="history-filter";filter.setAttribute("aria-label","筛选历史棋局");
 [["all","全部棋局"],["unfinished","未完成"],["completed","已完成"]].forEach(function(item){var option=el("option","",item[1]);option.value=item[0];filter.appendChild(option);});
 var list=el("div","history-list");list.id="history-list";var empty=el("p","history-empty","还没有符合筛选条件的棋局。");sidebar.append(filter,list,empty);
 var detail=el("section","history-detail");detail.setAttribute("aria-label","棋局回放");
 var detailHead=el("div","history-detail-heading"),recordTitle=el("h3"),recordState=el("span","history-record-state");
 recordTitle.id="history-selected-title";recordState.id="history-selected-state";detailHead.append(recordTitle,recordState);
 var recordMeta=el("p","history-meta");recordMeta.id="history-selected-meta";
 var viewport=el("div","history-board-viewport");viewport.id="history-board-viewport";
 var stage=el("div","history-board-stage");stage.id="history-board-stage";
 var board=el("div","history-replay-board");board.id="history-replay-board";board.setAttribute("role","grid");
 var overlay=doc.createElementNS("http://www.w3.org/2000/svg","svg");overlay.id="history-replay-overlay";overlay.classList.add("history-replay-overlay");overlay.setAttribute("aria-hidden","true");
 var draftOverlay=doc.createElementNS("http://www.w3.org/2000/svg","svg");draftOverlay.id="history-draft-overlay";draftOverlay.setAttribute("aria-hidden","true");draftOverlay.style.cssText="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible";
 stage.append(board,overlay,draftOverlay);viewport.appendChild(stage);
 var diagramHint=el("p","history-diagram-hint");diagramHint.id="history-diagram-hint";
 var actionLine=el("div","history-action-line"),actionLabel=el("strong"),stepTime=el("span","history-step-time");
 actionLabel.id="history-action-label";actionLabel.setAttribute("aria-live","polite");stepTime.id="history-step-time";actionLine.append(actionLabel,stepTime);
 var slider=el("input","history-replay-slider");slider.id="history-replay-slider";slider.type="range";slider.min="0";slider.max="0";slider.value="0";slider.step="1";slider.setAttribute("aria-label","选择回放步骤");
 var playback=el("div","history-playback"),previous=btn("history-prev","← 上一步","secondary-btn"),play=btn("history-play","播放","secondary-btn"),next=btn("history-next","下一步 →","secondary-btn");
 playback.append(previous,play,next);
 var replayNote=el("p","history-replay-note");replayNote.id="history-replay-note";
 var actions=el("div","history-actions"),resume=btn("history-resume","继续这一局","primary-btn"),restart=btn("history-restart","重新挑战","secondary-btn");var favorite=btn("history-favorite","收藏题目","secondary-btn");favorite.disabled=typeof hooks.onFavorite!=="function";var practice=btn("history-practice","从此步独立复练","secondary-btn");practice.disabled=typeof hooks.onPractice!=="function";actions.append(resume,restart,favorite,practice);
 var review=el("details","history-review"),reviewTitle=el("summary","","本局复盘 · 已记录事件"),reviewSummary=el("p","history-review-summary"),reviewEvents=el("div","history-review-events"),draftSummary=el("p","history-draft-summary");review.id="history-review";review.append(reviewTitle,reviewSummary,reviewEvents);
 detail.append(detailHead,recordMeta,viewport,diagramHint,draftSummary,actionLine,slider,playback,replayNote,review,actions);main.append(sidebar,detail);
 var retention=el("p","history-retention");retention.id="history-retention";
 dialog.append(closeButton,heading,intro,main,retention);doc.body.appendChild(dialog);
 var checkpointPanel=el("details","checkpoint-panel"),checkpointTitle=el("summary","","我的卡点"),checkpointNote=el("p","checkpoint-scope",Checkpoints.scope),checkpointStatus=el("p","checkpoint-status"),checkpointRows=el("div","checkpoint-list"),checkpointFilter=el("div","checkpoint-filters"),checkpointMore=btn("checkpoint-more","再显示 40 条","secondary-btn");
 checkpointPanel.id="checkpoint-panel";checkpointPanel.setAttribute("aria-labelledby","checkpoint-title");checkpointTitle.id="checkpoint-title";checkpointStatus.id="checkpoint-status";checkpointStatus.setAttribute("role","status");checkpointFilter.setAttribute("role","group");checkpointFilter.setAttribute("aria-label","卡点类型");
 var checkpointKind='all',checkpointLimit=40;
 [['all','全部'],['manual','我的标记'],['hint','提示'],['mistake','失误计数'],['undo','撤销'],['rewrite','反复改写']].forEach(function(item){var b=btn('',item[1],'secondary-btn');b.dataset.checkpointKind=item[0];b.addEventListener('click',function(){checkpointKind=item[0];checkpointLimit=40;renderCheckpoints();});checkpointFilter.appendChild(b);});
 var checkpointMarkCurrent=btn("checkpoint-mark-current","标记当前局进度","secondary-btn"),checkpointMarkFrame=btn("checkpoint-mark-frame","标记此回放步","secondary-btn"),checkpointLabel=el("input","checkpoint-label");checkpointLabel.id="checkpoint-label";checkpointLabel.type="text";checkpointLabel.maxLength=80;checkpointLabel.placeholder="可选备注，如：想再看这个改写";checkpointLabel.setAttribute("aria-label","卡点备注，最多 80 字");
 checkpointPanel.append(checkpointTitle,checkpointNote,checkpointFilter,checkpointMarkCurrent,checkpointLabel,checkpointStatus,checkpointRows,checkpointMore);intro.after(checkpointPanel);playback.appendChild(checkpointMarkFrame);
 var selectedId=null,selectedRecord=null,frameIndex=0,interval=null,frameCells=[],previewContext=null,previewLayout=null;
 function anchor(){return selectedRecord?{id:selectedId,absolute:selectedRecord.droppedSteps+frameIndex}:null;}
 function resyncAnchor(saved){
   if(!saved)return true;var fresh=getStore().get(saved.id);select(saved.id);
   if(!fresh||saved.absolute<fresh.droppedSteps||saved.absolute>fresh.droppedSteps+fresh.steps.length){
     checkpointMarkFrame.disabled=true;practice.disabled=true;checkpointStatus.textContent+=' 原回放步骤已被容量清理，请重新选择一个保留步骤后再标记。';return false;
   }
   frameIndex=saved.absolute-fresh.droppedSteps;renderFrame();return true;
 }
 function renderCheckpoints(){
   checkpointFilter.querySelectorAll('button').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.checkpointKind===checkpointKind));});
   var items=getStore().checkpoints({kind:checkpointKind});checkpointRows.replaceChildren();checkpointMore.hidden=items.length<=checkpointLimit;
   checkpointMarkCurrent.disabled=!getStore().status().currentId;
   if(!items.length){checkpointRows.appendChild(el('p','checkpoint-empty','暂时没有符合条件的卡点。自动条目来自保留的真实日志；也可以主动标记当前局或回放步骤。'));return;}
   items.slice(0,checkpointLimit).forEach(function(point){var row=el('article','checkpoint-row');row.dataset.checkpointKey=point.sessionId+':'+point.id;var label=el('strong','',modeName(point.mode)+' · '+(point.kind==='manual'?'我的标记':'日志线索')),text=el('p','',point.label),meta=el('small','',point.available?'原记录第 '+point.absoluteStep+' 步':'原记录第 '+point.absoluteStep+' 步已清理，不能精确回看');
     var actions=el('div','checkpoint-actions'),view=btn('',point.available?'回看这一刻':'原步骤已清理','secondary-btn'),resumePoint=btn('',point.completed?'重新挑战':'继续最新进度','secondary-btn');view.disabled=!point.available;view.addEventListener('click',function(){flush();var fresh=getStore().get(point.sessionId);if(!fresh||point.absoluteStep<fresh.droppedSteps||point.absoluteStep>fresh.droppedSteps+fresh.steps.length){checkpointStatus.textContent='原步骤已清理，不能精确回看。';renderCheckpoints();return;}open(point.sessionId,point.absoluteStep-fresh.droppedSteps);slider.focus();});resumePoint.disabled=typeof(point.completed?hooks.onReplayNew:hooks.onResume)!=='function';resumePoint.addEventListener('click',function(){selectedId=point.sessionId;restore(point.completed?hooks.onReplayNew:hooks.onResume);});actions.append(view,resumePoint);
     var practicePoint=btn('','独立复练','secondary-btn');practicePoint.disabled=!point.available||typeof hooks.onPractice!=='function';practicePoint.title='保留当时的数字、候选与草稿，另开副本';practicePoint.addEventListener('click',function(){practiceFrame(point.sessionId,point.absoluteStep);});actions.appendChild(practicePoint);
     if(point.kind==='manual'){var remove=btn('','取消标记','secondary-btn');remove.addEventListener('click',function(){if(persistenceSuspended)return;var saved=anchor(),ok=getStore().removeCheckpoint(point.sessionId,point.id);checkpointStatus.textContent=ok?'已取消标记，棋局和回放不受影响。':'标记已在本次会话取消，但本机保存暂不可用。';resyncAnchor(saved);renderCheckpoints();checkpointMarkCurrent.focus();});actions.appendChild(remove);}
     row.append(label,text,meta,actions);checkpointRows.appendChild(row);
   });
 }
 async function practiceFrame(id,absoluteStep){
   if(persistenceSuspended||typeof hooks.onPractice!=='function')return;
   stop();flush();practice.disabled=true;
   try{var snapshot=getStore().practiceAt(id,absoluteStep);await hooks.onPractice(snapshot);}
   catch(error){checkpointStatus.textContent=error.message;if(hooks.toast)hooks.toast(error.message);}
   finally{practice.disabled=false;if(dialog.open)refreshList(false);}
 }
 practice.addEventListener('click',function(){if(selectedRecord)practiceFrame(selectedId,selectedRecord.droppedSteps+frameIndex);});
 function markPoint(id,index){try{if(persistenceSuspended)throw new Error('数据恢复期间暂不能修改卡点。');checkpointPanel.open=true;var saved=anchor(),result=getStore().markCheckpoint(id,index,checkpointLabel.value);checkpointLabel.value='';checkpointStatus.textContent=result.persisted?'已保存卡点，可从列表精确回看。':'已标记本次会话，但本机保存暂不可用；请勿依赖关闭后的保留。';resyncAnchor(saved);renderCheckpoints();}catch(error){checkpointStatus.textContent=error.message;}}
 checkpointMarkCurrent.addEventListener('click',function(){var id=getStore().status().currentId,r=getStore().get(id);if(r)markPoint(id,r.steps.length);});
 checkpointMarkFrame.addEventListener('click',function(){if(selectedId)markPoint(selectedId,frameIndex);});
 checkpointMore.addEventListener('click',function(){checkpointLimit+=40;renderCheckpoints();(checkpointMore.hidden?checkpointFilter.querySelector('[aria-pressed="true"]'):checkpointMore).focus();});
 function modeName(id){var m=hooks.Engine.getModes().find(function(x){return x.id===id;});return m?m.label:id;}
 function difficultyName(mode,id){var d=hooks.Engine.getDifficulties(mode).find(function(x){return x.id===id;});return d?d.label:id;}
 function dateLabel(x){try{return new Date(x).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});}catch(e){return "";}}
 function timeLabel(x){var s=Math.floor(Math.max(0,x)/1000);return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");}
 function stop(){if(interval!==null)clearInterval(interval);interval=null;play.textContent="播放";play.setAttribute("aria-pressed","false");}
 function refreshList(selectDefault){
   renderCheckpoints();
   var summaries=getStore().getRecords(),status=getStore().status();countLabel.textContent=summaries.length+" 局";list.replaceChildren();
   var filtered=summaries.filter(function(r){return filter.value==="all"||(filter.value==="completed"?r.completed:!r.completed);});empty.hidden=filtered.length!==0;
   filtered.forEach(function(r){
     var row=btn("","","history-row");row.dataset.sessionId=r.sessionId;row.setAttribute("aria-pressed",String(r.sessionId===selectedId));
     var top=el("span","history-row-top"),label=el("strong","",modeName(r.mode)),badge=el("small","history-row-badge",r.current?"当前":r.completed?"已完成":r.started?"未完成":"待开始");
     top.append(label,badge);row.append(top,el("span","history-row-sub",difficultyName(r.mode,r.difficulty)+" · "+dateLabel(r.updatedAt)),el("span","history-row-bottom",r.filled+"/"+r.total+" 格 · "+timeLabel(r.elapsedMs)));
     row.addEventListener("click",function(){select(r.sessionId);});list.appendChild(row);
   });
   retention.textContent=status.persistenceFailed?"本次历史暂未保存到本机，关闭窗口后新记录可能丢失。当前棋局仍由游戏单独保存。":
     "历史只保存在本机。最多保留 40 局，优先保留未完成棋局；容量不足时会清理较早记录。回放每局最多保留 3000 步。"+(status.removedRecords?" 已按保留策略清理 "+status.removedRecords+" 局较早记录。":"");
   if(selectDefault&&(!selectedId||!filtered.some(function(r){return r.sessionId===selectedId;}))){if(filtered.length)select(filtered[0].sessionId);else{selectedId=null;selectedRecord=null;detail.hidden=true;}}
 }
 function fallbackLayout(n){return {rows:9,columns:9,cellCount:n,boards:[{id:"main",label:"棋盘",row:0,col:0}],cells:Array.from({length:n},function(_,i){return {row:Math.floor(i/9),col:i%9,boards:[]};})};}
 function drawPreview(){
   if(!selectedRecord)return;var g=selectedRecord.snapshot.game;previewContext={mode:g.mode,clues:g.clues};
   previewLayout=hooks.Engine.getLayout?hooks.Engine.getLayout(previewContext):fallbackLayout(g.board.length);
   var multi=previewLayout.cellCount>81,regions=g.clues&&g.clues.regions;
   var arrowBulbCells=new Set((g.clues&&g.clues.lines||[]).filter(function(line){return line.type==="arrow"&&Array.isArray(line.cells)&&line.cells.length;}).map(function(line){return line.cells[0];}));
   stage.dataset.multi=String(multi);viewport.classList.remove("has-outside");stage.style.setProperty("--history-columns",previewLayout.columns);
   stage.style.aspectRatio=previewLayout.columns+" / "+previewLayout.rows;board.replaceChildren();frameCells=[];
   board.style.gridTemplateColumns="repeat("+previewLayout.columns+",minmax(0,1fr))";board.style.gridTemplateRows="repeat("+previewLayout.rows+",minmax(0,1fr))";
   board.setAttribute("aria-rowcount",String(previewLayout.rows));board.setAttribute("aria-colcount",String(previewLayout.columns));
   previewLayout.cells.forEach(function(loc,i){
     var cell=el("div","history-cell"),value=el("span","history-value"),notes=el("span","history-notes");
     cell.dataset.index=String(i);cell.style.gridRow=String(loc.row+1);cell.style.gridColumn=String(loc.col+1);cell.setAttribute("role","gridcell");cell.setAttribute("aria-rowindex",String(loc.row+1));cell.setAttribute("aria-colindex",String(loc.col+1));cell.setAttribute("aria-readonly","true");
     if(g.givens[i])cell.classList.add("given");if(loc.boards&&loc.boards.length>1)cell.classList.add("shared");
     if(!multi&&arrowBulbCells.has(i))cell.classList.add("arrow-bulb-cell");
     var top=loc.row%3===0,left=loc.col%3===0,right=loc.col%3===2,bottom=loc.row%3===2;
     if(g.mode==="jigsaw"&&Array.isArray(regions)){top=loc.row===0||regions[i-9]!==regions[i];bottom=loc.row===8||regions[i+9]!==regions[i];left=loc.col===0||regions[i-1]!==regions[i];right=loc.col===8||regions[i+1]!==regions[i];}
     if(top)cell.classList.add("edge-top");if(left)cell.classList.add("edge-left");if(right)cell.classList.add("edge-right");if(bottom)cell.classList.add("edge-bottom");
     if(hooks.Engine.getCellDecorations)hooks.Engine.getCellDecorations(i,previewContext).forEach(function(cls){cell.classList.add(cls);});
     for(var d=1;d<=9;d++)notes.appendChild(el("span"));cell.append(value,notes,el("span","history-draft-mark"),el("span","draft-color-layer"));board.appendChild(cell);frameCells.push(cell);
   });
   // A fresh SVG also resets the renderer's per-element cache when switching
   // from a multi-board view back to the same single-board clues.
   var fresh=doc.createElementNS("http://www.w3.org/2000/svg","svg");
   fresh.id="history-replay-overlay";fresh.classList.add("history-replay-overlay");fresh.setAttribute("aria-hidden","true");
   overlay.replaceWith(fresh);overlay=fresh;
   if(!multi&&hooks.VariantView&&hooks.VariantView.render){var rendered=hooks.VariantView.render(overlay,previewContext);viewport.classList.toggle("has-outside",Boolean(rendered&&rendered.hasOutside));}
   var modeInfo=hooks.Engine.getModes().find(function(m){return m.id===g.mode;});
   diagramHint.textContent=multi?"浅色宫是共享区域；可滚动查看整组棋盘。":modeInfo&&modeInfo.description||"";diagramHint.hidden=!multi&&g.mode==="classic";
 }

 function renderFrame(){
   if(!selectedRecord)return;var f=getStore().frameAt(selectedId,frameIndex);if(!f)return;frameIndex=f.index;var changed=new Set(f.changed),g=selectedRecord.snapshot.game;
   var draft=Drafts.validate(f.draft,f.board.length,g.clues||{});
   frameCells.forEach(function(cell,i){
     cell.dataset.draftColor=String(draft.colors[i]);cell.dataset.draftMark=String(draft.marks[i]);cell.querySelector(".history-draft-mark").textContent=["","◎","?","×"][draft.marks[i]];
     var value=f.board[i],mask=f.notes[i];cell.querySelector(".history-value").textContent=value?String(value):"";
     Array.prototype.forEach.call(cell.querySelectorAll(".history-notes span"),function(span,d){span.textContent=!value&&(mask&(1<<d))?String(d+1):"";});
     cell.classList.toggle("replay-changed",changed.has(i));
     var coordinate=hooks.Engine.getCellLabel?hooks.Engine.getCellLabel(i,previewContext):"第 "+(Math.floor(i/9)+1)+" 行，第 "+(i%9+1)+" 列";
     cell.setAttribute("aria-label",coordinate+"，"+(value?"数字 "+value:"空格")+(g.givens[i]?"，题目给定":"")+(draft.colors[i]?"，草稿色组 "+draft.colors[i]:"")+(draft.marks[i]?"，草稿标记 "+["","关注","待核对","暂排除"][draft.marks[i]]:""));
   });
   draftOverlay.replaceChildren();draftOverlay.setAttribute("viewBox","0 0 "+previewLayout.columns*100+" "+previewLayout.rows*100);
   draft.links.forEach(function(link){var a=previewLayout.cells[link.a],b=previewLayout.cells[link.b],line=doc.createElementNS("http://www.w3.org/2000/svg","line");line.setAttribute("x1",a.col*100+50);line.setAttribute("y1",a.row*100+50);line.setAttribute("x2",b.col*100+50);line.setAttribute("y2",b.row*100+50);line.setAttribute("stroke","var(--accent)");line.setAttribute("stroke-width","4");line.setAttribute("stroke-opacity",".7");if(link.type!=='same')line.setAttribute("stroke-dasharray",link.type==='different'?'10 5':'3 8');line.dataset.linkType=link.type;draftOverlay.appendChild(line);});
   draftSummary.textContent=(draft.links.length?'草稿连线 '+draft.links.length+' 条（玩家假设，不是规则）。 ':'')+draft.cages.map(function(c){return '笼 '+(c.index+1)+' 备选：'+(c.combinations.length?c.combinations.map(function(m){return Drafts.values(m).join('+');}).join(' / '):'暂不保留组合');}).join('；');draftSummary.hidden=!draftSummary.textContent;
   board.setAttribute("aria-label",modeName(g.mode)+"回放，第 "+frameIndex+" 步，共 "+f.totalSteps+" 步");
   slider.max=String(f.totalSteps);slider.value=String(frameIndex);slider.disabled=f.totalSteps===0;slider.setAttribute("aria-valuetext","第 "+frameIndex+" 步，共 "+f.totalSteps+" 步，"+f.action);
   previous.disabled=frameIndex<=0;next.disabled=frameIndex>=f.totalSteps;play.disabled=f.totalSteps===0;
   actionLabel.textContent=frameIndex+" / "+f.totalSteps+" · "+f.action+(f.branch?" · "+(f.branchLabel||"假设中"):"")+(f.logicMode?" · 纯逻辑":"");stepTime.textContent="累计用时 "+timeLabel(f.elapsedMs);
   var note=selectedRecord.origin==="legacy"?"从本次更新后的操作开始回放；更早的步骤没有记录。":"按当时的真实操作回放，不改变当前棋局或成绩。";
   if(selectedRecord.droppedSteps)note="较早的 "+selectedRecord.droppedSteps+" 步已清理；以下从保留起点回放最近 "+f.totalSteps+" 步。";
   if(selectedRecord.replayRecovered)note="这局较早的回放数据无法读取，已保留可继续的棋局，并从该状态重新记录。";
   replayNote.textContent=note;
   // Follow only inside the preview scroller. Never move the dialog itself
   // or steal focus from the playback controls.
   var focusIndex=changed.has(f.selected)?f.selected:(f.changed.length?f.changed[0]:f.selected);
   var focusCell=frameCells[focusIndex];
   if(focusCell&&dialog.open){
     var cellBounds=focusCell.getBoundingClientRect(),viewBounds=viewport.getBoundingClientRect();
     var margin=8;
     if(viewBounds.width>0&&viewBounds.height>0){
       if(cellBounds.left<viewBounds.left+margin)viewport.scrollLeft-=viewBounds.left+margin-cellBounds.left;
       else if(cellBounds.right>viewBounds.right-margin)viewport.scrollLeft+=cellBounds.right-viewBounds.right+margin;
       if(cellBounds.top<viewBounds.top+margin)viewport.scrollTop-=viewBounds.top+margin-cellBounds.top;
       else if(cellBounds.bottom>viewBounds.bottom-margin)viewport.scrollTop+=cellBounds.bottom-viewBounds.bottom+margin;
     }
   }
 }
 function select(id){
   stop();checkpointMarkFrame.disabled=false;practice.disabled=typeof hooks.onPractice!=="function";selectedRecord=getStore().get(id);selectedId=selectedRecord?id:null;detail.hidden=!selectedRecord;if(!selectedRecord)return;
   var g=selectedRecord.snapshot.game,summary=getStore().getRecords().find(function(r){return r.sessionId===id;});
   recordTitle.textContent=modeName(g.mode)+" · "+difficultyName(g.mode,g.difficulty);recordState.textContent=g.completed?"已完成":g.started?"未完成":"待开始";
   recordMeta.textContent=dateLabel(selectedRecord.createdAt)+" 开始 · 用时 "+timeLabel(g.elapsedMs)+" · 提示 "+g.hints+" · 失误 "+g.mistakes;
   resume.hidden=Boolean(g.completed);resume.textContent=summary&&summary.current?"回到当前棋局":"继续这一局";
   var report=getStore().summarize(id);reviewSummary.textContent='记录范围：'+report.retainedSteps+' 步。提示 '+report.counts.hints+' 次，新增失误 '+report.counts.mistakes+' 次，候选变更 '+report.counts.notes+' 步，草稿 '+report.counts.drafts+' 步。'+(report.partial?'较早日志缺失，以下不是整局完整统计。':'')+report.scope;
   if(report.events.length>200)reviewSummary.textContent+=' 下方显示最近 200 个事件；可用步骤滑杆查看全部保留步骤。';
   reviewEvents.replaceChildren();report.events.slice(-200).forEach(function(event){var jump=btn('',event.stepIndex+' · '+event.action,'history-review-jump');jump.dataset.stepIndex=String(event.stepIndex);jump.addEventListener('click',function(){moveTo(event.stepIndex);});reviewEvents.appendChild(jump);});
   frameIndex=selectedRecord.steps.length;drawPreview();renderFrame();refreshList(false);
 }
 function moveTo(index){stop();checkpointMarkFrame.disabled=false;practice.disabled=typeof hooks.onPractice!=="function";frameIndex=index;renderFrame();}
 previous.addEventListener("click",function(){moveTo(frameIndex-1);});next.addEventListener("click",function(){moveTo(frameIndex+1);});slider.addEventListener("input",function(){moveTo(Number(slider.value));});
 play.setAttribute("aria-pressed","false");
 play.addEventListener("click",function(){
   if(interval!==null){stop();return;}if(!selectedRecord||!selectedRecord.steps.length)return;if(frameIndex>=selectedRecord.steps.length)frameIndex=0;
   renderFrame();play.textContent="暂停回放";play.setAttribute("aria-pressed","true");
   interval=setInterval(function(){if(!dialog.open||doc.hidden){stop();return;}frameIndex++;renderFrame();if(frameIndex>=selectedRecord.steps.length)stop();},650);
 });
 function close(){stop();flush();if(!dialog.open)return;if(typeof dialog.close==="function")dialog.close();else{dialog.removeAttribute("open");dialog.dispatchEvent(new Event("close"));}}
 closeButton.addEventListener("click",close);dialog.addEventListener("close",function(){stop();flush();if(hooks.afterClose)hooks.afterClose();});dialog.addEventListener("cancel",stop);
 doc.addEventListener("visibilitychange",function(){if(doc.hidden){stop();flush();}});root.addEventListener("pagehide",flush);root.addEventListener("beforeunload",flush);
 filter.addEventListener("change",function(){stop();refreshList(true);});
 function open(targetId,targetStep){if(doc.querySelector("dialog[open]")&&!dialog.open)return;flush();if(typeof targetId==="string"&&getStore().getSnapshot(targetId)){selectedId=targetId;filter.value="all";}refreshList(true);if(root.NineRealmsSelect)root.NineRealmsSelect.syncAll();if(selectedId)select(selectedId);if(Number.isInteger(targetStep))frameIndex=Math.max(0,targetStep);if(!dialog.open)hooks.openDialog(dialog);renderFrame();stop();}
 var opener=doc.getElementById("history-open");if(opener)opener.addEventListener("click",open);
 async function restore(callback){
   if(!selectedId||typeof callback!=="function")return;stop();flush();var snapshot=getStore().getSnapshot(selectedId);if(!snapshot)return;
   resume.disabled=restart.disabled=true;
   try{await callback(snapshot);}catch(e){if(hooks.toast)hooks.toast("这局暂时无法载入，当前棋局已保留。");}
   finally{resume.disabled=restart.disabled=false;if(dialog.open)refreshList(false);}
 }
 favorite.addEventListener("click",function(){if(!selectedId||typeof hooks.onFavorite!=="function")return;try{hooks.onFavorite(getStore().getSnapshot(selectedId));}catch(e){if(hooks.toast)hooks.toast("收藏暂未保存，原有数据已保留。");}});
 resume.addEventListener("click",function(){restore(hooks.onResume);});restart.addEventListener("click",function(){restore(hooks.onReplayNew);});
 ui={dialog:dialog,open:open,close:close,refreshList:refreshList,anchor:anchor,resyncAnchor:resyncAnchor};return api;
}
var api={practiceInfo:practiceInfo,KEY:KEY,limits:copy(LIMITS),createStore:createStore,createSessionId:createSessionId,init:init,capture:capture,flush:flush,exportData:function(){return getStore().exportData();},getRecords:function(){return getStore().getRecords();},getSnapshot:function(id){return getStore().getSnapshot(id);},practiceAt:function(id,absoluteStep){if(persistenceSuspended)throw new Error("数据恢复期间暂不能创建复练。");return getStore().practiceAt(id,absoluteStep);},summarize:function(id){return getStore().summarize(id);},checkpoints:function(filter){return getStore().checkpoints(filter);},markCheckpoint:function(id,index,label){if(persistenceSuspended)throw new Error("数据恢复期间暂不能修改卡点。");var saved=ui&&ui.dialog.open?ui.anchor():null,result=getStore().markCheckpoint(id,index,label);if(ui&&ui.dialog.open){ui.resyncAnchor(saved);ui.refreshList(false);}return result;},markCurrent:function(label){var state=getStore().status(),record=getStore().get(state.currentId);if(!record)throw new Error("当前棋局还没有可保留的历史记录。");return api.markCheckpoint(record.sessionId,record.steps.length,label);},openCheckpoints:function(){if(ui){ui.open();if(!ui.dialog.open)return;var panel=root.document.getElementById('checkpoint-panel');if(panel){panel.open=true;panel.scrollIntoView({block:'nearest'});}var button=root.document.getElementById('checkpoint-mark-current');if(button)button.focus();}},suspendPersistence:suspendPersistence,open:function(id,stepIndex){if(ui)ui.open(id,stepIndex);},close:function(){if(ui)ui.close();}};
return api;
});
