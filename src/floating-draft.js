/* Session-only non-modal window geometry. Puzzle/draft data never lives here. */
(function(root){'use strict';
 var doc=root.document,panel=doc.getElementById('draft-panel'),trigger=doc.getElementById('draft-toggle'),dock=doc.getElementById('draft-dock'),closeButton=doc.getElementById('draft-close'),placement=doc.getElementById('draft-placement'),mover=doc.getElementById('draft-move'),resizer=doc.getElementById('draft-resize'),reset=doc.getElementById('draft-reset-window');
 if(!panel||!trigger||!dock||!closeButton||!mover||!resizer||!reset)return;
 var opened=false,queued=false,manual=null,sheetHeight=null,safeSheet=false,gesture=null;
 dock.hidden=true;
 function viewport(){var v=root.visualViewport;return {width:v?v.width:root.innerWidth||doc.documentElement.clientWidth,height:v?v.height:root.innerHeight||doc.documentElement.clientHeight,left:v?v.offsetLeft:0,top:v?v.offsetTop:0};}
 function compact(v){return v.width<761||v.height<420;}
 function limit(n,a,b){return Math.max(a,Math.min(n,Math.max(a,b)));}
 function clamp(r){var v=viewport(),minW=Math.min(280,v.width-24),minH=Math.min(200,v.height-24),w=limit(r.width,minW,v.width-24),h=limit(r.height,minH,v.height-24);return {left:limit(r.left,v.left+12,v.left+v.width-w-12),top:limit(r.top,v.top+12,v.top+v.height-h-12),width:w,height:h};}
 function move(parent){if(panel.parentElement===parent)return;var focus=panel.contains(doc.activeElement)?doc.activeElement:null;parent.appendChild(panel);if(focus&&focus.isConnected)focus.focus({preventScroll:true});}
 function clearSpace(){delete doc.body.dataset.draftSheet;delete doc.documentElement.dataset.draftSheet;doc.documentElement.style.removeProperty('--draft-sheet-height');}
 function rect(){var r=panel.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width||340,height:r.height||300};}
 function setRect(r){panel.style.left=r.left+'px';panel.style.top=r.top+'px';panel.style.right='auto';panel.style.bottom='auto';panel.style.width=r.width+'px';panel.style.height=r.height+'px';panel.style.maxHeight=r.height+'px';}
 function announce(message){if(placement.textContent!==message)placement.textContent=message;}
 function position(){queued=false;if(!opened)return;var v=viewport(),board=doc.getElementById('board-card'),r=board&&board.getBoundingClientRect(),area=doc.querySelector('.game-layout'),bounds=area&&area.getBoundingClientRect();move(doc.body);
  mover.setAttribute('aria-disabled',String(compact(v)));resizer.title=compact(v)?'上下拖动调整高度；上下方向键微调，Shift 加大步幅':'拖动调整大小；方向键微调，Shift 加大步幅';mover.title=compact(v)?'窄屏固定底部，可用右下角调整高度':'拖动标题移动；方向键微调，Shift 加大步幅';
  var floating=Boolean(r&&r.width>0&&bounds&&bounds.width>0&&v.width>=1100&&v.left+v.width-bounds.right>=372&&v.height>=420);
  if(manual&&!compact(v)&&!safeSheet){clearSpace();manual=clamp(manual);panel.dataset.placement='manual';setRect(manual);announce('自定窗口位置与大小。');}
  else if(floating&&!safeSheet&&!compact(v)&&!manual){clearSpace();panel.dataset.placement='floating';panel.style.height='';panel.style.width='340px';panel.style.left='auto';panel.style.bottom='auto';panel.style.right=Math.max(16,(root.innerWidth||v.width)-v.left-v.width+16)+'px';panel.style.top=limit(r.top,v.top+12,v.top+Math.max(12,v.height-360))+'px';panel.style.maxHeight=Math.max(200,v.top+v.height-parseFloat(panel.style.top)-12)+'px';announce('草稿在右侧。');}
  else{panel.dataset.placement='sheet';var maxH=Math.min(v.height*(v.height<500?.6:.55),420),minH=Math.min(180,maxH),h=sheetHeight===null?Math.min(v.height*(v.height<500?.6:.42),340):limit(sheetHeight,minH,maxH);panel.style.width=Math.max(0,v.width-24)+'px';panel.style.left=(v.left+12)+'px';panel.style.right='auto';panel.style.top='auto';panel.style.bottom=Math.max(12,(root.innerHeight||v.height)-v.top-v.height+12)+'px';panel.style.height=h+'px';panel.style.maxHeight=h+'px';announce('草稿已停靠底部，可调整高度。');doc.body.dataset.draftSheet='on';doc.documentElement.dataset.draftSheet='on';doc.documentElement.style.setProperty('--draft-sheet-height',Math.ceil(panel.getBoundingClientRect().height||h)+'px');}
 }
 function reveal(target){if(!opened||!target)return;var r=target.getBoundingClientRect(),p=panel.getBoundingClientRect();if(!(r.height>0&&p.height>0&&r.right>p.left&&r.left<p.right&&r.bottom>p.top-12&&r.top<p.bottom))return;
  if(panel.dataset.placement!=='sheet'){safeSheet=true;position();p=panel.getBoundingClientRect();}
  if(r.bottom>p.top-12)root.scrollBy({top:r.bottom-p.top+16,behavior:'auto'});
 }
 function schedule(){if(!opened||queued)return;queued=true;root.setTimeout(position,0);}
 function endGesture(event){if(!gesture||event&&event.pointerId!==undefined&&event.pointerId!==gesture.id)return;var g=gesture;gesture=null;panel.classList.remove('window-adjusting');try{if(g.target.hasPointerCapture&&g.target.hasPointerCapture(g.id))g.target.releasePointerCapture(g.id);}catch(_){}if(opened)reveal(doc.querySelector('#board .cell.selected'));}
 function close(returnFocus){if(!opened)return;opened=false;endGesture();clearSpace();panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(root.NineRealmsSelect)root.NineRealmsSelect.close();move(dock);delete panel.dataset.placement;if(returnFocus!==false)trigger.focus({preventScroll:true});}
 function open(){if(opened||doc.querySelector('dialog[open]')||doc.body.inert)return;opened=true;panel.hidden=false;trigger.setAttribute('aria-expanded','true');position();(panel.querySelector('#draft-colors button:not(:disabled)')||closeButton).focus({preventScroll:true});reveal(doc.querySelector('#board .cell.selected'));}
 function adjust(kind,dx,dy,start,isSheet){if(isSheet){if(kind==='resize'){sheetHeight=start.height+dy;position();}return;}safeSheet=false;manual=clamp(kind==='move'?{left:start.left+dx,top:start.top+dy,width:start.width,height:start.height}:{left:start.left,top:start.top,width:start.width+dx,height:start.height+dy});position();}
 function bindHandle(handle,kind){handle.addEventListener('pointerdown',function(e){if(!opened||e.button!==0||e.isPrimary===false||compact(viewport())&&kind==='move')return;e.preventDefault();endGesture();handle.focus({preventScroll:true});var isSheet=compact(viewport()),start=rect();if(!isSheet&&kind==='move'&&panel.dataset.placement==='sheet')start=clamp({left:e.clientX-100,top:e.clientY-22,width:340,height:Math.min(start.height,360)});gesture={id:e.pointerId,target:handle,kind:kind,x:e.clientX,y:e.clientY,start:start,sheet:isSheet};panel.classList.add('window-adjusting');try{handle.setPointerCapture(e.pointerId);}catch(_){} });
  handle.addEventListener('lostpointercapture',endGesture);
  handle.addEventListener('keydown',function(e){var delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.preventDefault();e.stopPropagation();var step=e.shiftKey?32:8;var narrow=compact(viewport());adjust(kind,delta[0]*step,delta[1]*step*(narrow?-1:1),rect(),narrow);reveal(doc.querySelector('#board .cell.selected'));});}
 bindHandle(mover,'move');bindHandle(resizer,'resize');
 doc.addEventListener('pointermove',function(e){if(!gesture||e.pointerId!==gesture.id)return;e.preventDefault();adjust(gesture.kind,e.clientX-gesture.x,(e.clientY-gesture.y)*(gesture.sheet?-1:1),gesture.start,gesture.sheet);},{passive:false});
 doc.addEventListener('pointerup',endGesture);doc.addEventListener('pointercancel',endGesture);root.addEventListener('blur',function(){endGesture();});
 reset.addEventListener('click',function(){endGesture();manual=null;sheetHeight=null;safeSheet=false;position();reset.focus({preventScroll:true});});
 trigger.addEventListener('click',function(){if(opened)close(true);else open();});trigger.addEventListener('keydown',function(e){if(e.key==='Escape'&&opened){e.preventDefault();close(true);}e.stopPropagation();});closeButton.addEventListener('click',function(){close(true);});
 panel.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}else e.stopPropagation();});
 doc.addEventListener('click',function(e){var target=e.target.closest&&e.target.closest('#board .cell,#number-pad button');if(target)reveal(target);});
 doc.addEventListener('focusin',function(e){if(!panel.contains(e.target)&&e.target.matches&&e.target.matches('button,input,select,textarea,a[href],[tabindex]'))reveal(e.target);});
 root.addEventListener('resize',function(){endGesture();schedule();});doc.addEventListener('scroll',function(e){if(!panel.contains(e.target))schedule();},true);
 if(root.visualViewport){root.visualViewport.addEventListener('resize',function(){endGesture();schedule();});root.visualViewport.addEventListener('scroll',schedule);}
 if(root.ResizeObserver){var observer=new root.ResizeObserver(schedule),board=doc.getElementById('board-card');if(board)observer.observe(board);observer.observe(doc.documentElement);observer.observe(panel);}
 root.NineRealmsFloatingDraft={open:open,close:close,reposition:position,isOpen:function(){return opened;}};
})(window);
