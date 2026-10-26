import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const executable=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'release/win-unpacked/SignalStrip.exe');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(executable,['--remote-debugging-port=17745','--disable-gpu'],{env,windowsHide:true,stdio:['ignore','ignore','pipe']});
let diagnostics='';child.stderr.on('data',x=>{diagnostics+=x;});
let browser,page;
try {
  for(let n=0;n<60;n++){
    try{browser=await chromium.connectOverCDP('http://127.0.0.1:17745',{timeout:1000});break;}catch{await new Promise(r=>setTimeout(r,500));}
  }
  if(!browser)throw Error('Packaged app did not expose its test connection: '+diagnostics.slice(-1500));
  for(let n=0;n<60;n++){page=browser.contexts()[0]?.pages().find(p=>p.url().includes('app.asar'));if(page)break;await new Promise(r=>setTimeout(r,500));}
  assert.ok(page,'Packaged renderer not found');
  page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('heading',{name:'Keep the conversation flowing.'}).waitFor();
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
  await page.getByLabel('Connection mode').selectOption('rehearsal');
  await page.getByRole('button',{name:'Viewer reports audio',exact:true}).click();
  await page.getByRole('button',{name:'Review unmute',exact:true}).click();
  await page.getByRole('button',{name:'Unmute selected mic',exact:true}).click();
  await page.getByText('Local value read back',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Ask for a soundcheck',exact:true}).click();
  const v=await page.evaluate(()=>window.signalstrip.getView());
  assert.ok(v.privateWord);assert.equal((await fetch(v.overlayUrl+'state').then(r=>r.json())).id,v.state.incident.check.id);
  assert.equal(await page.getByRole('button',{name:'Listening for the current reply…',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Return current word',exact:true}).click();
  assert.equal((await page.evaluate(()=>window.signalstrip.getView())).state.incident.check.responses.length,1);
  await page.getByRole('button',{name:'Current word returned',exact:true}).click();
  await page.getByRole('button',{name:'History',exact:true}).click();
  await page.getByRole('heading',{name:'Current word returned',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(root,'docs/package-smoke-result.json'),JSON.stringify({passed:true,utc:new Date().toISOString(),kind:'packaged executable with local rehearsal fixtures',packagedAsar:true,softwareRenderingForCapture:true,checks:['packaged renderer startup','no renderer Node','reviewed correction','current check','public card endpoint','stable active code','matching fixture reply','explicit closure and history'],errors},null,2));
  console.log('Packaged Windows executable passed the rehearsal flow. No Twitch message or real OBS correction was sent.');
}finally {
  if(page)await page.evaluate(()=>window.close()).catch(()=>{});
  await browser?.close();
  if(child.exitCode===null)await new Promise(r=>{child.once('exit',r);setTimeout(r,5000);});
  if(child.exitCode===null)child.kill();
}
