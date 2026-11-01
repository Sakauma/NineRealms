/* Shared, offline select presentation. Native selects remain the state/event source. */
(function (global) {
 'use strict';
 var records=[], active=null, sequence=0, scheduled=false;
 var selector='select:not([multiple])';
 function labelFor(select){
  if(select.getAttribute('aria-label'))return select.getAttribute('aria-label');
  return Array.from(select.labels||[]).map(function(label){var copy=label.cloneNode(true);copy.querySelectorAll('select,.glass-select').forEach(function(n){n.remove();});return copy.textContent.trim();}).join(' ')||'选择';
 }
 function close(record,focus){
  if(!record)return;
  if(record.popoverOpen){try{record.panel.hidePopover();}catch(_){}record.popoverOpen=false;}
  record.panel.hidden=true;record.button.setAttribute('aria-expanded','false');record.button.removeAttribute('aria-activedescendant');
  if(active===record)active=null;
  if(focus&&!record.button.disabled)record.button.focus();
 }
 function available(record){return Array.from(record.select.options).map(function(o,i){return !o.disabled&&!o.hidden&&!(o.parentElement.tagName==='OPTGROUP'&&o.parentElement.disabled)?i:-1;}).filter(function(i){return i>=0;});}
 function highlight(record,index){
  record.index=index;
  Array.from(record.panel.children).forEach(function(node){node.classList.toggle('is-active',Number(node.dataset.index)===index);});
  var option=record.panel.querySelector('[data-index="'+index+'"]');
  if(option){record.button.setAttribute('aria-activedescendant',option.id);if(option.scrollIntoView)option.scrollIntoView({block:'nearest'});}
 }
 function place(record){
  var r=record.button.getBoundingClientRect(), vw=global.innerWidth||document.documentElement.clientWidth,vh=global.innerHeight||document.documentElement.clientHeight;
  var bounds={left:12,right:vw-12,top:12,bottom:vh-12},dialog=record.select.closest('dialog');
  if(!record.popoverOpen&&dialog){var d=dialog.getBoundingClientRect();bounds={left:Math.max(12,d.left+8),right:Math.min(vw-12,d.right-8),top:Math.max(12,d.top+8),bottom:Math.min(vh-12,d.bottom-8)};}
  var below=bounds.bottom-r.bottom-6,above=r.top-bounds.top-6,up=below<160&&above>below,space=Math.max(48,Math.min(320,up?above:below));
  var width=Math.max(48,Math.min(Math.max(r.width,200),bounds.right-bounds.left));
  record.panel.style.width=width+'px';record.panel.style.maxHeight=space+'px';
  record.panel.style.left='0px';record.panel.style.top='0px';record.panel.style.bottom='auto';
  // Fixed positioning may use a filter-containing ancestor in non-popover engines.
  var origin=record.panel.getBoundingClientRect(),left=Math.max(bounds.left,Math.min(r.left,bounds.right-width));
  var top=up?r.top-6-Math.min(record.panel.getBoundingClientRect().height,space):r.bottom+6;
  record.panel.style.left=(left-origin.left)+'px';record.panel.style.top=(top-origin.top)+'px';
 }
 function sync(record){
  var select=record.select,button=record.button,selected=select.options[select.selectedIndex];
  var text=selected?selected.textContent:'请选择',name=record.label+'：'+text;
  if(button.textContent!==text)button.textContent=text;
  if(button.disabled!==select.disabled)button.disabled=select.disabled;
  if(button.getAttribute('aria-label')!==name)button.setAttribute('aria-label',name);
  if(record.wrap.hidden!==select.hidden)record.wrap.hidden=select.hidden;
  var dialog=select.closest('dialog'),details=select.closest('details');
  if(select.disabled||select.hidden||select.closest('[hidden]')||(dialog&&!dialog.open)||(details&&!details.open))close(record,false);
  if(active===record){renderOptions(record);place(record);highlight(record,available(record).includes(record.index)?record.index:select.selectedIndex);}
 }
 function renderOptions(record){
  var signature=JSON.stringify([record.select.selectedIndex,Array.from(record.select.options).map(function(o){return [o.textContent,o.value,o.disabled,o.hidden,o.parentElement.tagName==='OPTGROUP'&&o.parentElement.disabled];})]);
  if(record.signature===signature)return;record.signature=signature;
  record.panel.replaceChildren();
  Array.from(record.select.options).forEach(function(option,index){
   if(option.hidden)return;
   var item=document.createElement('div');item.id=record.id+'-option-'+index;item.className='glass-select-option';item.dataset.index=String(index);item.setAttribute('role','option');
   item.setAttribute('aria-selected',String(index===record.select.selectedIndex));item.textContent=option.textContent;
   var disabled=option.disabled||(option.parentElement.tagName==='OPTGROUP'&&option.parentElement.disabled);item.setAttribute('aria-disabled',String(Boolean(disabled)));
   item.addEventListener('pointerdown',function(e){e.preventDefault();});
   item.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();if(!disabled)choose(record,index);});
   item.addEventListener('pointermove',function(){if(!disabled)highlight(record,index);});
   record.panel.appendChild(item);
  });
 }
 function open(record){
  sync(record);if(record.select.disabled||!available(record).length)return;
  if(active&&active!==record)close(active,false);
  active=record;renderOptions(record);record.panel.hidden=false;
  if(record.panel.showPopover){try{record.panel.showPopover();record.popoverOpen=true;}catch(_){record.panel.removeAttribute('popover');}}
  place(record);record.button.setAttribute('aria-expanded','true');highlight(record,available(record).includes(record.select.selectedIndex)?record.select.selectedIndex:available(record)[0]);
 }
 function choose(record,index){
  var changed=record.select.selectedIndex!==index;record.select.selectedIndex=index;close(record,true);sync(record);
  if(changed){record.select.dispatchEvent(new Event('input',{bubbles:true}));record.select.dispatchEvent(new Event('change',{bubbles:true}));syncAll();}
 }
 function keydown(record,e){
  if(e.key==='Escape'&&active!==record)return;
  e.stopPropagation();
  if(e.key==='Tab'){close(record,false);return;}
  if(e.key==='Escape'){if(active===record){e.preventDefault();close(record,true);}return;}
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  var keys=['ArrowDown','ArrowUp','Home','End','Enter',' '];
  if(keys.includes(e.key)){
   e.preventDefault();var wasOpen=active===record;
   if(!wasOpen){open(record);if(e.key==='Enter'||e.key===' ')return;}
   if(e.key==='Enter'||e.key===' '){choose(record,record.index);return;}
   var items=available(record),pos=items.indexOf(record.index);
   if(e.key==='Home')pos=0;else if(e.key==='End')pos=items.length-1;else pos=Math.max(0,Math.min(items.length-1,pos+(e.key==='ArrowDown'?1:-1)));
   highlight(record,items[pos]);return;
  }
  if(e.key.length===1){
   e.preventDefault();if(active!==record)open(record);
   var now=Date.now();record.search=(now-record.searchAt<700?record.search:'')+e.key.toLocaleLowerCase();record.searchAt=now;
   var items=available(record),start=items.indexOf(record.index)+1,match;
   for(var n=0;n<items.length;n++){var i=items[(start+n)%items.length];if(record.select.options[i].textContent.trim().toLocaleLowerCase().startsWith(record.search)){match=i;break;}}
   if(match!==undefined)highlight(record,match);
  }
 }
 function enhance(select){
  if(select.dataset.glassEnhanced||select.size>1)return;
  var label=labelFor(select),wrap=document.createElement('span'),button=document.createElement('button'),panel=document.createElement('div'),id='glass-select-'+(++sequence);
  wrap.className='glass-select';wrap.dataset.selectId=select.id;button.type='button';button.className='glass-select-trigger';button.id=id+'-trigger';button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',id+'-list');button.setAttribute('aria-autocomplete','none');
  panel.id=id+'-list';panel.className='glass-select-list';panel.setAttribute('role','listbox');panel.setAttribute('aria-label',label);panel.hidden=true;
  if(panel.showPopover)panel.setAttribute('popover','manual');
  var record={select:select,wrap:wrap,button:button,panel:panel,id:id,label:label,index:-1,search:'',searchAt:0};
  select.before(wrap);wrap.appendChild(button);
  // Keep the popup inside its dialog/appearance owner, but outside scroll containers.
  var owner=select.closest('dialog')||select.closest('details')||document.body;owner.appendChild(panel);
  select.classList.add('glass-select-native');select.setAttribute('aria-hidden','true');select.tabIndex=-1;select.dataset.glassEnhanced='true';
  select.focus=function(options){button.focus(options);};
  (select.labels?Array.from(select.labels):[]).forEach(function(l){l.addEventListener('click',function(e){if(e.target===l){e.preventDefault();button.focus();}});});
  button.addEventListener('click',function(e){e.preventDefault();active===record?close(record,false):open(record);});button.addEventListener('keydown',function(e){keydown(record,e);});
  select.addEventListener('change',function(){sync(record);});
  new MutationObserver(function(){sync(record);}).observe(select,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','hidden','selected','label','value']});
  records.push(record);sync(record);
 }
 function enhanceAll(){document.querySelectorAll(selector).forEach(enhance);}
 function syncAll(){enhanceAll();records.forEach(function(record){if(record.select.isConnected)sync(record);else close(record,false);});}
 document.addEventListener('pointerdown',function(e){if(active&&!active.wrap.contains(e.target)&&!active.panel.contains(e.target))close(active,false);},true);
 document.addEventListener('focusin',function(e){if(active&&!active.wrap.contains(e.target)&&!active.panel.contains(e.target))close(active,false);});
 document.addEventListener('scroll',function(e){if(active&&!active.panel.contains(e.target))close(active,false);},true);
 document.addEventListener('toggle',function(e){if(active&&e.target.tagName==='DETAILS'&&!e.target.open&&e.target.contains(active.select))close(active,false);},true);
 document.addEventListener('close',function(e){if(active&&e.target.contains(active.select))close(active,false);},true);
 global.addEventListener('resize',function(){if(active)close(active,false);});
 global.NineRealmsSelect={syncAll:syncAll,enhanceAll:enhanceAll,close:function(){close(active,false);}};
 new MutationObserver(function(mutations){if(!mutations.some(function(m){return Array.from(m.addedNodes).some(function(n){return n.nodeType===1&&(n.matches(selector)||n.querySelector(selector));});}))return;if(!scheduled){scheduled=true;queueMicrotask(function(){scheduled=false;enhanceAll();});}}).observe(document.documentElement,{childList:true,subtree:true});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',syncAll);else syncAll();
})(window);
