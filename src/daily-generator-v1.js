/* Frozen daily construction policy v1, copied from the verified 2026-11-13 delivery.
 * DO NOT edit its algorithms or change dependencies' rule meaning under existing dates.
 * Ordinary generator changes must not reroll daily history. Introduce a new dated version instead.
 */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'),require('./hints.js'));
 else root.NineRealmsDailyGeneratorV1=factory(root.SudokuEngine,root.SudokuHints);
})(typeof globalThis!=='undefined'?globalThis:this,function createFrozenDailyV1(Engine,Hints){
 'use strict';
var Sources=(function createDiversitySource(Engine){
 'use strict';
 // Miracle is intentionally excluded: its extreme constraints collapse sampled
 // completions to one classical equivalence class, not fresh structural diversity.
 var VERSION=1,MODES=['classic','diagonal','hyper','knight','king','nonconsecutive','disjoint'];
 function fail(code){var e=new Error(code);e.code=code;throw e;}
 function rng(seed){var h=2166136261;for(var i=0;i<seed.length;i++)h=Math.imul(h^seed.charCodeAt(i),16777619);return function(){h|=0;h=h+0x6D2B79F5|0;var t=Math.imul(h^h>>>15,1|h);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
 function shuffled(a,r){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(r()*(i+1)),t=a[i];a[i]=a[j];a[j]=t;}return a;}
 function count(n){n=n-((n>>>1)&0x55555555);n=(n&0x33333333)+((n>>>2)&0x33333333);return ((n+(n>>>4)&0x0F0F0F0F)*0x01010101)>>>24;}
 function supportedModes(){return MODES.slice();}
 function supports(mode){return MODES.indexOf(mode)>=0;}
 function generate(request){
  request=request||{};var mode=request.mode||'classic',seed=request.seed;
  if(!supports(mode))fail('DIVERSITY_UNSUPPORTED_MODE');
  if(typeof seed!=='string'||!seed.length||seed.length>256)fail('INVALID_SEED');
  var maxNodes=request.maxNodes===undefined?60000:request.maxNodes,maxAttempts=request.maxAttempts===undefined?4:request.maxAttempts;
  if(!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>1000000||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>16)fail('INVALID_CONSTRUCTION_BUDGET');
  var peers=Array.from({length:81},function(_,i){return Engine.getPeers(i,mode);}),adjacent=Array.from({length:81},function(_,i){var a=[];if(i%9)a.push(i-1);if(i%9<8)a.push(i+1);if(i>=9)a.push(i-9);if(i<72)a.push(i+9);return a;}),consecutive=mode==='nonconsecutive',units=Engine.getUnits(mode).map(function(u){return u.cells;});
  var totalNodes=0,solution=null,attempt=0;
  for(;attempt<maxAttempts&&!solution;attempt++){
   var random=rng('complete-v1:'+mode+':'+seed+':'+attempt),order=shuffled(Array.from({length:81},function(_,i){return i;}),random),board=new Array(81).fill(0),domains=new Array(81).fill(511),nodes=0;
   function visit(left){
    if(++nodes>maxNodes)return false;
    if(!left){solution=board.slice();return true;}
    var best=-1,size=10,degree=-1;
    for(var o=0;o<81;o++){var i=order[o];if(board[i])continue;var n=count(domains[i]);if(!n)return false;var d=peers[i].length;if(n<size||n===size&&d>degree){best=i;size=n;degree=d;}if(n===1)break;}
    var available=domains[best];
    // Hidden-single and missing-digit forward checks tame nonconsecutive search.
    if(consecutive&&size>1)for(var u=0;u<units.length;u++){var used=0,once=0,multiple=0;for(var j=0;j<units[u].length;j++){var cell=units[u][j];if(board[cell])used|=1<<(board[cell]-1);else{multiple|=once&domains[cell];once|=domains[cell];}}var missing=511&~used;if(missing&~once)return false;var forced=missing&once&~multiple;if(forced){var f=forced&-forced;best=units[u].find(function(cell){return !board[cell]&&(domains[cell]&f);});available=f;break;}}
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
   visit(81);totalNodes+=Math.min(nodes,maxNodes);
  }
  if(!solution){var error=new Error('DIVERSITY_BUDGET');error.code='DIVERSITY_BUDGET';error.construction={nodes:totalNodes,attempts:attempt,maxNodes:maxNodes,maxAttempts:maxAttempts};throw error;}
  var clues=Engine.normalizeClues(mode,{});
  if(!Engine.validateComplete(solution,{mode:mode,clues:clues}))fail('INVALID_CONSTRUCTED_SOLUTION');
  var id='DS'+VERSION+'-'+mode+'-'+seed;
  return {id:id,sourceId:id,mode:mode,givens:solution.slice(),solution:solution,clues:clues,construction:{version:VERSION,kind:'random-search',seed:seed,nodes:totalNodes,attempts:attempt,maxNodes:maxNodes,maxAttempts:maxAttempts}};
 }
 function workerSource(){return 'var NineRealmsDiversitySource=('+createDiversitySource.toString()+')(SudokuEngine);';}
 return {version:VERSION,supportedModes:supportedModes,supports:supports,generate:generate,workerSource:workerSource};
})(Engine);
var Clues=(function createDiversityClues(Engine){
  'use strict';
  var MODES=['thermo','killer','arrow','thermo-killer','renban','whispers','odd-even','greater','kropki','xv','quadruple','sandwich','skyscraper','xsum','littlekiller'];
  function random(seed){var h=2166136261;String(seed).split('').forEach(function(c){h=Math.imul(h^c.charCodeAt(0),16777619);});return function(){h+=0x6D2B79F5;var t=h;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
  function shuffle(items,rng){var a=items.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(rng()*(i+1)),v=a[i];a[i]=a[j];a[j]=v;}return a;}
  function cells(){return Array.from({length:81},function(_,i){return i;});}
  function neighbours(i){var out=[],r=Math.floor(i/9),c=i%9;if(r)out.push(i-9);if(c)out.push(i-1);if(c<8)out.push(i+1);if(r<8)out.push(i+9);return out;}
  function failure(message){var error=new RangeError(message);error.code='DIVERSITY_LAYOUT_UNAVAILABLE';return error;}
  function cageLayout(solution,rng){
    var free=new Set(cells()),cages=[];
    shuffle(cells(),rng).forEach(function(start){
      if(!free.has(start))return;
      var group=[start],digits=new Set([solution[start]]),target=2+Math.floor(rng()*3);free.delete(start);
      while(group.length<target){
        var candidates=[];group.forEach(function(i){neighbours(i).forEach(function(j){if(free.has(j)&&!digits.has(solution[j])&&candidates.indexOf(j)<0)candidates.push(j);});});
        if(!candidates.length)break;
        var next=candidates[Math.floor(rng()*candidates.length)];group.push(next);digits.add(solution[next]);free.delete(next);
      }
      cages.push(group);
    });
    // Merge stranded single cells into a touching cage instead of manufacturing
    // a visually busy board of one-cell sums. All digits must remain distinct.
    cages.slice().forEach(function(group){
      if(group.length!==1||cages.indexOf(group)<0)return;
      var cell=group[0],touch=neighbours(cell);
      var choices=cages.filter(function(other){return other!==group&&other.length<5&&other.some(function(i){return touch.indexOf(i)>=0;})&&!other.some(function(i){return solution[i]===solution[cell];});});
      if(choices.length){var other=choices[Math.floor(rng()*choices.length)];other.push(cell);cages.splice(cages.indexOf(group),1);}
    });
    if(cages.filter(function(c){return c.length===1;}).length>4)throw failure('Too many isolated killer cells.');
    return cages.map(function(group){return {cells:group.slice().sort(function(a,b){return a-b;}),sum:group.reduce(function(sum,i){return sum+solution[i];},0),unique:true};});
  }
  function lineLayout(solution,type,rng){
    var pool=[],seen=new Set();
    function accept(path){
      var values=path.map(function(i){return solution[i];});
      if(type==='arrow'&&values.slice(1).reduce(function(a,b){return a+b;},0)!==values[0])return;
      if(type==='renban'&&(new Set(values).size!==values.length||Math.max.apply(null,values)-Math.min.apply(null,values)!==values.length-1))return;
      var key=path.join(',');if(type==='renban'||type==='whispers'){var reverse=path.slice().reverse().join(',');if(reverse<key)key=reverse;}
      if(!seen.has(key)){seen.add(key);pool.push(path.slice());}
    }
    function walk(path){
      if(path.length>=3)accept(path);
      if(path.length===4)return;
      var last=path[path.length-1];
      neighbours(last).forEach(function(next){
        if(path.indexOf(next)>=0)return;
        if(type==='thermo'&&solution[next]<=solution[last])return;
        if(type==='whispers'&&Math.abs(solution[next]-solution[last])<5)return;
        if(type==='renban'&&path.some(function(i){return solution[i]===solution[next];}))return;
        if(type==='arrow'&&path.slice(1).reduce(function(sum,i){return sum+solution[i];},solution[next])>solution[path[0]])return;
        walk(path.concat(next));
      });
    }
    cells().forEach(function(i){walk([i]);});
    var occupied=new Set(),selected=[];
    shuffle(pool,rng).forEach(function(path){
      if(selected.length>=4||path.some(function(i){return occupied.has(i);}))return;
      selected.push({type:type,cells:path});path.forEach(function(i){occupied.add(i);});
    });
    if(selected.length<2)throw failure('Not enough clear '+type+' paths on this solution.');
    return selected;
  }
  function edgeLayout(solution,mode,rng){
    var pool=[];
    cells().forEach(function(i){neighbours(i).filter(function(j){return j>i;}).forEach(function(j){
      var a=solution[i],b=solution[j];
      if(mode==='greater')pool.push({type:'greater',cells:a>b?[i,j]:[j,i]});
      if(mode==='xv'&&(a+b===5||a+b===10))pool.push({type:'xv',cells:[i,j],value:a+b});
      if(mode==='kropki'){
        if(Math.abs(a-b)===1)pool.push({type:'kropki-white',cells:[i,j]});
        if(a===2*b||b===2*a)pool.push({type:'kropki-black',cells:[i,j]});
      }
    });});
    var occupied=new Set(),selected=[];
    shuffle(pool,rng).forEach(function(edge){if(selected.length>=10||edge.cells.some(function(i){return occupied.has(i);}))return;selected.push(edge);edge.cells.forEach(function(i){occupied.add(i);});});
    if(selected.length<3)throw failure('Not enough '+mode+' edges on this solution.');
    return selected;
  }
  function outsideLayout(solution,mode,rng){
    var pool=[];
    ['top','right','bottom','left'].forEach(function(side){
      for(var index=0;index<9;index++){
        var first=side==='top'?index:side==='bottom'?72+index:side==='left'?index*9:index*9+8;
        if(mode==='littlekiller'){
          // Non-corner origins avoid two competing arrows at the same corner.
          if(index===0||index===8)continue;
          var directions=side==='top'?[[1,-1],[1,1]]:side==='bottom'?[[-1,-1],[-1,1]]:side==='left'?[[-1,1],[1,1]]:[[-1,-1],[1,-1]];
          directions.forEach(function(delta){
            var path=[],r=Math.floor(first/9),c=first%9;
            while(r>=0&&r<9&&c>=0&&c<9){path.push(r*9+c);r+=delta[0];c+=delta[1];}
            if(path.length>=3)pool.push({type:mode,cells:path,value:path.reduce(function(sum,i){return sum+solution[i];},0),side:side,index:index});
          });
        } else {
          var step=side==='top'?9:side==='bottom'?-9:side==='left'?1:-1;
          var path=Array.from({length:9},function(_,i){return first+step*i;}),values=path.map(function(i){return solution[i];}),value;
          if(mode==='sandwich'){var a=values.indexOf(1),b=values.indexOf(9);value=values.slice(Math.min(a,b)+1,Math.max(a,b)).reduce(function(sum,n){return sum+n;},0);}
          if(mode==='xsum'){
            // X=9 merely repeats the known row/column total. Keep actual clues.
            if(values[0]===9)continue;
            value=values.slice(0,values[0]).reduce(function(sum,n){return sum+n;},0);
          }
          if(mode==='skyscraper'){var high=0;value=0;values.forEach(function(n){if(n>high){high=n;value++;}});}
          pool.push({type:mode,cells:path,value:value,side:side,index:index});
        }
      }
    });
    var selected=[],paths=new Set(),origins=new Set(),target=mode==='littlekiller'?8:12;
    shuffle(pool,rng).forEach(function(clue){
      // Avoid the same row/column/diagonal twice, including reversed directions.
      var key=clue.cells.slice().sort(function(a,b){return a-b;}).join(','),origin=clue.side+':'+clue.index;
      if(selected.length>=target||paths.has(key)||origins.has(origin))return;
      selected.push(clue);paths.add(key);origins.add(origin);
    });
    if(selected.length<target)throw failure('Not enough distinct '+mode+' outside clues.');
    return selected;
  }
  function build(options){
    options=options||{};var mode=options.mode,solution=options.solution;
    if(MODES.indexOf(mode)<0)throw new RangeError('Fresh clue geometry is not supported for '+mode+'.');
    if(!Array.isArray(solution)||solution.length!==81||!solution.every(function(n){return Number.isInteger(n)&&n>=1&&n<=9;})||!Engine.validateComplete(solution,'classic'))throw new TypeError('A valid complete classic solution is required.');
    if(typeof options.seed!=='string'&&typeof options.seed!=='number')throw new TypeError('A deterministic seed is required.');
    var rng=random(mode+':'+options.seed),clues={version:1};
    if(mode==='killer'||mode==='thermo-killer')clues.cages=cageLayout(solution,rng);
    if(['thermo','arrow','renban','whispers','thermo-killer'].indexOf(mode)>=0)clues.lines=lineLayout(solution,mode==='thermo-killer'?'thermo':mode,rng);
    if(['greater','kropki','xv'].indexOf(mode)>=0)clues.edges=edgeLayout(solution,mode,rng);
    if(mode==='odd-even')clues.parity=shuffle(cells(),rng).slice(0,12).map(function(i){return {cell:i,parity:solution[i]%2?'odd':'even'};});
    if(['sandwich','skyscraper','xsum','littlekiller'].indexOf(mode)>=0)clues.outside=outsideLayout(solution,mode,rng);
    if(mode==='quadruple'){
      var occupied=new Set();clues.quadruples=[];
      shuffle(cells().filter(function(i){return i%9<8&&i<72;}),rng).forEach(function(i){
        var group=[i,i+1,i+9,i+10];if(clues.quadruples.length>=5||group.some(function(j){return occupied.has(j);}))return;
        group.forEach(function(j){occupied.add(j);});
        clues.quadruples.push({cells:group,values:shuffle(group,rng).slice(0,2+Math.floor(rng()*2)).map(function(j){return solution[j];})});
      });
    }
    clues=Engine.normalizeClues(mode,clues);
    if(!Engine.validateComplete(solution,{mode:mode,clues:clues}))throw failure('Generated clues do not match their solution.');
    return clues;
  }
  return {version:1,supportedModes:function(){return MODES.slice();},layoutDiversity:function(mode){return MODES.indexOf(mode)>=0;},build:build,
    workerSource:function(){return "var NineRealmsDiversityClues=("+createDiversityClues.toString()+")(SudokuEngine);";}};
})(Engine);
var Diversity=(function createDiversity(){
  'use strict';
  var PERM=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]], COLUMNS=[];
  PERM.forEach(function(stacks){PERM.forEach(function(a){PERM.forEach(function(b){PERM.forEach(function(c){
    COLUMNS.push([a,b,c].reduce(function(out,p,i){return out.concat(p.map(function(n){return stacks[i]*3+n;}));},[]));
  });});});});
  function grid(input){
    var a=typeof input==='string'&&/^[1-9]{81}$/.test(input)?input.split('').map(Number):Array.isArray(input)?input.slice():null;
    if(!a||a.length!==81||a.some(function(n){return !Number.isInteger(n)||n<1||n>9;}))throw new TypeError('A full 9x9 solution is required.');
    // Latin validation also allows jigsaw solutions; the equivalence group remains
    // standard Sudoku's fixed band/stack group, NOT arbitrary jigsaw relabelling.
    for(var i=0;i<9;i++){var r=0,c=0;for(var j=0;j<9;j++){r|=1<<a[i*9+j];c|=1<<a[j*9+i];}if(r!==1022||c!==1022)throw new RangeError('Solution rows and columns must contain 1–9.');}
    return a;
  }
  function transpose(a){return a.map(function(_,i){return a[(i%9)*9+Math.floor(i/9)];});}
  function cycles(a){
    var results=[];
    for(var r=0;r<8;r++)for(var s=r+1;s<9;s++){
      var p=Array(10),seen=Array(10).fill(false),lengths=[];
      for(var c=0;c<9;c++)p[a[r*9+c]]=a[s*9+c];
      for(var d=1;d<=9;d++)if(!seen[d]){var n=d,len=0;do{seen[n]=true;len++;n=p[n];}while(!seen[n]);lengths.push(len);}
      results.push(lengths.sort().join(''));
    }
    return results.sort().join('.');
  }
  function invariantFor(a){return [cycles(a),cycles(transpose(a))].sort().join('|');}
  function solutionInvariant(a){return invariantFor(grid(a));}
  function equivalentSolutions(left,right){
    var A=grid(left),B=grid(right);
    if(A.join('')===B.join(''))return true;
    // An unequal invariant proves non-equivalence; equality never proves it.
    if(invariantFor(A)!==invariantFor(B))return false;
    var rowForDigit=Array(10);for(var r=0;r<9;r++)rowForDigit[B[r*9]]=r;
    for(var t=0;t<2;t++){
      var a=t?transpose(A):A;
      for(var k=0;k<COLUMNS.length;k++){
        var cp=COLUMNS[k];
        for(var first=0;first<9;first++){
          var digits=Array(10),rowMap=Array(9),ok=true;
          for(var c=0;c<9;c++)digits[a[first*9+cp[c]]]=B[c];
          for(var ar=0;ar<9&&ok;ar++){
            var br=rowForDigit[digits[a[ar*9+cp[0]]]];rowMap[br]=ar;
            for(var j=1;j<9;j++)if(digits[a[ar*9+cp[j]]]!==B[br*9+j]){ok=false;break;}
          }
          if(!ok)continue;
          for(var band=0;band<9;band+=3)if(Math.floor(rowMap[band]/3)!==Math.floor(rowMap[band+1]/3)||Math.floor(rowMap[band]/3)!==Math.floor(rowMap[band+2]/3)){ok=false;break;}
          if(ok)return true;
        }
      }
    }
    return false;
  }
  function solutionSignature(input){
    var A=grid(input),best=null;
    // First-row digit normalization removes the 9! digit factor. For each column
    // group element and possible first row, sorting rows within bands then bands
    // gives the least representative over ALL legal row permutations.
    for(var t=0;t<2;t++){
      var a=t?transpose(A):A;
      for(var k=0;k<COLUMNS.length;k++)for(var first=0;first<9;first++){
        var cp=COLUMNS[k],digits=Array(10),bands=[];
        for(var c=0;c<9;c++)digits[a[first*9+cp[c]]]=String(c+1);
        for(var b=0;b<3;b++){
          var rows=[];for(var r=0;r<3;r++){var text='';for(var j=0;j<9;j++)text+=digits[a[(b*3+r)*9+cp[j]]];rows.push(text);}
          bands.push(rows.sort().join(''));
        }
        var candidate=bands.sort().join('');if(best===null||candidate<best)best=candidate;
      }
    }
    return 'sudoku-group-v1:'+best;
  }
  function point(r,c,t){if(t>=4)c=8-c;for(var n=0;n<t%4;n++){var old=r;r=c;c=8-old;}return [r,c];}
  function layoutSignature(mode,clues,options){
    if(typeof mode!=='string'||!clues||typeof clues!=='object'||Array.isArray(clues))throw new TypeError('Mode and normalized clue document required.');
    var known=['version','regions','cages','lines','edges','parity','outside','clones','quadruples'];
    if(Object.keys(clues).some(function(k){return known.indexOf(k)<0;}))throw new RangeError('Unsupported clue field.');
    var values=Boolean(options&&options.includeValues),best=null;
    function sorted(a){return a.slice().sort(function(a,b){return a-b;});}
    function unordered(a){return a.map(function(x){return JSON.stringify(x);}).sort();}
    for(var t=0;t<8;t++){
      var map=function(cell){if(!Number.isInteger(cell)||cell<0||cell>80)throw new RangeError('Invalid clue cell.');var p=point(Math.floor(cell/9),cell%9,t);return p[0]*9+p[1];};
      var out={};
      if(clues.regions&&clues.regions.length){if(clues.regions.length!==81)throw new RangeError('Invalid region map.');var groups={};clues.regions.forEach(function(region,i){(groups[region]||(groups[region]=[])).push(map(i));});out.regions=unordered(Object.keys(groups).map(function(k){return sorted(groups[k]);}));}
      out.cages=unordered((clues.cages||[]).map(function(c){return [sorted(c.cells.map(map)),c.unique===true,values?c.sum:null];}));
      out.lines=unordered((clues.lines||[]).map(function(l){var cells=l.cells.map(map);if(l.type!=='thermo'&&l.type!=='arrow'){var reversed=cells.slice().reverse();if(JSON.stringify(reversed)<JSON.stringify(cells))cells=reversed;}return [l.type,cells];}));
      out.edges=unordered((clues.edges||[]).map(function(e){var cells=e.cells.map(map);return [e.type,e.type==='greater'?cells:sorted(cells),values?e.value:null];}));
      out.parity=unordered((clues.parity||[]).map(function(p){return [map(p.cell),p.parity];}));
      out.outside=unordered((clues.outside||[]).map(function(o){var r=o.side==='top'?-1:o.side==='bottom'?9:o.index,c=o.side==='left'?-1:o.side==='right'?9:o.index,p=point(r,c,t);return [o.type,p,o.cells.map(map),values?o.value:null];}));
      out.clones=unordered((clues.clones||[]).map(function(c){if(c.a.length!==c.b.length)throw new RangeError('Invalid clone.');return unordered(c.a.map(function(cell,i){return sorted([map(cell),map(c.b[i])]);}));}));
      out.quadruples=unordered((clues.quadruples||[]).map(function(q){return [sorted(q.cells.map(map)),values?sorted(q.values):null];}));
      var candidate=JSON.stringify(out);if(best===null||candidate<best)best=candidate;
    }
    return 'layout-d4-v1:'+mode+':'+(values?'values:':'geometry:')+best;
  }
  return {solutionSignature:solutionSignature,solutionInvariant:solutionInvariant,equivalentSolutions:equivalentSolutions,layoutSignature:layoutSignature,
    workerSource:function(){return 'var NineRealmsDiversity=('+createDiversity.toString()+')();';}};
})();
var Generator=(function createGenerator(Engine, Hints, Sources, ClueBuilder, Diversity) {
  "use strict";
  var VERSION = 2;
  function hashWords(text) {
    // Four independently updated words; this is a non-cryptographic content key, not a security hash.
    var a = 1779033703, b = 3144134277, c = 1013904242, d = 2773480762;
    for (var i = 0; i < text.length; i++) {
      var n = text.charCodeAt(i);
      a = b ^ Math.imul(a ^ n, 597399067); b = c ^ Math.imul(b ^ n, 2869860233);
      c = d ^ Math.imul(c ^ n, 951274213); d = a ^ Math.imul(d ^ n, 2716044179);
    }
    a = Math.imul(c ^ a >>> 18, 597399067); b = Math.imul(d ^ b >>> 22, 2869860233);
    c = Math.imul(a ^ c >>> 17, 951274213); d = Math.imul(b ^ d >>> 19, 2716044179);
    var words = [(a ^ b ^ c ^ d) >>> 0, (b ^ a) >>> 0, (c ^ a) >>> 0, (d ^ a) >>> 0], index = 0;
    return function () { return words[index++ % 4]; };
  }
  function rng(seed) {
    var hash = hashWords(String(seed)), a = hash(), b = hash(), c = hash(), d = hash();
    return function () { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; var t = (a + b | 0) + d | 0; d = d + 1 | 0; a = b ^ b >>> 9; b = c + (c << 3) | 0; c = (c << 21 | c >>> 11) + t | 0; return (t >>> 0) / 4294967296; };
  }
  function fingerprint(puzzle) {
    var h = hashWords(puzzle.mode + "|" + puzzle.givens.join("") + "|" + JSON.stringify(puzzle.clues));
    return [h(), h(), h(), h()].map(function (n) { return n.toString(16).padStart(8, "0"); }).join("");
  }
  function seed() {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      return Array.from(crypto.getRandomValues(new Uint32Array(4))).map(function (n) { return n.toString(16).padStart(8, "0"); }).join("");
    }
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + "-" + Math.random().toString(36).slice(2);
  }
  function fail(code) { var error = new Error(code); error.code = code; throw error; }
  function carve(request, attempt, constructed) {
    request = request || {};
    var mode = request.mode || "classic", difficulty = request.difficulty || "easy";
    if (["easy", "medium", "hard"].indexOf(difficulty) < 0) fail("CURATED_DIFFICULTY");
    if (typeof request.seed !== "string" || !request.seed.length || request.seed.length > 256) fail("INVALID_SEED");
    var attemptSeed = request.seed + (attempt ? ":logic-" + attempt : "");
    var random = rng("carve-v" + VERSION + ":" + attemptSeed);
    var source = constructed || Engine.getPuzzle(difficulty, attemptSeed, mode, request.sourceId ? { sourceId: request.sourceId } : {});
    var context = { mode: mode, clues: source.clues };
    if (!Engine.validateComplete(source.solution, context)) fail("INVALID_TEMPLATE");
    var board = source.solution.slice(), order = board.map(function (_, i) { return i; });
    for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(random() * (i + 1)), old = order[i]; order[i] = order[j]; order[j] = old; }
    var base = (supportsDifficulty(mode) ? { easy: 44, medium: 27, hard: 25 } : { easy: 44, medium: 36, hard: 28 })[difficulty];
    var target = Math.round(board.length * (base + Math.floor(random() * 5) - 2) / 81);
    var givenCount = board.length, checks = 0, nodes = 0, rejectedByBudget = 0;
    // Uniqueness checks use reproducible node budgets; logic calibration has a separate safety budget.
    var maxNodes = 12000;
    for (var n = 0; n < order.length && givenCount > target; n++) {
      var cell = order[n], value = board[cell]; board[cell] = 0;
      var result = Engine.analyzeSolutions(board, context, { limit: 2, maxNodes: maxNodes });
      checks++; nodes += result.nodes;
      if (result.count === 1 && !result.exhausted) {
        givenCount--;
        // Stop as soon as this logical tier is reached; clue count is only a search bound.
        if (supportsDifficulty(mode) && difficulty !== "easy" && givenCount <= 44 && matchesDifficulty(board, difficulty, context)) {
          target = givenCount; break;
        }
      }
      else { board[cell] = value; if (result.exhausted) rejectedByBudget++; }
    }
    if (givenCount > target) fail("DENSITY_NOT_REACHED");
    if (board.every(function (v, k) { return Boolean(v) === Boolean(source.givens[k]); })) fail("UNCHANGED_MASK");
    var puzzle = { id: "G" + VERSION + "-" + mode + "-" + request.seed, sourceId: source.sourceId, mode: mode, difficulty: difficulty,
      givens: board, solution: source.solution.slice(), clues: source.clues, rating: "generated-density-" + difficulty };
    var key = fingerprint(puzzle);
    if (Array.isArray(request.avoidFingerprints) && request.avoidFingerprints.indexOf(key) >= 0) fail("RECENT_DUPLICATE");
    puzzle.generation = { version: VERSION, seed: request.seed, kind: "carved", difficultyBasis: "clue-density", givenCount: givenCount,
      target: target, fingerprint: key, unique: true, checks: checks, nodes: nodes, rejectedByBudget: rejectedByBudget };
    return puzzle;
  }
  function ratingTier(result) {
    if (!result || !result.solved || result.status !== "rated" || !result.steps) return null;
    // Several techniques share a rating level. The first technique at that
    // level is not evidence that it was the only one used in the full proof.
    var used = result.techniques, tiers = { "naked-single": 1, "hidden-single": 2,
      "locked-candidate": 3, "naked-pair": 3, "hidden-pair": 3 };
    if (!used || typeof used !== "object" || Array.isArray(used)) return null;
    var names = Object.keys(used), tier = 0, steps = 0;
    if (!names.length || names.some(function (name) {
      if (!Object.prototype.hasOwnProperty.call(tiers, name) || !Number.isInteger(used[name]) || used[name] <= 0) return true;
      tier = Math.max(tier, tiers[name]); steps += used[name]; return false;
    }) || steps !== result.steps) return null;
    return [null, "easy", "medium", "hard"][tier];
  }
  var deterministicDaily = false;
  function supportsDifficulty(mode) { return !deterministicDaily && Boolean(Hints && Hints.ratingModes.indexOf(mode) >= 0); }
  function matchesDifficulty(givens, difficulty, context) {
    context = context || "classic";
    var mode = typeof context === "string" ? context : context.mode;
    if (!supportsDifficulty(mode)) return false;
    var options = { maxSteps: 200, timeLimitMs: 200 };
    var result = mode === "classic" ? Hints.rateClassic(givens, context, options) : Hints.ratePuzzle(givens, context, options);
    return ratingTier(result) === difficulty;
  }
  function generate(request) {
    request = request || {};
    if (request.fresh === true) return generateFresh(request);
    var mode = request.mode || "classic";
    if (!supportsDifficulty(mode)) return carve(request, 0);
    for (var attempt = 0; attempt < (mode === "classic" ? 16 : 8); attempt++) {
      var puzzle;
      try { puzzle = carve(request, attempt); }
      catch (error) {
        if (["DENSITY_NOT_REACHED", "UNCHANGED_MASK"].indexOf(error.code) < 0) throw error;
        continue;
      }
      if (matchesDifficulty(puzzle.givens, request.difficulty || "easy", {mode:mode,clues:puzzle.clues})) {
        puzzle.generation.difficultyBasis = "supported-logic";
        puzzle.rating = "generated-logic-" + puzzle.difficulty;
        return puzzle;
      }
    }
    fail(mode === "classic" ? "CLASSIC_DIFFICULTY_NOT_REACHED" : "VARIANT_DIFFICULTY_NOT_REACHED");
  }
  function freshModes() { return Sources.supportedModes().concat(ClueBuilder.supportedModes()); }
  function supportsFresh(mode) { return freshModes().indexOf(mode) >= 0; }
  function keyFor(text) { var h=hashWords(text);return [h(),h(),h(),h()].map(function(n){return n.toString(16).padStart(8,"0");}).join(""); }
  // No answer is read by this proof. Repairs below add honest givens, then rerun it.
  function basicProof(givens, context) {
    var b=givens.slice(),steps=0,units=Engine.getUnits(context).filter(function(u){return u.cells.length===9;});
    while(b.indexOf(0)>=0){
      var masks=b.map(function(n,i){return n?[]:Engine.candidates(b,i,context);}), move=null;
      for(var i=0;i<b.length;i++)if(!b[i]&&masks[i].length===1){move=[i,masks[i][0]];break;}
      if(!move)for(var u=0;u<units.length&&!move;u++)for(var d=1;d<=9&&!move;d++){
        var places=units[u].cells.filter(function(i){return !b[i]&&masks[i].indexOf(d)>=0;});if(places.length===1)move=[places[0],d];
      }
      if(!move)return {solved:false,board:b,steps:steps};
      b[move[0]]=move[1];steps++;
    }
    return {solved:Engine.validateComplete(b,context),board:b,steps:steps};
  }
  function generateFresh(request) {
    var mode=request.mode||"classic",difficulty=request.difficulty||"easy";
    if(!supportsFresh(mode))fail("FRESH_MODE_UNSUPPORTED");
    if(["easy","medium","hard"].indexOf(difficulty)<0)fail("CURATED_DIFFICULTY");
    if(typeof request.seed!=="string"||!request.seed.length||request.seed.length>256)fail("INVALID_SEED");
    var recent=Array.isArray(request.avoidFingerprints)?request.avoidFingerprints:[],marked=ClueBuilder.supportedModes().indexOf(mode)>=0,last="FRESH_BUDGET";
    for(var attempt=0;attempt<(supportsDifficulty(mode)?12:4);attempt++){
      try {
        var seed=keyFor(request.seed+":fresh-v1:"+mode+":"+attempt);
        var source=Sources.generate({mode:marked?"classic":mode,seed:seed});
        source.mode=mode;
        if(marked)source.clues=ClueBuilder.build({mode:mode,solution:source.solution,seed:seed+":clues"});
        var baseKey=keyFor("base-v1:"+Diversity.solutionSignature(source.solution));
        var layoutKey=marked?keyFor(Diversity.layoutSignature(mode,source.clues)):null;
        if(recent.indexOf(baseKey)>=0||layoutKey&&recent.indexOf(layoutKey)>=0){last="RECENT_STRUCTURE_DUPLICATE";continue;}
        var puzzle=carve(request,attempt,source),context={mode:mode,clues:puzzle.clues},repairs=0;
        if(supportsDifficulty(mode)) { if(!matchesDifficulty(puzzle.givens,difficulty,context)){last="FRESH_DIFFICULTY_NOT_REACHED";continue;} }
        else {
          var proof=basicProof(puzzle.givens,context);
          while(!proof.solved&&repairs<12){var i=proof.board.indexOf(0);puzzle.givens[i]=puzzle.solution[i];repairs++;proof=basicProof(puzzle.givens,context);}
          if(!proof.solved){last="FRESH_LOGIC_NOT_REACHED";continue;}
        }
        var contribution=0;
        if(marked){puzzle.givens.forEach(function(n,i){if(!n&&Engine.candidates(puzzle.givens,i,context).length<Engine.candidates(puzzle.givens,i,"classic").length)contribution++;});if(!contribution){last="FRESH_RULE_NOT_USED";continue;}}
        puzzle.id="FRESH1-"+mode+"-"+request.seed;puzzle.sourceId=null;
        puzzle.generation.version=3;puzzle.generation.kind="constructed";
        puzzle.generation.difficultyBasis=supportsDifficulty(mode)?"supported-logic":"clue-density";
        puzzle.generation.givenCount=puzzle.givens.filter(Boolean).length;puzzle.generation.target=puzzle.generation.givenCount;
        puzzle.generation.fingerprint=fingerprint(puzzle);puzzle.generation.baseFingerprint=baseKey;
        if(layoutKey)puzzle.generation.layoutFingerprint=layoutKey;
        puzzle.generation.logicVerified=true;puzzle.generation.logicRepairs=repairs;puzzle.generation.ruleReductions=contribution;
        if(recent.indexOf(puzzle.generation.fingerprint)>=0){last="RECENT_DUPLICATE";continue;}
        puzzle.rating=supportsDifficulty(mode)?"generated-logic-"+difficulty:"constructed-rule-path-"+difficulty;
        return puzzle;
      }catch(error){if(["DIVERSITY_BUDGET","DIVERSITY_LAYOUT_UNAVAILABLE","DENSITY_NOT_REACHED","UNCHANGED_MASK","RECENT_DUPLICATE"].indexOf(error.code)<0)throw error;last=error.code;}
    }
    fail(last);
  }
  function createClient() {
    var active = null;
    function cancel() { if (active) active.cancel(); }
    function run(request) {
      cancel();
      return new Promise(function (resolve, reject) {
        if (typeof Worker === "undefined" || typeof Blob === "undefined" || !Engine.workerSource) { reject(new Error("WORKER_UNAVAILABLE")); return; }
        var worker, url, timer, settled = false;
        function finish(error, result) {
          if (settled) return; settled = true;
          clearTimeout(timer); if (worker) worker.terminate(); if (url) URL.revokeObjectURL(url);
          active = null; if (error) reject(error); else resolve(result);
        }
        active = { cancel: function () { var e = new Error("GENERATION_CANCELLED"); e.name = "AbortError"; finish(e); } };
        try {
          var source = Engine.workerSource() + Hints.workerSource() + Sources.workerSource() + ClueBuilder.workerSource() + Diversity.workerSource() + "var generator=(" + createGenerator.toString() + ")(SudokuEngine,SudokuHints,NineRealmsDiversitySource,NineRealmsDiversityClues,NineRealmsDiversity);\n" +
            "self.onmessage=function(event){try{self.postMessage({puzzle:generator.generate(event.data)});}catch(error){self.postMessage({error:error.code||error.message});}};";
          url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
          worker = new Worker(url);
          worker.onmessage = function (event) { if (event.data.error) finish(new Error(event.data.error)); else finish(null, event.data.puzzle); };
          worker.onerror = function () { finish(new Error("WORKER_FAILED")); };
          // Watchdog never returns a half-checked puzzle; caller may retain/fall back to a library puzzle.
          timer = setTimeout(function () { finish(new Error("GENERATION_TIMEOUT")); }, 8000);
          worker.postMessage(request);
        } catch (error) { finish(error); }
      });
    }
    return { run: run, cancel: cancel };
  }
  function generateDaily(request) { deterministicDaily = true; try { return generate(request); } finally { deterministicDaily = false; } }
  return { generate: generate, generateDaily: generateDaily, createClient: createClient, fingerprint: fingerprint, seed: seed, version: VERSION,
    supportsFresh: supportsFresh, freshModes: freshModes, basicProof: basicProof, matchesDifficulty: matchesDifficulty, supportsDifficulty: supportsDifficulty, ratingTier: ratingTier };
})(Engine,Hints,Sources,Clues,Diversity);
function generate(options){
 options=options||{};
 if(['classic','diagonal','hyper','knight','thermo','killer','arrow','thermo-killer'].indexOf(options.mode)<0)throw new RangeError('Frozen daily v1 mode unsupported.');
 return Generator.generateDaily({mode:options.mode,difficulty:'easy',seed:options.seed,fresh:true});
}
return {version:1,generate:generate,workerSource:function(){return 'var NineRealmsDailyGeneratorV1=('+createFrozenDailyV1.toString()+')(SudokuEngine,SudokuHints);';}};
});
