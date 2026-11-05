/* Session-only non-modal geometry. Never hides input controls or stores puzzle data. */
(function(root){
 'use strict';
 var doc=root.document,panel=doc.getElementById('draft-panel'),trigger=doc.getElementById('draft-toggle'),dock=doc.getElementById('draft-dock'),closeButton=doc.getElementById('draft-close'),placement=doc.getElementById('draft-placement'),mover=doc.getElementById('draft-move'),resizer=doc.getElementById('draft-resize'),reset=doc.getElementById('draft-reset-window');
 if(!panel||!trigger||!dock||!closeButton||!mover||!resizer||!reset)return;
 var opened=false,queued=false,manual=null,dockedHeight=null,safeDock=false,gesture=null;
 dock.hidden=true;
 function viewport(){var v=root.visualViewport;return {width:v?v.width:root.innerWidth||doc.documentElement.clientWidth,height:v?v.height:root.innerHeight||doc.documentElement.clientHeight,left:v?v.offsetLeft:0,top:v?v.offsetTop:0};}
 function compact(v){return v.width<761||v.height<420;}
 function limit(n,a,b){return Math.max(a,Math.min(n,Math.max(a,b)));}
 function clamp(r){var v=viewport(),w=limit(r.width,Math.min(280,v.width-24),v.width-24),h=limit(r.height,Math.min(200,v.height-24),v.height-24);return {left:limit(r.left,v.left+12,v.left+v.width-w-12),top:limit(r.top,v.top+12,v.top+v.height-h-12),width:w,height:h};}
 function overlaps(a,b,gap){gap=gap||0;return a.left+a.width>b.left-gap&&a.left<b.right+gap&&a.top+a.height>b.top-gap&&a.top<b.bottom+gap;}
 function controls(){var e=doc.querySelector('.control-panel'),r=e&&e.getBoundingClientRect();return r&&r.width&&r.height?r:null;}
 // Project every manual move/resize into a free rectangle, including pointermove frames.
 // Protect the complete input region, not just the currently selected Sudoku cell.
 function safeRect(request){var r=clamp(request),c=controls(),v=viewport();if(!c||!overlaps(r,c,12))return r;
  var left=v.left+12,top=v.top+12,right=v.left+v.width-12,bottom=v.top+v.height-12;
  var regions=[{left:left,top:top,right:Math.min(right,c.left-12),bottom:bottom},{left:Math.max(left,c.right+12),top:top,right:right,bottom:bottom},{left:left,top:top,right:right,bottom:Math.min(bottom,c.top-12)},{left:left,top:Math.max(top,c.bottom+12),right:right,bottom:bottom}];
  var best=null,score=Infinity;
  regions.forEach(function(z){var w=Math.min(r.width,z.right-z.left),h=Math.min(r.height,z.bottom-z.top);if(w<280||h<200)return;var candidate={left:limit(r.left,z.left,z.right-w),top:limit(r.top,z.top,z.bottom-h),width:w,height:h};var cost=Math.abs(candidate.left-r.left)+Math.abs(candidate.top-r.top)+2*(r.width-w+r.height-h);if(cost<score){best=candidate;score=cost;}});
  return best;
 }
 function move(parent){if(panel.parentElement===parent)return;var focus=panel.contains(doc.activeElement)?doc.activeElement:null;parent.appendChild(panel);if(gesture){try{gesture.target.setPointerCapture(gesture.id);}catch(_){}}if(focus&&focus.isConnected)focus.focus({preventScroll:true});}
 function clearRail(){delete doc.body.dataset.draftRail;doc.body.style.removeProperty('--draft-rail-width');}
 function rail(v){var desktop=doc.body.dataset.workspace==='unified'&&doc.body.dataset.desktop==='on',context=doc.querySelector('.desktop-context'),column=context&&context.getBoundingClientRect().width;var tools=doc.querySelector('.desktop-tools'),toolsWidth=tools&&tools.getBoundingClientRect().width||288,area=doc.querySelector('.game-layout'),css=root.getComputedStyle&&area?root.getComputedStyle(area):null,gap=css?parseFloat(css.columnGap)||24:24;var available=v.width-64-column-toolsWidth-2*gap;
  if(!desktop||!column||compact(v)||safeDock||available<280){clearRail();return 0;}
  var width=Math.min(340,Math.floor(available)),value=width+'px';if(doc.body.dataset.draftRail!=='on')doc.body.dataset.draftRail='on';if(doc.body.style.getPropertyValue('--draft-rail-width')!==value)doc.body.style.setProperty('--draft-rail-width',value);return width;
 }
 function rect(){var r=panel.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width||340,height:r.height||300};}
 function setRect(r){panel.style.left=r.left+'px';panel.style.top=r.top+'px';panel.style.right='auto';panel.style.bottom='auto';panel.style.width=r.width+'px';panel.style.height=r.height+'px';panel.style.maxHeight=r.height+'px';}
 function announce(message){if(placement.textContent!==message)placement.textContent=message;}
 function dockPanel(v,area){clearRail();move(area);panel.dataset.placement='docked';['left','top','right','bottom','width'].forEach(function(name){panel.style.removeProperty(name);});var h=limit(dockedHeight===null?Math.min(v.height*.42,340):dockedHeight,180,Math.min(620,Math.max(200,v.height-24)));panel.style.height=h+'px';panel.style.maxHeight=h+'px';announce('草稿停靠在填数区下方，不遮挡数字键。');}
 function position(){queued=false;if(!opened)return;var v=viewport(),area=doc.querySelector('.game-layout'),width=rail(v),board=doc.getElementById('board-card'),r=board&&board.getBoundingClientRect(),bounds=area&&area.getBoundingClientRect();if(!area)return;
  mover.setAttribute('aria-disabled',String(compact(v)));mover.title=compact(v)?'窄屏停靠在填数区下方':'拖动标题移动；方向键微调，Shift 加大步幅';resizer.title='拖动调整大小；方向键微调，Shift 加大步幅';
  var next=null;
  if(manual&&!compact(v)&&!safeDock){next=safeRect(manual);if(next){manual=next;panel.dataset.placement='manual';announce('自定窗口位置与大小，自动避开填数区。');}}
  else if(width&&r&&bounds){var leftHand=doc.body.dataset.handedness==='left';next=safeRect({left:leftHand?bounds.left:bounds.right-width,top:limit(r.top,v.top+12,v.top+v.height-212),width:width,height:Math.min(560,v.height-24,Math.max(200,v.top+v.height-r.top-12))});if(next){panel.dataset.placement='floating';announce(leftHand?'草稿在独立的左侧栏。':'草稿在独立的右侧栏。');}}
  else if(!compact(v)&&!safeDock&&bounds&&r){var outsideRight=v.left+v.width-bounds.right-24,outsideLeft=bounds.left-v.left-24;var w=Math.min(340,Math.max(outsideLeft,outsideRight));if(w>=280){next=safeRect({left:outsideRight>=w?bounds.right+12:bounds.left-w-12,top:Math.max(v.top+12,r.top),width:w,height:Math.min(560,v.height-24)});if(next){panel.dataset.placement='floating';announce('草稿位于工作区旁。');}}}
  if(next){move(doc.body);setRect(next);}else dockPanel(v,area);
 }
 function reveal(target){if(!opened||!target||panel.dataset.placement==='docked')return;var r=target.getBoundingClientRect(),p=rect();if(r.width&&r.height&&overlaps(p,r,8)){safeDock=true;position();}}
 function schedule(){if(!opened||queued)return;queued=true;root.setTimeout(position,0);}
 function endGesture(event){if(!gesture||event&&event.pointerId!==undefined&&event.pointerId!==gesture.id)return;var g=gesture;gesture=null;panel.classList.remove('window-adjusting');try{if(g.target.hasPointerCapture&&g.target.hasPointerCapture(g.id))g.target.releasePointerCapture(g.id);}catch(_){}if(opened)reveal(doc.querySelector('#board .cell.selected'));}
 function close(returnFocus){if(!opened)return;opened=false;endGesture();clearRail();panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(root.NineRealmsWorkspace)root.NineRealmsWorkspace.sync();if(root.NineRealmsSelect)root.NineRealmsSelect.close();move(dock);delete panel.dataset.placement;if(returnFocus!==false)trigger.focus({preventScroll:true});}
 function open(){if(opened||doc.querySelector('dialog[open]')||doc.body.inert)return;var more=doc.getElementById('more-tools-panel'),board=doc.getElementById('board-card');if(more&&more.contains(trigger)&&doc.body.dataset.desktop==='on'&&board&&board.scrollIntoView)board.scrollIntoView({block:'nearest',behavior:'instant'});opened=true;panel.hidden=false;trigger.setAttribute('aria-expanded','true');if(root.NineRealmsWorkspace)root.NineRealmsWorkspace.sync();position();(panel.querySelector('#draft-colors button:not(:disabled)')||closeButton).focus({preventScroll:true});reveal(doc.querySelector('#board .cell.selected'));if(panel.dataset.placement==='docked'&&panel.scrollIntoView)panel.scrollIntoView({block:'nearest',behavior:'instant'});}
 function adjust(kind,dx,dy,start,isDocked){if(isDocked&&kind==='resize'){dockedHeight=start.height+dy;position();return;}if(compact(viewport()))return;safeDock=false;manual=kind==='move'?{left:start.left+dx,top:start.top+dy,width:start.width,height:start.height}:{left:start.left,top:start.top,width:start.width+dx,height:start.height+dy};position();}
 function bindHandle(handle,kind){handle.addEventListener('pointerdown',function(e){if(!opened||e.button!==0||e.isPrimary===false||compact(viewport())&&kind==='move')return;e.preventDefault();endGesture();handle.focus({preventScroll:true});var isDocked=panel.dataset.placement==='docked',start=rect();if(isDocked&&kind==='move')start=clamp({left:e.clientX-100,top:e.clientY-22,width:340,height:Math.min(start.height,360)});gesture={id:e.pointerId,target:handle,kind:kind,x:e.clientX,y:e.clientY,start:start,docked:isDocked};panel.classList.add('window-adjusting');try{handle.setPointerCapture(e.pointerId);}catch(_){} });
  handle.addEventListener('lostpointercapture',endGesture);
  handle.addEventListener('keydown',function(e){var delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.preventDefault();e.stopPropagation();var step=e.shiftKey?32:8;adjust(kind,delta[0]*step,delta[1]*step,rect(),panel.dataset.placement==='docked');reveal(doc.querySelector('#board .cell.selected'));});
 }
 bindHandle(mover,'move');bindHandle(resizer,'resize');
 doc.addEventListener('pointermove',function(e){if(!gesture||e.pointerId!==gesture.id)return;e.preventDefault();adjust(gesture.kind,e.clientX-gesture.x,e.clientY-gesture.y,gesture.start,gesture.docked);},{passive:false});
 doc.addEventListener('pointerup',endGesture);doc.addEventListener('pointercancel',endGesture);root.addEventListener('blur',function(){endGesture();});
 reset.addEventListener('click',function(){endGesture();manual=null;dockedHeight=null;safeDock=false;position();reset.focus({preventScroll:true});});
 trigger.addEventListener('click',function(){if(opened)close(true);else open();});trigger.addEventListener('keydown',function(e){if(e.key==='Escape'){if(!opened)return;e.preventDefault();close(true);}e.stopPropagation();});closeButton.addEventListener('click',function(){close(true);});
 panel.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}else e.stopPropagation();});
 doc.addEventListener('click',function(e){var target=e.target.closest&&e.target.closest('#board .cell,#number-pad button');if(target)reveal(target);});
 doc.addEventListener('focusin',function(e){if(!panel.contains(e.target)&&e.target.matches&&e.target.matches('button,input,select,textarea,a[href],[tabindex]'))reveal(e.target);});
 root.addEventListener('resize',function(){endGesture();schedule();});doc.addEventListener('scroll',function(e){if(!panel.contains(e.target))schedule();},true);
 if(root.visualViewport){root.visualViewport.addEventListener('resize',function(){endGesture();schedule();});root.visualViewport.addEventListener('scroll',schedule);}
 if(root.ResizeObserver){var observer=new root.ResizeObserver(schedule),board=doc.getElementById('board-card');if(board)observer.observe(board);observer.observe(doc.documentElement);observer.observe(panel);var input=doc.querySelector('.control-panel');if(input)observer.observe(input);}
 if(root.MutationObserver)new root.MutationObserver(schedule).observe(doc.body,{attributes:true,attributeFilter:['data-handedness','data-workspace','data-desktop']});
 root.NineRealmsFloatingDraft={open:open,close:close,reposition:position,isOpen:function(){return opened;}};
})(window);
