import http from 'node:http';
import type { State } from '../src/core/types';
import { publicCheck } from '../src/core/engine';

const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>SignalStrip soundcheck</title><link rel="stylesheet" href="./card.css"></head><body><main hidden><div class="mark">S<span>↗</span></div><section><div class="eyebrow">LIVE SOUNDCHECK <b id="mode"></b></div><h1>Can you hear the word?</h1><p>In chat, type <strong id="command"></strong> + the word you hear</p><small>Listen to the creator’s microphone · <span id="time"></span></small></section></main><script src="./card.js"></script></body></html>`;
const css=`*{box-sizing:border-box}body{margin:0;background:transparent;color:#f6f3e9;font-family:Segoe UI,Arial,sans-serif;padding:22px}main{display:flex;align-items:center;gap:26px;padding:24px 34px;background:#161b1bf5;border:2px solid #c9f285;border-radius:20px;width:fit-content;max-width:100%;box-shadow:0 8px 24px #0006}main[hidden]{display:none}.mark{font-size:52px;font-weight:700;color:#c9f285;border-right:1px solid #ffffff30;padding-right:26px}.mark span{font-size:30px}.eyebrow{font-size:15px;letter-spacing:2px;color:#c9f285}h1{font-size:32px;margin:5px 0 8px}p{font-size:25px;margin:0 0 8px}strong{color:#c9f285}small{font-size:16px;color:#d5d9d2}b{color:#ffc47a;font-size:13px}@media(prefers-reduced-motion:reduce){*{animation:none}}`;
const js=`const card=document.querySelector('main');async function update(){try{const r=await fetch('./state',{cache:'no-store'});if(!r.ok)throw Error();const s=await r.json();card.hidden=!s.active;if(s.active){document.getElementById('command').textContent='!heard '+s.id;document.getElementById('mode').textContent=s.rehearsal?'REHEARSAL':'';document.getElementById('time').textContent=Math.max(0,Math.ceil((s.expiresAt-Date.now())/1000))+'s remaining';}}catch{card.hidden=true;}}update();setInterval(update,750);`;

export class Overlay {
  private server:http.Server|null=null;url='';
  async start(key:string,getState:()=>State,port=17643) {
    const root=`/o/${key}`;
    this.server=http.createServer((req,res)=>{
      res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
      if(req.headers.host!==`127.0.0.1:${port}`||req.method!=='GET'||(req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`)){res.writeHead(403).end();return;}
      const route=req.url;
      if(route===root){res.writeHead(302,{Location:root+'/'}).end();return;}
      const assets:Record<string,[string,string]>={
        [root+'/']:['text/html; charset=utf-8',html],
        [root+'/card.css']:['text/css; charset=utf-8',css],
        [root+'/card.js']:['application/javascript; charset=utf-8',js],
      };
      if(route===root+'/state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(publicCheck(getState())));return;}
      const asset=assets[route??''];if(!asset){res.writeHead(404).end();return;}
      res.setHeader('Content-Type',asset[0]);res.end(asset[1]);
    });
    await new Promise<void>((resolve,reject)=>{this.server!.once('error',reject);this.server!.listen(port,'127.0.0.1',resolve);});
    this.url=`http://127.0.0.1:${port}${root}/`;return this.url;
  }
  async stop(){if(this.server)await new Promise<void>(resolve=>this.server!.close(()=>resolve()));}
}
