/* Numerical regression against actual Source renderer and embedded WOFF outlines.
 * No browser is launched; these are finite coupled placement/border profiles. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const profiles=require('./arrow-glyph-profiles.cjs')(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'nine-realms-glyph-'));
let report;
try{
 const input=path.join(tmp,'profiles.json'),output=path.join(tmp,'result.json');fs.writeFileSync(input,JSON.stringify(profiles));
 cp.execFileSync(process.execPath,[path.join(__dirname,'audit-head-glyphs.cjs'),path.join(__dirname,'../src/variant-view.js'),output,String(56/3),'',input,'transforms'],{stdio:['ignore','ignore','pipe'],timeout:240000});
 report=JSON.parse(fs.readFileSync(output));
 assert.equal(report.heads,2160);assert.equal(report.cases.length,profiles.length);
 for(const c of report.cases){assert.equal(c.collidingHeads,0,JSON.stringify({name:c.name,kind:c.kind,size:c.size,baseline:c.baselineEm,examples:c.examples}));assert(c.minClearance>.1,'positive tolerance beyond contour flattening/serialized geometry');}
 if(process.env.GLYPH_AUDIT_OUTPUT)fs.copyFileSync(output,process.env.GLYPH_AUDIT_OUTPUT);

}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log(`PASS actual Source arrow/glyph clearance:120 catalog/rotated/reflected contexts,2160 heads,${profiles.length} coupled400/600 main/all-nine-note profiles, both modeled baselines, normal/large/strong borders, neighboring cells, .08em/.12em contours, live/desktop/replay and supported fallback; minimum${Math.min(...report.cases.map(c=>c.minClearance)).toFixed(6)} SVG units. Finite font/math model, not native pixels.`);
