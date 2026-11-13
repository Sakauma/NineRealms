/* Small rule deductions from local assignments, without an answer or search oracle. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'));else root.NineRealmsVariantTraining=factory(root.SudokuEngine);})(typeof globalThis!=='undefined'?globalThis:this,function(E){
 'use strict';
 var DEFINITIONS=[
  {id:'killer-sum-1',technique:'killer-sum',mode:'killer',cells:[0,1,2],sum:6,given:{},title:'三格合成 6'},
  {id:'killer-sum-2',technique:'killer-sum',mode:'killer',cells:[9,10,11],sum:10,given:{9:4},title:'先扣掉已知数'},
  {id:'thermo-bounds-1',technique:'thermo-bounds',mode:'thermo',cells:[0,1,2,3],given:{},title:'给递增留出位置'},
  {id:'thermo-bounds-2',technique:'thermo-bounds',mode:'thermo',cells:[18,19,29,39],given:{19:4},title:'从已知的 4 向两端看'},
  {id:'arrow-sum-1',technique:'arrow-sum',mode:'arrow',cells:[0,1,2],given:{0:6},title:'把圆圈 6 拆开'},
  {id:'arrow-sum-2',technique:'arrow-sum',mode:'arrow',cells:[0,1,11,21],given:{0:7,11:3},title:'箭身可以在哪些位置重复'}
 ];
 var NAMES={'killer-sum':'杀手笼组合','thermo-bounds':'温度计范围','arrow-sum':'箭头求和'},cache=Object.create(null);
 function copy(x){return JSON.parse(JSON.stringify(x));}
 function has(id){return typeof id==='string'&&DEFINITIONS.some(function(d){return d.id===id;});}
 function name(i){return '第 '+(Math.floor(i/9)+1)+' 行第 '+(i%9+1)+' 列';}
 function digits(m){var a=[];for(var n=1;n<=9;n++)if(m&(1<<(n-1)))a.push(n);return a;}
 function definition(id){var d=DEFINITIONS.find(function(d){return d.id===id;});if(!d)throw new RangeError('没有这道规则练习。');return d;}
 function cluesFor(d){
  if(d.mode!=='killer')return E.normalizeClues(d.mode,{version:1,lines:[{type:d.mode,cells:d.cells}]});
  var row=Math.floor(d.cells[0]/9),cages=[{cells:d.cells,sum:d.sum,unique:true}];
  for(var r=0;r<9;r++){var cells=Array.from({length:9},function(_,c){return r*9+c;}).filter(function(i){return d.cells.indexOf(i)<0;});if(cells.length)cages.push({cells:cells,sum:r===row?45-d.sum:45,unique:true});}
  return E.normalizeClues('killer',{version:1,cages:cages});
 }
 function trusted(id){
  if(cache[id])return cache[id];var d=definition(id),board=Array(81).fill(0);Object.keys(d.given).forEach(function(i){board[Number(i)]=d.given[i];});
  var masks=board.map(function(v,i){return v?0:E.candidates(board,i,'classic').reduce(function(m,n){return m|1<<(n-1);},0);}),values=[],allowed=d.cells.map(function(){return new Set();}),assignments=[],peers=d.cells.map(function(i){return E.getPeers(i,'classic');});
  function possible(){
   for(var i=0;i<values.length;i++)for(var j=0;j<i;j++)if(values[i]===values[j]&&(d.mode==='killer'||peers[i].indexOf(d.cells[j])>=0))return false;
   if(d.mode==='thermo'){for(var k=1;k<values.length;k++)if(values[k]<=values[k-1])return false;return true;}
   var sum=values.reduce(function(s,n){return s+n;},0),remaining=d.cells.length-values.length;
   if(d.mode==='killer')return sum+remaining<=d.sum&&sum+9*remaining>=d.sum;
   if(values.length<2)return true;var body=sum-values[0];return body+remaining<=values[0]&&body+9*remaining>=values[0];
  }
  function visit(position){if(position===d.cells.length){assignments.push(values.slice());values.forEach(function(n,i){allowed[i].add(n);});return;}var cell=d.cells[position],choices=board[cell]?[board[cell]]:digits(masks[cell]);choices.forEach(function(n){values.push(n);if(possible())visit(position+1);values.pop();});}
  visit(0);if(!assignments.length)throw new Error('规则练习缺少合法的局部组合。');
  var combinations=d.mode==='killer'?Array.from(new Set(assignments.map(function(a){return a.slice().sort(function(a,b){return a-b;}).join('、');}))):[];
  var evidence=[];d.cells.forEach(function(cell,position){if(board[cell])return;digits(masks[cell]).forEach(function(n){if(allowed[position].has(n))return;
   var premise=d.mode==='killer'?'笼和为 '+d.sum+'，笼内不重复；结合已填数字，可行数字组合为 '+combinations.map(function(c){return '{'+c+'}';}).join('、')+'（组合不指定格子次序）':d.mode==='thermo'?'按标号从球端到尖端严格递增；第 '+(position+1)+' 格既要给前后留出位置，也要遵守路径上已填的数字':'圆圈等于全部箭身之和；只按行列宫限制相同数字，不额外禁止不同区域的箭身格重复';
   evidence.push({index:cell,digit:n,technique:d.technique,kind:d.technique,focusCells:d.cells.slice(),allowed:Array.from(allowed[position]).sort(function(a,b){return a-b;}),assignmentCount:assignments.length,explanation:premise+'。'+(d.mode==='killer'?'笼内第 '+(position+1)+' 格':d.mode==='thermo'?'路径第 '+(position+1)+' 格':position?'箭身第 '+position+' 格':'圆圈')+'在这些规则下只可能为 '+Array.from(allowed[position]).sort(function(a,b){return a-b;}).join('、')+'，因此可排除 '+n+'。'});
  });});if(!evidence.length)throw new Error('规则练习没有新的候选排除。');
  return cache[id]={d:d,board:board,masks:masks,clues:cluesFor(d),assignments:assignments,evidence:evidence};
 }
 function stations(){return [
  {id:'killer-sum',title:'笼中组合站',technique:NAMES['killer-sum'],route:'sums',after:'sums-sparks-v1',description:'先读总和，扣掉已填数，再检查不重复的组合。'},
  {id:'thermo-bounds',title:'递增范围站',technique:NAMES['thermo-bounds'],route:'lines',after:'lines-rise-v1',description:'从球端到尖端，为后面的数字留出递增空间。'},
  {id:'arrow-sum',title:'光束拆分站',technique:NAMES['arrow-sum'],route:'sums',after:'sums-arrows-v1',description:'把圆圈拆成箭身之和，区分求和与行列宫的不重复。'}
 ].map(function(s){s.exerciseIds=DEFINITIONS.filter(function(d){return d.technique===s.id;}).map(function(d){return d.id;});return s;});}
 function exercises(technique){return DEFINITIONS.filter(function(d){return !technique||d.technique===technique;}).map(function(d){return {id:d.id,stationId:d.technique,technique:d.technique,title:NAMES[d.technique]+' · '+d.title,sourceId:'local-'+d.id};});}
 function exercise(id){var t=trusted(id),d=t.d;return copy({id:id,stationId:d.technique,technique:d.technique,mode:d.mode,clues:t.clues,title:NAMES[d.technique]+' · '+d.title,sourceId:'local-'+id,givens:t.board,board:t.board,masks:t.masks,candidateMasks:t.masks,focusCells:d.cells,viewCells:d.cells,local:true,cellLabels:d.cells.map(function(_,i){return d.mode==='thermo'?(i===0?'① 球端':String(i+1)+' · '+(i===d.cells.length-1?'尖端':'路径')):d.mode==='arrow'?(i===0?'圆圈':'箭身 '+i):'笼内 '+(i+1);}),ruleLabel:d.mode==='killer'?'笼和 '+d.sum+' · 各格不重复':d.mode==='thermo'?'按标号从球端到尖端严格递增':'圆圈 = 所有箭身格之和',prior:[],observe:'观察已填数字和这组局部规则，找一处有证据的候选排除。',task:'选择下方一个空格，再选择能由这条规则排除的候选。证明一处即可。',scope:'独立局部规则练习，不是完整题目的难度评级，不改变正式棋局。',candidateNote:(d.id==='arrow-sum-1'?'这三格同宫；':d.id==='arrow-sum-2'?'前三格同宫；箭身 3 与它们不同行、列或宫。':'')+'先显示行列宫基础候选，请结合这组线索排除。'});}
 function check(id,index,digit){var t=trusted(id);if(!Number.isInteger(index)||index<0||index>=81||!Number.isInteger(digit)||digit<1||digit>9)return {ok:false,correct:false,code:'invalid-input',message:'请选择练习中的空格和 1–9 候选。'};if(t.d.cells.indexOf(index)<0)return {ok:false,correct:false,code:'outside-exercise',message:'请只观察这组局部规则中的格子。'};if(t.board[index])return {ok:false,correct:false,code:'filled-cell',message:'这格已有数字，请选择空格。'};if(!(t.masks[index]&(1<<(digit-1))))return {ok:false,correct:false,code:'not-candidate',message:'这不是当前基础候选，不算一次新的排除。'};var proof=t.evidence.find(function(e){return e.index===index&&e.digit===digit;});if(!proof)return {ok:false,correct:false,code:'unproved-by-technique',message:'这条局部规则仍允许该候选，不能据此删除。'};return {ok:true,correct:true,code:'proved',message:'证明成立：'+proof.explanation,proof:copy(proof)};}
 function explain(id,stage){var t=trusted(id);if(!Number.isInteger(stage)||stage<0||stage>2)throw new RangeError('讲解阶段无效。');if(stage===0)return {stage:0,title:'观察',text:'先读已填数字，再核对其余格的候选；也可以先尝试一次有证据的排除。'};if(stage===1)return {stage:1,title:'推理',text:t.evidence[0].explanation.split('，因此')[0]+'。',prior:[]};return {stage:2,title:'核对删除',text:'以下删除均无合法的局部组合支持；查看讲解不算完成。',eliminations:t.d.cells.map(function(i){return {index:i,values:t.evidence.filter(function(e){return e.index===i;}).map(function(e){return e.digit;})};}).filter(function(c){return c.values.length;}),proofs:copy(t.evidence)};}
 return {has:has,stations:stations,exercises:exercises,exercise:exercise,check:check,explain:explain};
});
