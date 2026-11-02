/* Four optional, independently verified paper archives. Never changes the main game. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./voyage.js'));else root.NineRealmsSecretArchives=factory(root.SudokuVoyage);})(typeof globalThis!=='undefined'?globalThis:this,function(Voyage){
 'use strict';
 var oldIds=['gate','visitor','lotus','constellation','gravity','rain','crane'],ids=['fragment','twins','observatory','homecoming-notes'];
 var givens={fragment:[1,2,0,4,0,4,1,0,0,1,4,0,4,0,0,1],twins:[0,0,3,4,3,4,0,0,0,0,4,3,4,3,0,0]};
 var routeIds=['lines-rise-v1','lines-mirror-v1','lines-spectrum-v1','sums-sparks-v1','sums-arrows-v1','sums-constellation-v1','fusion-homecoming-v1'];
 function copy(x){return JSON.parse(JSON.stringify(x));}
 function fail(message){throw new TypeError(message||'互动档案格式无效。');}
 function shape(x,keys){if(!x||typeof x!=='object'||Array.isArray(x)||![Object.prototype,null].includes(Object.getPrototypeOf(x))||Object.keys(x).some(function(k){return keys.indexOf(k)<0;}))fail();}
 function dense(x){return Array.isArray(x)&&Object.keys(x).length===x.length&&Array.from({length:x.length},function(_,i){return Object.prototype.hasOwnProperty.call(x,i);}).every(Boolean);}
 function digits(x,length,max){return dense(x)&&x.length===length&&x.every(function(n){return Number.isInteger(n)&&n>=0&&n<=max;});}
 function miniValid(board,clues,complete){
  if(!digits(board,16,4)||!digits(clues,16,4)||board.some(function(n,i){return clues[i]&&n!==clues[i];})||complete&&board.some(function(n){return !n;}))return false;
  var units=[];for(var r=0;r<4;r++){var row=[],col=[];for(var c=0;c<4;c++){row.push(r*4+c);col.push(c*4+r);}units.push(row,col);}
  for(var br=0;br<4;br+=2)for(var bc=0;bc<4;bc+=2)units.push([br*4+bc,br*4+bc+1,(br+1)*4+bc,(br+1)*4+bc+1]);
  return units.every(function(u){var a=u.map(function(i){return board[i];}).filter(Boolean);return new Set(a).size===a.length;});
 }
 function enumerateMini(clues){
  if(!digits(clues,16,4)||!miniValid(clues,clues,false))return [];var board=clues.slice(),solutions=[];
  function visit(){var index=board.indexOf(0);if(index<0){solutions.push(board.slice());return;}for(var n=1;n<=4;n++){board[index]=n;if(miniValid(board,clues,false))visit();}board[index]=0;}visit();return solutions;
 }
 var miniSolutions={fragment:enumerateMini(givens.fragment),twins:enumerateMini(givens.twins)};
 if(miniSolutions.fragment.length!==1||miniSolutions.twins.length<2)throw new Error('档案题面验证失败');
 function mini(id){if(!givens[id])fail('未知教学纸片。');return {givens:givens[id].slice(),firstSolution:miniSolutions[id][0].slice(),solutionCount:miniSolutions[id].length};}
 function observe(thermo,sum){
  var values=[],candidates=[[],[],[],[]];for(var a=1;a<=9;a++)for(var b=1;b<=9;b++)for(var c=1;c<=9;c++)for(var d=1;d<=9;d++)if((!thermo||a<b&&b<c&&c<d)&&(!sum||c+d===7))values.push([a,b,c,d]);
  values.forEach(function(v){v.forEach(function(n,i){if(candidates[i].indexOf(n)<0)candidates[i].push(n);});});candidates.forEach(function(a){a.sort(function(x,y){return x-y;});});return {count:values.length,candidates:candidates};
 }
 function observationValid(values){return digits(values,4,9)&&values.every(Boolean)&&values[0]<values[1]&&values[1]<values[2]&&values[2]<values[3]&&values[2]+values[3]===7;}
 function routeNodes(){return Voyage.journey({}).stages.filter(function(s){return routeIds.indexOf(s.id)>=0;}).map(function(s){return {id:s.id,title:s.title,requires:s.requires.filter(function(id){return routeIds.indexOf(id)>=0;})};});}
 function routeDraft(order){return dense(order)&&order.length<=routeIds.length&&new Set(order).size===order.length&&order.every(function(id){return routeIds.indexOf(id)>=0;});}
 function checkRoute(order){
  if(!routeDraft(order))return {ok:false,message:'每处航点只能出现一次，请排列七处已知航点。'};
  var nodes=routeNodes(),seen=[];for(var i=0;i<order.length;i++){var node=nodes.find(function(n){return n.id===order[i];}),missing=node.requires.filter(function(id){return seen.indexOf(id)<0;});if(missing.length)return {ok:false,index:i,missing:missing,message:'第 '+(i+1)+' 步“'+node.title+'”尚缺前置：'+missing.map(function(id){return nodes.find(function(n){return n.id===id;}).title;}).join('、')+'。分支可交错，但依赖不能倒置。'};seen.push(node.id);}
  return order.length===routeIds.length?{ok:true,message:'这条航线满足真实主线依赖。两条分支可以交错；合法次序不止一种。'}:{ok:false,message:'已排 '+order.length+' / '+routeIds.length+' 处；请排完后验证。'};
 }
 function defaults(){return {version:1,drafts:{fragment:givens.fragment.slice(),twins:givens.twins.slice(),observatory:{values:[0,0,0,0],thermo:true,sum:false},route:[]},proofs:{}};}
 function check(id,value){
  if(id==='fragment')return {ok:miniValid(value,givens.fragment,true),message:'每行、每列及每个 2×2 宫都要有 1–4，给定不能改变。'};
  if(id==='twins')return {ok:miniValid(value,givens.twins,true)&&JSON.stringify(value)!==JSON.stringify(miniSolutions.twins[0]),message:'须满足同一题面的行、列、2×2 宫，且不同于展示的首份解；两个合法答案就足以反证唯一性。'};
  if(id==='observatory')return {ok:observationValid(value),message:'须同时满足四格严格递增、末两格和为 7。'};
  if(id==='homecoming-notes')return checkRoute(value);fail('未知互动档案。');
 }
 function validateEnvelope(value){
  shape(value,['version','found','archives']);if(value.version!==1||!dense(value.found)||new Set(value.found).size!==value.found.length||!value.found.every(function(id){return oldIds.concat(ids).indexOf(id)>=0;}))fail('彩蛋收藏版本或编号无效。');
  if(value.archives!==undefined){
   var a=value.archives;shape(a,['version','drafts','proofs']);if(a.version!==1)fail('不支持此互动档案版本；原数据应保留。');shape(a.drafts,['fragment','twins','observatory','route']);shape(a.proofs,ids);
   ['fragment','twins'].forEach(function(id){if(!digits(a.drafts[id],16,4)||a.drafts[id].some(function(n,i){return givens[id][i]&&n!==givens[id][i];}))fail('纸片草稿无效。');});
   shape(a.drafts.observatory,['values','thermo','sum']);if(!digits(a.drafts.observatory.values,4,9)||typeof a.drafts.observatory.thermo!=='boolean'||typeof a.drafts.observatory.sum!=='boolean'||!routeDraft(a.drafts.route))fail('观测草稿无效。');
   Object.keys(a.proofs).forEach(function(id){if(!check(id,a.proofs[id]).ok||value.found.indexOf(id)<0)fail('互动档案完成证据无效。');});
  }
  ids.forEach(function(id){if(value.found.indexOf(id)>=0&&(!value.archives||!Object.prototype.hasOwnProperty.call(value.archives.proofs,id)))fail('互动档案缺少完成证据。');});return copy(value);
 }
 function withArchives(value){var result=validateEnvelope(value);if(!result.archives)result.archives=defaults();return result;}
 function submit(value,id){var result=withArchives(value),d=result.archives.drafts,answer=id==='observatory'?d.observatory.values:id==='homecoming-notes'?d.route:d[id],verdict=check(id,answer);if(!verdict.ok)return {ok:false,message:verdict.message};result.archives.proofs[id]=copy(answer);if(result.found.indexOf(id)<0)result.found.push(id);return {ok:true,value:validateEnvelope(result),message:verdict.message};}
 return {ids:ids.slice(),oldIds:oldIds.slice(),mini:mini,miniValid:miniValid,enumerateMini:enumerateMini,observe:observe,observationValid:observationValid,routeNodes:routeNodes,checkRoute:checkRoute,defaults:defaults,check:check,validateEnvelope:validateEnvelope,withArchives:withArchives,submit:submit};
});
