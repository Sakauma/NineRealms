'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch,fixture}=require('./browser-helper.cjs');
(async()=>{
 const baseline=process.env.NINE_REALMS_BASELINE_HTML;
 if(!baseline)throw Error('Set NINE_REALMS_BASELINE_HTML to the preserved pre-change standalone page.');
 fs.mkdirSync('evidence',{recursive:true});fs.copyFileSync(baseline,'evidence/previous-quality.html');
 const b=await launch();let states=0;
 try{
  for(const width of [390,1360])for(const theme of ['ivory','nebula'])for(const contrast of ['standard','strong']){
   await b.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});const s=fixture('geometry-preserved');s.preferences.theme=theme;s.preferences.lineContrast=contrast;
   async function measure(route){await b.load(s,route);await b.evaluate('document.getElementById("resume-btn").click()');return b.evaluate('Array.from(document.querySelectorAll("#board .cell")).map(c=>{const r=c.getBoundingClientRect(),s=getComputedStyle(c);return[r.x,r.y,r.width,r.height,...["borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth","borderRightColor","borderBottomColor","backgroundColor","fontSize"].map(k=>s[k])];})');}
   const before=await measure('/evidence/previous-quality.html'),after=await measure('/dist/index.html');assert.deepEqual(after,before,JSON.stringify({width,theme,contrast}));states++;
  }
  console.log('PASS real grid compatibility: '+states+' desktop/mobile/light/dark/contrast states, all 81 exact cell bounds, borders, colors and type sizes match the previous delivery.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
