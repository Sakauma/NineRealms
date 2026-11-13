/* Exact 9x9 solution equivalence; layout keys cover D4 geometry, NOT graph isomorphism. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.NineRealmsDiversity=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function createDiversity(){
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
});
