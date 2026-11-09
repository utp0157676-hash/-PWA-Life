/* Shared by page and SW. Persistent event IDs suppress local/push duplicates. */
const NotificationCore = (() => {
  const defaults = { enabled:true, minutes:15, overdue:true, daily:false, dailyTime:'09:00', muted:false, timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone };
  let connection;
  const iso = ms => new Date(ms).toISOString().replace('.000Z','Z');
  const hash = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))), b=>b.toString(16).padStart(2,'0')).join('');
  function open() {
    if (!connection) connection = new Promise((resolve,reject) => {
      const r=indexedDB.open('pwa_life_notifications',1);
      r.onupgradeneeded=()=>{ r.result.createObjectStore('state',{keyPath:'id'}); r.result.createObjectStore('events',{keyPath:'id'}); };
      r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
    });
    return connection;
  }
  async function all(store) {
    const db=await open();
    return new Promise((resolve,reject)=>{const tx=db.transaction(store);const r=tx.objectStore(store).getAll();tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error);});
  }
  async function update(store,id,fn) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(store,'readwrite');const s=tx.objectStore(store);const r=s.get(id);let result;
      r.onsuccess=()=>{try {result=fn(r.result);s.put({...result,id});}catch(error){reject(error);tx.abort();}};
      tx.oncomplete=()=>resolve({...result,id});tx.onabort=()=>reject(tx.error||new Error('No se pudo guardar el aviso.'));
    });
  }
  async function state() {
    return update('state','device', old => old || { deviceId:crypto.randomUUID(), token:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''), preferences:{...defaults}, version:1, dirty:true, subscriptionDirty:false, disablePush:false });
  }
  async function event(device,task,kind,signature,at,expires,body,dueAt=null) {
    return { id:await hash(`${device}|${kind}|${task||''}|${signature}`),taskId:task,kind,at:iso(at),expiresAt:iso(expires),title:'PWA Life',body,dueAt };
  }
  function dateInZone(ms,zone) { return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms)); }
  function wallTime(date,time,zone) {
    const target=Date.parse(date+'T'+time+':00Z');let result=target;
    for(let i=0;i<4;i++) {
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(result)).map(p=>[p.type,p.value]));
      const current=Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
      if(current===target)return result;
      result+=target-current;
    }
    throw new Error('Hora inexistente por cambio de horario. Elige otra hora.');
  }
  async function plan(device,prefs,tasks,now=Date.now()) {
    const p={...defaults,...prefs};if(!p.enabled)return [];
    const events=[];const today=dateInZone(now,p.timeZone);let count=0;
    for(const t of tasks) {
      if(t.completed||t.deletedAt||t._deleted||t.notificationsEnabled===false)continue;
      if(t.dueDate===today)count++;
      if(!t.dueAt)continue;
      const due=Math.floor(Date.parse(t.dueAt)/1000), minutes=t.reminderMinutes??p.minutes, snooze=t.snoozedUntil?Math.floor(Date.parse(t.snoozedUntil)/1000):0;
      if(!Number.isFinite(due))continue;
      const signature=`${due}|${minutes}|${snooze}`;
      if(snooze) events.push(await event(device,t.id,'snooze',signature,snooze*1000,(snooze+86400)*1000,`⏰ PWA Life: Recordatorio pospuesto de '${t.title}'.`,t.dueAt));
      else {
        events.push(await event(device,t.id,'due',signature,(due-minutes*60)*1000,(due+60)*1000,minutes?`⏰ PWA Life: Tu tarea '${t.title}' vence en ${minutes} minutos.`:`⏰ PWA Life: Tu tarea '${t.title}' vence a las ${t.dueTime}.`,t.dueAt));
        if(p.overdue) events.push(await event(device,t.id,'overdue',signature,(due+60)*1000,(due+86400)*1000,`⚠️ Tarea vencida: ${t.title}. Su fecha límite ya pasó.`,t.dueAt));
      }
    }
    if(p.daily&&count) {
      const at=wallTime(today,p.dailyTime,p.timeZone);
      const next=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
      events.push(await event(device,null,'daily',today+'|'+p.dailyTime,at,wallTime(next,'00:00',p.timeZone),`PWA Life: Tienes ${count} tareas pendientes para hoy.`));
    }
    return events;
  }
  async function record(e,nativeWanted=false) {
    let show=false;
    const row=await update('events',e.id,old=>{
      show=!!nativeWanted&&!old?.notified&&!old?.cleared;
      return {...e,...old,body:e.body,source:e.source||old?.source||'local',pushReceivedAt:e.source==='push'?new Date().toISOString():old?.pushReceivedAt,notified:!!old?.notified||show,read:!!old?.read,cleared:!!old?.cleared,received:old?.received||new Date().toISOString()};
    });
    return {row,show};
  }
  async function task(id) {
    return new Promise(resolve=>{
      const r=indexedDB.open('pwa_life_database');
      r.onupgradeneeded=()=>r.transaction.abort();r.onerror=()=>resolve(null);
      r.onsuccess=()=>{
        const db=r.result;
        if(!db.objectStoreNames.contains('tasks')){db.close();resolve(null);return;}
        const tx=db.transaction('tasks');const q=tx.objectStore('tasks').get(id);
        tx.oncomplete=()=>{db.close();resolve(q.result||null);};tx.onabort=()=>{db.close();resolve(null);};
      };
    });
  }
  async function valid(e,s) {
    if(!e||!/^[a-f0-9]{64}$/.test(e.id)||typeof e.body!=='string'||e.body.length>2000||Date.parse(e.expiresAt)<=Date.now()||!s.preferences.enabled)return false;
    if(!e.taskId)return ['daily','test'].includes(e.kind);
    const t=await task(e.taskId);
    if(!t)return true; // Push can precede the first local pull; server already validated.
    if(!t._outbox?.length && e.taskRevision && e.taskRevision>t.revision)return true;
    if(t._deleted||t.deletedAt||t.completed||t.notificationsEnabled===false)return false;
    const events=await plan(s.deviceId,s.preferences,[t]);
    return events.some(x=>x.id===e.id);
  }
  async function deliver(e,registration) {
    const s=await state();if(!await valid(e,s))return false;
    const permitted=typeof Notification!=='undefined'&&Notification.permission==='granted';
    const {show}=await record(e,permitted&&!s.preferences.muted&&!!registration);
    if(show) {
      try {
        await registration.showNotification(e.title||'PWA Life',{body:e.body,tag:e.id,renotify:false,icon:new URL('icons/icon-192.png',registration.scope).href,badge:new URL('icons/icon-192.png',registration.scope).href,data:{eventId:e.id,taskId:e.taskId},actions:e.taskId?[{action:'open',title:'Ver tarea'}]:[]});
      } catch(error) { await update('events',e.id,r=>({...r,notified:false}));throw error; }
    }
    return show;
  }
  return {defaults,iso,hash,all,update,state,event,plan,record,deliver,valid,wallTime,dateInZone};
})();
