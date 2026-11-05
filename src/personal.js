/* My puzzles and backup dialogs. Game/session operations are supplied by the controller. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.NineRealmsPersonal=factory;})(typeof globalThis!=='undefined'?globalThis:this,function(options){
 'use strict';
 var doc=options.document||document,$=function(id){return doc.getElementById(id);};
 var store=options.store,pending=null,epoch=0,busy=false;
 function message(id,text){$(id).textContent=text;}
 function button(text,action){var b=doc.createElement('button');b.type='button';b.className='secondary-btn';b.textContent=text;b.addEventListener('click',action);return b;}
 function report(error){
  var code=error&&error.code||error&&error.message;
  var names={FAVORITES_LIMIT:'收藏已达到200题上限，请先取消一些收藏。',FAVORITES_SIZE_LIMIT:'收藏容量已满，请先取消一些收藏。',FAVORITES_CHANGED_IN_OTHER_WINDOW:'收藏已在其他窗口修改，请重新打开游戏后再试。',FAVORITE_NOT_UNIQUE:'当前题面未能完成唯一性验证，未写入收藏。'};
  message('personal-status',names[code]||'操作未完成，原有收藏已保留。请检查本机存储权限或空间后重试。');
 }
 function refreshCurrent(){var current=options.current(),found=store&&current?store.find(current):null;var b=$('favorite-current');b.disabled=!store||!current||Boolean(found);b.textContent=found?'当前题目已收藏':'收藏当前题目';}
 function render(){
  var active=doc.activeElement,prior=active&&active.closest&&active.closest('.personal-card');
  var restoreId=prior&&prior.dataset.recordId,restoreAction=active&&active.dataset&&active.dataset.action;
  refreshCurrent();var list=$('personal-list');list.replaceChildren();
  if(!store){message('personal-status','收藏数据暂时无法读取，原数据未被覆盖。可以使用数据备份恢复。');return;}
  var records=store.list({mode:$('personal-mode').value||undefined,status:$('personal-filter').value});
  message('personal-count',records.length+' 道题目');
  if(!records.length){var empty=doc.createElement('p');empty.className='personal-empty';empty.textContent='这里还没有题目。收藏当前棋局，或试试其他筛选。';list.appendChild(empty);}
  records.forEach(function(record){
   var card=doc.createElement('article');card.className='personal-card';card.dataset.recordId=record.id;
   var heading=doc.createElement('h3'),mode=options.modes.find(function(m){return m.id===record.puzzle.mode;});heading.textContent=(mode?mode.label:record.puzzle.mode)+' · '+record.id;card.appendChild(heading);
   var detail=doc.createElement('p');detail.textContent=record.puzzle.givens.filter(Boolean).length+' 个给定数 · '+(record.completed?'已完成':'未完成')+(record.later?' · 稍后再玩':'');card.appendChild(detail);
   var actions=doc.createElement('div');actions.className='personal-card-actions';
   var available=options.resumeAvailable(record);
   var resume=button('继续',async function(){try{await options.play(record,false);}catch(e){report(e);}});resume.disabled=!available;resume.title=available?'继续最近的未完成棋局':'没有保留的未完成会话，可重新挑战';actions.appendChild(resume);
   actions.appendChild(button('重新挑战',async function(){try{await options.play(record,true);}catch(e){report(e);}}));
   var later=button(record.later?'取消稍后':'稍后再玩',function(){try{store.setLater(record.id,!record.later);render();}catch(e){report(e);}});later.setAttribute('aria-pressed',String(record.later));actions.appendChild(later);
   actions.appendChild(button('历史',function(){options.history(record);}));
   actions.appendChild(button('取消收藏',function(){try{store.remove(record.id);render();message('personal-status','已取消收藏，棋局历史和当前进度不受影响。');}catch(e){report(e);}}));
   Array.from(actions.children).forEach(function(b,index){b.dataset.action=String(index);});
   card.appendChild(actions);list.appendChild(card);
  });
  if(restoreId){var same=Array.from(list.querySelectorAll('.personal-card')).find(function(c){return c.dataset.recordId===restoreId;});var target=same&&same.querySelector('[data-action="'+restoreAction+'"]');(target||list.querySelector('button:not(:disabled)')||$('personal-filter')).focus();}
 }
 options.modes.forEach(function(m){var op=doc.createElement('option');op.value=m.id;op.textContent=m.label;$('personal-mode').appendChild(op);});
 $('personal-open').addEventListener('click',function(){if(options.blocked())return;options.open($('personal-dialog'));options.save();message('personal-status','');render();});
 $('personal-close').addEventListener('click',function(){options.close($('personal-dialog'));});
 $('personal-dialog').addEventListener('close',options.afterClose);
 ['personal-mode','personal-filter'].forEach(function(id){$(id).addEventListener('change',render);});
 $('favorite-current').addEventListener('click',function(){try{var current=options.current();store.add(current,{sessionId:current.sessionId,completed:current.completed,later:false});render();var target=$('personal-list').querySelector('button:not(:disabled)');(target||$('personal-filter')).focus();message('personal-status','已收藏实际题面和完整线索，不依赖随机种子重建。');}catch(e){report(e);}});
 function resetImport(){epoch++;pending=null;$('backup-replace').disabled=true;$('backup-confirm').checked=false;$('backup-preview').textContent='';}
 $('backup-open').addEventListener('click',function(){if(options.blocked())return;options.open($('backup-dialog'));resetImport();message('backup-status','');});
 $('backup-close').addEventListener('click',function(){if(!busy&&!options.locked())options.close($('backup-dialog'));});
 $('backup-dialog').addEventListener('cancel',function(event){if(busy||options.locked())event.preventDefault();});
 $('backup-dialog').addEventListener('close',function(){resetImport();options.afterClose();});
 $('backup-export').addEventListener('click',async function(){try{var saved=await options.exportBackup();message('backup-status',saved===false?'已取消保存，当前数据保留。':options.nativeSave&&options.nativeSave()?'备份文件已保存。':'备份文件已准备下载，请保存到安全位置。');}catch(e){message('backup-status',e.message||'备份保存未完成。');}});
 $('backup-file').addEventListener('change',async function(){
  resetImport();var request=epoch,file=this.files&&this.files[0];if(!file)return;
  if(file.size>options.maxBackupBytes){message('backup-status','文件过大，请选择九境导出的备份文件。');return;}
  busy=true;$('backup-file').disabled=true;$('backup-confirm').disabled=true;message('backup-status','正在检查备份内容，不会修改当前数据……');
  try{var result=await options.prepareBackup(await file.text());if(request!==epoch)return;pending=result.validated;message('backup-preview',result.summary);message('backup-status','校验通过。确认下方说明后，才能替换本机进度。');}
  catch(e){message('backup-status',e.message||'备份校验失败，当前数据未改变。');}
  finally{busy=false;$('backup-file').disabled=false;$('backup-confirm').disabled=false;$('backup-replace').disabled=!pending||!$('backup-confirm').checked;$('backup-file').value='';}
 });
 $('backup-confirm').addEventListener('change',function(){$('backup-replace').disabled=!pending||!this.checked||busy;});
 $('backup-replace').addEventListener('click',async function(){
  if(!pending||!$('backup-confirm').checked||busy)return;busy=true;$('backup-replace').disabled=true;message('backup-status','正在替换数据，完成后自动重新载入……');
  try{await options.commitBackup(pending);}
  catch(e){message('backup-status',e.message||'导入未完成。');if(e.recoveryRequired){message('backup-status',e.message+' 恢复日志不是普通备份，不能在导入入口使用。请保留日志并重新打开游戏重试。');['backup-file','backup-export','backup-confirm'].forEach(function(id){$(id).disabled=true;});$('backup-recovery').hidden=false;$('backup-recovery').onclick=async function(){try{await options.downloadRecovery(e.previousBackup);}catch(error){message('backup-status',error.message||'恢复日志保存未完成。');}};}}
  finally{busy=false;if(!options.locked())$('backup-replace').disabled=!pending||!$('backup-confirm').checked;}
 });
 return {refreshCurrent:refreshCurrent,render:render};
});
