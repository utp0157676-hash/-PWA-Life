import {spawn} from 'node:child_process';
import path from 'node:path';
const port=9231, profile=`test-results/notification-chrome-${Date.now()}`;
const chrome=process.env.PWA_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const child=spawn(chrome,['--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check',`--remote-debugging-address=127.0.0.1`,`--remote-debugging-port=${port}`,`--user-data-dir=${path.resolve(profile)}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<100;i++){try{const v=await fn();if(v)return v}catch{}await wait(200)}throw Error('Timeout Chrome');}
let ws;try{
 await until(async()=>{const r=await fetch(`http://127.0.0.1:${port}/json/version`);return r.ok});
 const target=await (await fetch(`http://127.0.0.1:${port}/json/new?http://localhost/PWA-Life/`,{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pending.set(i,{resolve,reject});ws.send(JSON.stringify({id:i,method,params}))});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text||JSON.stringify(r.exceptionDetails));return r.result.value};
 await send('Browser.grantPermissions',{origin:'http://localhost',permissions:['notifications']});await send('Page.navigate',{url:'http://localhost/PWA-Life/'});await until(()=>evaluate(`typeof NotificationUI!=='undefined'&&!!navigator.serviceWorker.controller`));
 const permission=await evaluate('Notification.permission');const local=await evaluate(`(async()=>{const s=await NotificationCore.state();const e=await NotificationCore.event(s.deviceId,null,'test','browser-${Date.now()}',Date.now(),Date.now()+3600000,'PWA Life: prueba local con la aplicación abierta.');return NotificationCore.deliver(e,await navigator.serviceWorker.getRegistration())})()`);
 const stored=await evaluate(`(async()=> (await NotificationCore.all('events')).some(e=>e.body.includes('prueba local con la aplicación abierta')))()`);
 console.log(JSON.stringify({permission,localNotificationShown:local,eventStored:stored,closedPushPrerequisite:'requires a valid Web Push subscription and the Windows scheduler; not claimed by this headless local test'},null,2));
 await send('Browser.close');
}finally{ws?.close();child.kill()}
