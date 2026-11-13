/* Semantic grid rows without layout boxes or changes to cell order/focus. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.NineRealmsGridRows=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function wrap(grid,cells,positions){
  var doc=grid.ownerDocument,rows=[],byRow=Object.create(null),fragment=doc.createDocumentFragment();
  cells.forEach(function(cell,i){
   var index=positions?positions[i]:Math.floor(i/9),row=byRow[index];
   if(!row){row=doc.createElement('div');row.className='semantic-grid-row';row.setAttribute('role','row');row.dataset.gridRow=String(index+1);row.setAttribute('aria-rowindex',String(index+1));byRow[index]=row;rows.push(row);fragment.appendChild(row);}
   row.appendChild(cell);
  });
  grid.replaceChildren(fragment);
  function refresh(){rows.forEach(function(row){var visible=Array.from(row.children).find(function(cell){return !cell.hidden;});row.hidden=!visible;if(visible)row.setAttribute('aria-rowindex',visible.getAttribute('aria-rowindex')||row.dataset.gridRow);});}
  refresh();return {refresh:refresh,rows:rows};
 }
 return {wrap:wrap};
});
