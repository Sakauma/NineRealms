/* New constraint geometry derived solely from a supplied solved grid and seed.
 * Does not sample or transform bank clues. Uniqueness belongs to the digger. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'));
  else root.NineRealmsDiversityClues=factory(root.SudokuEngine);
})(typeof globalThis!=='undefined'?globalThis:this,function createDiversityClues(Engine){
  'use strict';
  var MODES=['thermo','killer','arrow','thermo-killer','renban','whispers','odd-even','greater','kropki','xv','quadruple','sandwich','skyscraper','xsum','littlekiller','palindrome','between','lockout','entropic','modular','region-sum','clone'];
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
    var pool=[],seen=new Set(),limit=type==='arrow'?5:6;
    function accept(path){
      var values=path.map(function(i){return solution[i];});
      if(type==='arrow'&&values.slice(1).reduce(function(a,b){return a+b;},0)!==values[0])return;
      if(type==='renban'&&(new Set(values).size!==values.length||Math.max.apply(null,values)-Math.min.apply(null,values)!==values.length-1))return;
      var key=path.join(',');if(type==='renban'||type==='whispers'){var reverse=path.slice().reverse().join(',');if(reverse<key)key=reverse;}
      if(!seen.has(key)){seen.add(key);pool.push(path.slice());}
    }
    function walk(path){
      if(path.length>=3)accept(path);
      if(path.length===limit)return;
      var last=path[path.length-1];
      neighbours(last).forEach(function(next){
        if(path.indexOf(next)>=0)return;
        // Longer paths must not fold back alongside themselves or close a loop.
        if(path.slice(0,-1).some(function(i){return neighbours(i).indexOf(next)>=0;}))return;
        if(type==='thermo'&&solution[next]<=solution[last])return;
        if(type==='whispers'&&Math.abs(solution[next]-solution[last])<5)return;
        if(type==='renban'&&path.some(function(i){return solution[i]===solution[next];}))return;
        if(type==='arrow'&&path.slice(1).reduce(function(sum,i){return sum+solution[i];},solution[next])>solution[path[0]])return;
        walk(path.concat(next));
      });
    }
    cells().forEach(function(i){walk([i]);});
    // Seeded composition preferences, not labels or promises about solving.
    // 0: one longer route plus short accents; 1: dispersed short routes;
    // 2: favour routes crossing boxes. Facts are reported by describeLayout.
    var profile=Math.floor(rng()*3),target=profile===1?4:2+Math.floor(rng()*2);
    var occupied=new Set(),selected=[],used=0,ranked=shuffle(pool,rng),weights=new Map();
    ranked.forEach(function(path){weights.set(path,rng()*8);});
    function boxes(path){return new Set(path.map(function(i){return Math.floor(i/27)*3+Math.floor(i%9/3);}));}
    while(selected.length<target){
      var covered=boxes(Array.from(occupied)),best=null,bestScore=-Infinity;
      ranked.forEach(function(path){
        if(used+path.length>18||path.some(function(i){return occupied.has(i)||neighbours(i).some(function(j){return occupied.has(j);});}))return;
        var span=boxes(path),fresh=Array.from(span).filter(function(b){return !covered.has(b);}).length;
        var lengthPreference=profile===0?(selected.length===0?path.length*3:-Math.abs(path.length-3)*3):profile===1?-Math.abs(path.length-3)*3:path.length;
        var score=lengthPreference+fresh*3+(profile===2?(span.size-1)*5:0)+weights.get(path);
        if(score>bestScore){bestScore=score;best=path;}
      });
      if(!best)break;
      selected.push({type:type,cells:best});used+=best.length;best.forEach(function(i){occupied.add(i);});
    }
    if(selected.length<2)throw failure('Not enough separated '+type+' paths on this solution.');
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
  function markedLineLayout(solution,type,rng){
    var pool=[],seen=new Set(),limit=type==='region-sum'?6:type==='palindrome'?3:5;
    function box(i){return Math.floor(i/27)*3+Math.floor(i%9/3);}
    function segments(path){var out=[];path.forEach(function(i){if(!out.length||out[out.length-1].box!==box(i))out.push({box:box(i),cells:[]});out[out.length-1].cells.push(i);});return out;}
    function accept(path){
      if(path.length<3)return;
      var values=path.map(function(i){return solution[i];}),a=values[0],b=values[values.length-1],low=Math.min(a,b),high=Math.max(a,b);
      if(type==='palindrome'&&a!==b)return;
      if(type==='between'&&(high-low<2||!values.slice(1,-1).every(function(n){return low<n&&n<high;})))return;
      if(type==='lockout'&&(high-low<4||!values.slice(1,-1).every(function(n){return n<low||n>high;})))return;
      if(type==='region-sum'){
        var parts=segments(path);if(parts.length!==2||parts.some(function(p){return p.cells.length<2;}))return;
        if(parts[0].cells.reduce(function(sum,i){return sum+solution[i];},0)!==parts[1].cells.reduce(function(sum,i){return sum+solution[i];},0))return;
      }
      var key=path.join(','),reverse=path.slice().reverse().join(',');if(reverse<key)key=reverse;
      if(!seen.has(key)){seen.add(key);pool.push(path.slice());}
    }
    function walk(path){
      accept(path);if(path.length===limit)return;
      var last=path[path.length-1];
      neighbours(last).forEach(function(next){
        if(path.indexOf(next)>=0)return;
        // Avoid nearly closed loops/U-shapes touching an earlier part of a line.
        if(path.slice(0,-1).some(function(i){return neighbours(i).indexOf(next)>=0;}))return;
        if(type==='entropic'||type==='modular'){
          var group=function(i){return type==='entropic'?Math.floor((solution[i]-1)/3):(solution[i]-1)%3;};
          if(path.slice(-2).some(function(i){return group(i)===group(next);}))return;
        }
        var candidate=path.concat(next);
        if(type==='region-sum'){
          var parts=segments(candidate);
          if(parts.length>2||parts.some(function(p){return p.cells.length>3;})||parts.length===2&&parts[0].cells.length<2)return;
        }
        walk(candidate);
      });
    }
    cells().forEach(function(i){walk([i]);});
    var occupied=new Set(),selected=[],target=type==='region-sum'?3:4;
    shuffle(pool,rng).forEach(function(path){if(selected.length>=target||path.some(function(i){return occupied.has(i);}))return;selected.push({type:type,cells:path});path.forEach(function(i){occupied.add(i);});});
    if(selected.length<2)throw failure('Not enough clear '+type+' paths on this solution.');
    return selected;
  }
  function cloneLayout(solution,rng){
    // Two-cell dominoes give connected, recognisable translated shapes. No
    // reflections, arbitrary distant-cell pairs, or matching by digit relabeling.
    var buckets=Object.create(null),pool=[];
    cells().forEach(function(i){[1,9].forEach(function(step){
      if(step===1&&i%9===8||i+step>=81)return;
      var key=step+':'+solution[i]+':'+solution[i+step],group=[i,i+step];
      (buckets[key]||(buckets[key]=[])).forEach(function(other){
        if(group.some(function(a){return other.indexOf(a)>=0||neighbours(a).some(function(b){return other.indexOf(b)>=0;});}))return;
        pool.push({a:other.slice(),b:group.slice()});
      });
      buckets[key].push(group);
    });});
    var occupied=new Set(),selected=[];
    shuffle(pool,rng).forEach(function(pair){var all=pair.a.concat(pair.b);if(selected.length>=3||all.some(function(i){return occupied.has(i);}))return;selected.push(pair);all.forEach(function(i){occupied.add(i);});});
    if(selected.length<2)throw failure('Not enough separated translated clone shapes.');
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
  function describeLayout(clues){
    if(!clues||!Array.isArray(clues.lines))throw new TypeError('Normalized clues are required.');
    var lengths=[],covered=new Set(),crossBoxLines=0,turns=0;
    clues.lines.forEach(function(line){
      lengths.push(line.cells.length);var boxes=new Set();
      line.cells.forEach(function(cell,i){var b=Math.floor(cell/27)*3+Math.floor(cell%9/3);boxes.add(b);covered.add(b);if(i>1&&cell-line.cells[i-1]!==line.cells[i-1]-line.cells[i-2])turns++;});
      if(boxes.size>1)crossBoxLines++;
    });
    return {lineCount:lengths.length,lineLengths:lengths,markedCells:lengths.reduce(function(a,b){return a+b;},0),coveredBoxes:covered.size,crossBoxLines:crossBoxLines,turnCount:turns,mixedLengths:new Set(lengths).size>1};
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
    if(['palindrome','between','lockout','entropic','modular','region-sum'].indexOf(mode)>=0)clues.lines=markedLineLayout(solution,mode,rng);
    if(mode==='clone')clues.clones=cloneLayout(solution,rng);
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
  return {version:1,supportedModes:function(){return MODES.slice();},layoutDiversity:function(mode){return MODES.indexOf(mode)>=0;},describeLayout:describeLayout,build:build,
    workerSource:function(){return "var NineRealmsDiversityClues=("+createDiversityClues.toString()+")(SudokuEngine);";}};
});
