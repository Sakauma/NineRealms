'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const text=fs.readFileSync('desktop/main.cjs','utf8'),fn=text.match(/function isGameDocument\(target\) \{[\s\S]*?\n\}/)[0];
const c=vm.createContext({URL,gameURL:'file:///C:/Users/Test/Nine%20Realms/resources/app/index.html'});vm.runInContext(fn,c);
assert(c.isGameDocument(c.gameURL));assert(c.isGameDocument(c.gameURL+'#section'));assert(c.isGameDocument(c.gameURL+'?reload=1'));
for(const url of ['https://example.com','file:///C:/Users/Test/private.txt','file:///C:/Users/Test/Nine%20Realms/resources/app/other.html','javascript:alert(1)','data:text/html,x','not a url'])assert(!c.isGameDocument(url));
assert(text.includes('nodeIntegration: false'));assert(text.includes('sandbox: true'));assert(text.includes('contextIsolation: true'));
console.log('PASS desktop navigation: bundled document reload allowed, remote/other local/active-content URLs blocked; sandbox settings retained. Not a native Electron run.');
