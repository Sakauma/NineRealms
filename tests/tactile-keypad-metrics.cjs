/* Expected CSS geometry only. This model does not substitute for rendering. */
'use strict';
const clamp=(minimum,value,maximum)=>Math.min(maximum,Math.max(minimum,value));
function keypadMetrics(width,height,{multi=false,multiView='overview'}={}){
 const rail=clamp(288,width*.24,320),gap=10,content=rail-19;
 return {rail,gap,content,keyWidth:(content-2*gap)/3,keyHeight:(content-2*gap)/3,
  board:multi&&multiView==='overview'?Math.min(760,width-88-rail):Math.max(320,Math.min(620,width-88-rail))};
}
module.exports={keypadMetrics};
