/* Player reasoning marks only: never solver constraints or certified deductions. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.NineRealmsDrafts=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
var TYPES=['same','different','association'],LIMITS={links:64,cages:81,combinations:126};
function fail(){throw new TypeError('推理草稿格式无效或超出容量。');}
function integer(x,max){return Number.isInteger(x)&&x>=0&&x<=max;}
function object(x,keys){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(function(k){return keys.indexOf(k)<0;})||Object.keys(x).length!==keys.length)fail();var p=Object.getPrototypeOf(x);if(p!==Object.prototype&&p!==null)fail();}
function dense(a){return Array.isArray(a)&&Object.keys(a).length===a.length&&Array.from(a).every(function(v){return v!==undefined;});}
function size(n){if([81,153,369].indexOf(n)<0)fail();}
function empty(n){size(n);return {version:1,colors:Array(n).fill(0),marks:Array(n).fill(0),links:[],cages:[]};}
function values(mask){var a=[];for(var d=1;d<=9;d++)if(mask&(1<<(d-1)))a.push(d);return a;}
function validate(input,n,clues){size(n);if(input===undefined)return empty(n);object(input,['version','colors','marks','links','cages']);if(input.version!==1)fail();
 if(!dense(input.colors)||input.colors.length!==n||!input.colors.every(function(v){return integer(v,4);})||!dense(input.marks)||input.marks.length!==n||!input.marks.every(function(v){return integer(v,3);})||!dense(input.links)||input.links.length>LIMITS.links||!dense(input.cages)||input.cages.length>LIMITS.cages)fail();
 var out={version:1,colors:input.colors.slice(),marks:input.marks.slice(),links:[],cages:[]},seen=new Set();
 input.links.forEach(function(l){object(l,['a','b','type']);if(!integer(l.a,n-1)||!integer(l.b,n-1)||l.a>=l.b||TYPES.indexOf(l.type)<0||seen.has(l.a+':'+l.b))fail();seen.add(l.a+':'+l.b);out.links.push({a:l.a,b:l.b,type:l.type});});
 seen=new Set();input.cages.forEach(function(c){object(c,['index','combinations']);if(!integer(c.index,80)||seen.has(c.index)||!dense(c.combinations)||c.combinations.length>LIMITS.combinations||new Set(c.combinations).size!==c.combinations.length)fail();seen.add(c.index);
  var cage=clues&&Array.isArray(clues.cages)?clues.cages[c.index]:null;if(clues!==undefined&&!cage)fail();
  c.combinations.forEach(function(mask){if(!integer(mask,511)||!mask)fail();if(cage){var digits=values(mask);if(digits.length!==cage.cells.length||digits.reduce(function(s,v){return s+v;},0)!==cage.sum)fail();}});
  out.cages.push({index:c.index,combinations:c.combinations.slice()});
 });return out;
}
function setCell(draft,n,index,color,mark,clues){var out=validate(draft,n,clues);if(!integer(index,n-1)||!integer(color,4)||!integer(mark,3))fail();out.colors[index]=color;out.marks[index]=mark;return out;}
function setLink(draft,n,a,b,type,clues){var out=validate(draft,n,clues);if(!integer(a,n-1)||!integer(b,n-1)||a===b)fail();var low=Math.min(a,b),high=Math.max(a,b);out.links=out.links.filter(function(l){return l.a!==low||l.b!==high;});if(type!==null){if(TYPES.indexOf(type)<0)fail();out.links.push({a:low,b:high,type:type});out.links.sort(function(a,b){return a.a-b.a||a.b-b.b;});}return validate(out,n,clues);}
function setCage(draft,n,index,combinations,clues){var out=validate(draft,n,clues);out.cages=out.cages.filter(function(c){return c.index!==index;});if(combinations!==null)out.cages.push({index:index,combinations:combinations.slice()});out.cages.sort(function(a,b){return a.index-b.index;});return validate(out,n,clues);}
function cageCombinations(cage){if(!cage||!Array.isArray(cage.cells)||!Number.isInteger(cage.sum))fail();var out=[];for(var mask=1;mask<512;mask++){var digits=values(mask);if(digits.length===cage.cells.length&&digits.reduce(function(s,v){return s+v;},0)===cage.sum)out.push(mask);}return out;}
function equal(a,b,n){return JSON.stringify(validate(a,n))===JSON.stringify(validate(b,n));}
return {empty:empty,validate:validate,clone:validate,setCell:setCell,setLink:setLink,setCage:setCage,clear:empty,values:values,cageCombinations:cageCombinations,equal:equal,limits:LIMITS,linkTypes:TYPES.slice()};
});
