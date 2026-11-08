'use strict';
const E=require('../src/engine.js');
function openPuzzle(mode){
 const solution=Array.from({length:81},(_,i)=>(Math.floor(i/9)*3+Math.floor(Math.floor(i/9)/3)+i%9)%9+1),other=solution.map(n=>n===7?8:n===8?7:n);
 const cages=[{cells:[0,1],sum:3,unique:true},{cells:[2,3,4,5,6,7,8],sum:42,unique:true},...Array.from({length:8},(_,r)=>({cells:Array.from({length:9},(_,c)=>(r+1)*9+c),sum:45,unique:true}))];
 let clues={version:1};if(mode==='killer'||mode==='thermo-killer')clues.cages=cages;if(mode==='thermo'||mode==='thermo-killer')clues.lines=[{type:'thermo',cells:[0,1]}];if(mode==='arrow')clues.lines=[{type:'arrow',cells:[2,1,0]}];
 return{mode,difficulty:'easy',id:'logic-open-'+mode,sourceId:null,givens:Array(81).fill(0),solution,other,clues:E.normalizeClues(mode,clues)};
}
module.exports={openPuzzle};
