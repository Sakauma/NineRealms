/* Optional practice uses its own board; no live-game mutations or implied mastery. */
(function(root){'use strict';root.NineRealmsTrainingUI=function(options){
 var T=root.NineRealmsTraining,doc=root.document,$=function(id){return doc.getElementById(id);},current=null,selected=-1,stage=0,finished=false;
 function button(text,fn){var b=doc.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',fn);return b;}
 function render(){if(!current)return;var exercise=T.exercise(current),progress=options.progress(),focused=doc.activeElement,restore=focused&&focused.dataset.practiceCell;
 $('training-task').textContent=exercise.task;$('training-scope').textContent=exercise.candidateNote||exercise.scope;
 $('training-title').textContent=exercise.title;var guidance=T.explain(current,stage);$('training-explanation').textContent=guidance.text+(stage===1&&guidance.prior&&guidance.prior.length?'\n前置证明：\n'+guidance.prior.map(function(p){return p.explanation||p.title||JSON.stringify(p);}).join('\n'):'')+(stage===2&&guidance.eliminations?'\n'+guidance.eliminations.map(function(c){return (exercise.local?exercise.cellLabels[exercise.viewCells.indexOf(c.index)]:'第 '+(Math.floor(c.index/9)+1)+' 行第 '+(c.index%9+1)+' 列')+'可排除 '+c.values.join('、');}).join('；'):'');
 $('training-next').textContent=stage===0?'查看证明前提':stage===1?'查看完整讲解（含排除答案）':'已展示完整讲解';$('training-next').disabled=stage===2;
 $('training-progress').textContent='已完成练习 '+progress.completed.length+' / '+T.exercises().length+'（可包含引导，不代表已掌握全部技巧）';
 $('training-exercises').querySelectorAll('button').forEach(function(b){var done=progress.completed.indexOf(b.dataset.exercise)>=0;b.setAttribute('aria-pressed',String(b.dataset.exercise===current));b.dataset.complete=String(done);b.textContent=(done?'✓ ':'')+b.dataset.title;});
 var board=$('training-board'),cells=[],indices=exercise.viewCells||Array.from({length:81},function(_,i){return i;});
 board.replaceChildren();board.dataset.local=String(Boolean(exercise.local));board.style.setProperty('--local-cells',String(indices.length));
 board.setAttribute('role',exercise.local?'group':'grid');board.setAttribute('aria-label',exercise.local?exercise.ruleLabel+'，局部候选练习':'独立候选练习棋盘');
 if(exercise.local){board.removeAttribute('aria-rowcount');board.removeAttribute('aria-colcount');}else{board.setAttribute('aria-rowcount','9');board.setAttribute('aria-colcount','9');}
 $('training-rule-label').textContent=exercise.ruleLabel||'';$('training-rule-label').hidden=!exercise.local;
 var firstEmpty=indices.find(function(i){return !exercise.board[i];});
 indices.forEach(function(i,position){
  var value=exercise.board[i],b=button('',function(){selected=i;render();var target=board.querySelector('[data-practice-cell="'+i+'"]');if(target)target.focus();});
  b.dataset.practiceCell=String(i);b.setAttribute('role',exercise.local?'button':'gridcell');b.setAttribute('aria-selected',String(i===selected));
  if(!exercise.local){b.setAttribute('aria-rowindex',String(Math.floor(i/9)+1));b.setAttribute('aria-colindex',String(i%9+1));}
  b.className='training-cell'+(i===selected?' selected':'')+(exercise.focusCells.indexOf(i)>=0?' evidence':'');b.disabled=Boolean(value);
  var digits=[];for(var n=1;n<=9;n++)if(exercise.candidateMasks[i]&(1<<(n-1)))digits.push(n);
  if(value)b.textContent=String(value);else{var candidates=doc.createElement('span');candidates.className='training-candidates';candidates.setAttribute('aria-hidden','true');for(var digit=1;digit<=9;digit++){var slot=doc.createElement('span');slot.textContent=digits.indexOf(digit)>=0?String(digit):'';candidates.appendChild(slot);}b.appendChild(candidates);}
  b.classList.toggle('candidate',!value);
  b.setAttribute('aria-label',(exercise.local?exercise.cellLabels[position]+'，':'第 '+(Math.floor(i/9)+1)+' 行第 '+(i%9+1)+' 列，')+(value?'已填 '+value:'候选 '+digits.join('、')));
  if(exercise.local){b.setAttribute('aria-pressed',String(i===selected));b.removeAttribute('aria-selected');var title=doc.createElement('small');title.className='local-cell-label';title.textContent=exercise.cellLabels[position];b.appendChild(title);}
  b.tabIndex=!value&&(i===selected||selected<0&&i===firstEmpty)?0:-1;board.appendChild(b);cells.push(b);
 });
 if(!exercise.local)root.NineRealmsGridRows.wrap(board,cells);
 if(restore!==undefined){var next=board.querySelector('[data-practice-cell="'+restore+'"]');if(next&&!next.disabled)next.focus();}
 $('training-selection').textContent=selected<0?'先选择一个空格，再选要排除的候选数字。':'当前选择：'+(exercise.local?exercise.cellLabels[exercise.viewCells.indexOf(selected)]:'第 '+(Math.floor(selected/9)+1)+' 行第 '+(selected%9+1)+' 列')+'。';
 }
 function choose(id){current=id;selected=-1;stage=0;finished=false;$('training-feedback').textContent='';render();}
 function open(station){if(options.blocked())return;var all=T.exercises(),list=station?all.filter(function(e){return e.stationId===station||e.technique===station;}):all;if(!list.length)list=all;
 var holder=$('training-exercises');holder.replaceChildren();list.forEach(function(e){var b=button(e.title,function(){choose(e.id);});b.dataset.exercise=e.id;b.dataset.title=e.title;holder.appendChild(b);});choose(list[0].id);options.open($('training-dialog'));}
 for(var digit=1;digit<=9;digit++)(function(n){$('training-digits').appendChild(button('排除 '+n,function(){if(!current||selected<0){$('training-feedback').textContent='请先选择一个空格。';return;}var result=T.check(current,selected,n);$('training-feedback').textContent=result.message;if(result.ok){try{options.success(current,selected,n);finished=true;render();$('training-feedback').textContent=result.message+' 已记录这项练习；正式棋局、提示次数和星级没有改变。';}catch(e){$('training-feedback').textContent=e.message;}}}));})(digit);
 $('training-next').addEventListener('click',function(){stage=Math.min(2,stage+1);render();if(stage===2){var target=$('training-board').querySelector('[data-practice-cell="'+selected+'"]')||$('training-board').querySelector('button:not(:disabled)');if(target)target.focus();}});
 $('training-close').addEventListener('click',function(){options.close($('training-dialog'));});$('training-dialog').addEventListener('close',options.afterClose);
 $('training-dialog').addEventListener('keydown',function(e){
  if(e.key==='Escape')return;e.stopPropagation();var target=e.target.closest('[data-practice-cell]');if(!target)return;
  var exercise=T.exercise(current),index=Number(target.dataset.practiceCell),delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-9,ArrowDown:9}[e.key];if(!delta)return;e.preventDefault();
  if(exercise.local){var list=exercise.viewCells,step=delta<0?-1:1;for(var p=list.indexOf(index)+step;p>=0&&p<list.length;p+=step)if(!exercise.board[list[p]]){selected=list[p];render();$('training-board').querySelector('[data-practice-cell="'+selected+'"]').focus();break;}return;}
  for(var i=index+delta;i>=0&&i<81;i+=delta){if(Math.abs(delta)===1&&Math.floor(i/9)!==Math.floor(index/9))break;if(!exercise.board[i]){selected=i;render();$('training-board').querySelector('[data-practice-cell="'+i+'"]').focus();break;}}
 });
 return {open:open,render:render};
};})(window);
