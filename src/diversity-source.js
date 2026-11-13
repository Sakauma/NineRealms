/* Seeded complete-grid construction from an empty board, never a bank permutation. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'));
 else root.NineRealmsDiversitySource=factory(root.SudokuEngine);
})(typeof globalThis!=='undefined'?globalThis:this,function createDiversitySource(Engine){
 'use strict';
 // Miracle is intentionally excluded: its extreme constraints collapse sampled
 // completions to one classical equivalence class, not fresh structural diversity.
 var VERSION=1,MODES=['classic','diagonal','hyper','knight','king','nonconsecutive','disjoint','jigsaw','twin','samurai'];
 function fail(code){var e=new Error(code);e.code=code;throw e;}
 function rng(seed){var h=2166136261;for(var i=0;i<seed.length;i++)h=Math.imul(h^seed.charCodeAt(i),16777619);return function(){h|=0;h=h+0x6D2B79F5|0;var t=Math.imul(h^h>>>15,1|h);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
 function shuffled(a,r){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(r()*(i+1)),t=a[i];a[i]=a[j];a[j]=t;}return a;}
 function count(n){n=n-((n>>>1)&0x55555555);n=(n&0x33333333)+((n>>>2)&0x33333333);return ((n+(n>>>4)&0x0F0F0F0F)*0x01010101)>>>24;}
 function supportedModes(){return MODES.slice();}
 function supports(mode){return MODES.indexOf(mode)>=0;}
 function compactSeed(tag,seed){var r=rng(tag+':'+seed);return tag+':'+Array.from({length:4},function(){return Math.floor(r()*4294967296).toString(16);}).join('-');}
 function neighbours(i){var a=[];if(i%9)a.push(i-1);if(i%9<8)a.push(i+1);if(i>=9)a.push(i-9);if(i<72)a.push(i+9);return a;}
 function connected(regions,id){var group=[];for(var i=0;i<81;i++)if(regions[i]===id)group.push(i);if(group.length!==9)return false;var seen=new Set([group[0]]),queue=[group[0]];while(queue.length){neighbours(queue.pop()).forEach(function(cell){if(regions[cell]===id&&!seen.has(cell)){seen.add(cell);queue.push(cell);}});}return seen.size===9;}
 function irregularRegions(seed,maxNodes,maxAttempts){
  var regular=Array.from({length:81},function(_,i){return Math.floor(i/27)*3+Math.floor(i%9/3);});
  var regionNodes=0;
  for(var attempt=0;attempt<8;attempt++){
   var subSeed=compactSeed('regions-'+attempt,seed),base=generate({mode:'classic',seed:subSeed,maxNodes:maxNodes,maxAttempts:maxAttempts}),regions=regular.slice(),random=rng(subSeed),visited=new Set([regions.join('')]),swaps=0;
   regionNodes+=base.construction.nodes;
   for(var step=0;step<24;step++){
    var options=[];for(var a=0;a<81;a++)for(var b=a+1;b<81;b++)if(regions[a]!==regions[b]&&base.solution[a]===base.solution[b]&&neighbours(a).some(function(c){return regions[c]===regions[b];})&&neighbours(b).some(function(c){return regions[c]===regions[a];}))options.push([a,b]);
    options=shuffled(options,random);var accepted=false;
    for(var j=0;j<options.length;j++){var x=options[j][0],y=options[j][1],rx=regions[x],ry=regions[y];regions[x]=ry;regions[y]=rx;var key=regions.join('');if(!visited.has(key)&&connected(regions,rx)&&connected(regions,ry)){visited.add(key);swaps++;accepted=true;break;}regions[x]=rx;regions[y]=ry;}
    if(!accepted)break;
   }
   var changed=regions.reduce(function(n,r,i){return n+(r!==regular[i]?1:0);},0),changedRegions=new Set();regions.forEach(function(r,i){if(r!==regular[i]){changedRegions.add(r);changedRegions.add(regular[i]);}});
   var irregular=0;for(var r=0;r<9;r++){var boxes=new Set();regions.forEach(function(id,i){if(id===r)boxes.add(regular[i]);});if(boxes.size>1)irregular++;}
   if(changed>=12&&changedRegions.size>=6&&irregular>=6)return {clues:Engine.normalizeClues('jigsaw',{regions:regions}),swaps:swaps,changedCells:changed,changedRegions:changedRegions.size,irregularRegions:irregular,constructionNodes:regionNodes,attempts:attempt+1};
  }
  fail('DIVERSITY_REGIONS_UNAVAILABLE');
 }
 function generate(request){
  request=request||{};var mode=request.mode||'classic',seed=request.seed;
  if(!supports(mode))fail('DIVERSITY_UNSUPPORTED_MODE');
  if(typeof seed!=='string'||!seed.length||seed.length>256)fail('INVALID_SEED');
  var maxNodes=request.maxNodes===undefined?60000:request.maxNodes,maxAttempts=request.maxAttempts===undefined?4:request.maxAttempts;
  if(!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>1000000||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>16)fail('INVALID_CONSTRUCTION_BUDGET');
  var regionInfo=mode==='jigsaw'?irregularRegions(seed,maxNodes,maxAttempts):null,clues=regionInfo?regionInfo.clues:Engine.normalizeClues(mode,{}),context={mode:mode,clues:clues},layout=Engine.getLayout(mode),cellCount=layout.cellCount;
  var peers=Array.from({length:cellCount},function(_,i){return Engine.getPeers(i,context);}),adjacent=Array.from({length:81},function(_,i){var a=[];if(i%9)a.push(i-1);if(i%9<8)a.push(i+1);if(i>=9)a.push(i-9);if(i<72)a.push(i+9);return a;}),consecutive=mode==='nonconsecutive',units=Engine.getUnits(context).map(function(u){return u.cells;});
  var totalNodes=0,solution=null,attempt=0;
  for(;attempt<maxAttempts&&!solution;attempt++){
   var random=rng('complete-v1:'+mode+':'+seed+':'+attempt),order=shuffled(Array.from({length:cellCount},function(_,i){return i;}),random),board=new Array(cellCount).fill(0),domains=new Array(cellCount).fill(511),nodes=0;
   function visit(left){
    if(++nodes>maxNodes)return false;
    if(!left){solution=board.slice();return true;}
    var best=-1,size=10,degree=-1;
    for(var o=0;o<cellCount;o++){var i=order[o];if(board[i])continue;var n=count(domains[i]);if(!n)return false;var d=peers[i].length;if(n<size||n===size&&d>degree){best=i;size=n;degree=d;}if(n===1)break;}
    var available=domains[best];
    // Hidden-single and missing-digit forward checks tame nonconsecutive search.
    if((consecutive||mode==='jigsaw')&&size>1)for(var u=0;u<units.length;u++){var used=0,once=0,multiple=0;for(var j=0;j<units[u].length;j++){var cell=units[u][j];if(board[cell])used|=1<<(board[cell]-1);else{multiple|=once&domains[cell];once|=domains[cell];}}var missing=511&~used;if(missing&~once)return false;var forced=missing&once&~multiple;if(forced){var f=forced&-forced;best=units[u].find(function(cell){return !board[cell]&&(domains[cell]&f);});available=f;break;}}
    var digits=[];for(var digit=1;digit<=9;digit++)if(available&(1<<(digit-1)))digits.push(digit);digits=shuffled(digits,random);
    for(var k=0;k<digits.length&&nodes<=maxNodes;k++){
     var value=digits[k],bit=1<<(value-1),trail=[],ok=true;board[best]=value;
     function remove(cell,bits){if(board[cell])return;var old=domains[cell],next=old&~bits;if(next!==old){trail.push([cell,old]);domains[cell]=next;if(!next)ok=false;}}
     for(var p=0;p<peers[best].length;p++)remove(peers[best][p],bit);
     if(consecutive)for(var a=0;a<adjacent[best].length;a++)remove(adjacent[best][a],(bit<<1)|(bit>>>1));
     if(ok&&visit(left-1))return true;
     for(var t=trail.length-1;t>=0;t--)domains[trail[t][0]]=trail[t][1];board[best]=0;
    }
    return false;
   }
   visit(cellCount);totalNodes+=Math.min(nodes,maxNodes);
  }
  if(!solution){var error=new Error('DIVERSITY_BUDGET');error.code='DIVERSITY_BUDGET';error.construction={nodes:totalNodes,attempts:attempt,maxNodes:maxNodes,maxAttempts:maxAttempts};throw error;}
  if(!Engine.validateComplete(solution,{mode:mode,clues:clues}))fail('INVALID_CONSTRUCTED_SOLUTION');
  var id='DS'+VERSION+'-'+mode+'-'+seed;
  var construction={version:VERSION,kind:'random-search',seed:seed,nodes:totalNodes,attempts:attempt,maxNodes:maxNodes,maxAttempts:maxAttempts};
  if(regionInfo){construction.regionSwaps=regionInfo.swaps;construction.changedRegionCells=regionInfo.changedCells;construction.changedRegions=regionInfo.changedRegions;construction.irregularRegions=regionInfo.irregularRegions;construction.regionConstructionNodes=regionInfo.constructionNodes;construction.regionAttempts=regionInfo.attempts;}
  if(cellCount!==81){construction.cellCount=cellCount;construction.boardCount=layout.boards.length;construction.overlapCells=layout.cells.filter(function(c){return c.boards.length>1;}).length;}
  return {id:id,sourceId:id,mode:mode,givens:solution.slice(),solution:solution,clues:clues,construction:construction};
 }
 function workerSource(){return 'var NineRealmsDiversitySource=('+createDiversitySource.toString()+')(SudokuEngine);';}
 return {version:VERSION,supportedModes:supportedModes,supports:supports,generate:generate,workerSource:workerSource};
});
