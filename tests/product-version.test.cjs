'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),B=require('../src/backup.js');
const pkg=require('../package.json'),app=fs.readFileSync('src/app.js','utf8'),html=fs.readFileSync('src/index.html','utf8');
assert.equal(pkg.version,'1.3.1');assert(app.includes('APP_VERSION = "'+pkg.version+'"'));assert(html.includes('class="app-version">'+pkg.version+'</span>'));assert(app.includes('SAVE_VERSION = 8;'));
const storage={getItem(){return null}},current=B.create(storage);assert.equal(current.appVersion,pkg.version);assert.equal(current.schemaVersion,1);
for(const v of ['3.1.0','1.0.0','1.0.1','1.1.0','1.2.0','1.3.0','1.3.1']){const b=B.create(storage,{appVersion:v});assert.equal(B.validate(JSON.stringify(b)).appVersion,v,'product version never gates backup compatibility');}
for(const file of ['scripts/package-release.py','scripts/package-installer.py'])assert(fs.readFileSync(file,'utf8').includes('package["version"]'));
console.log('PASS product version 1.3.1: package/UI/backup default consistent, desktop derives manifest version, save schema8 and backup schema1 unchanged; old product versions accepted.');
