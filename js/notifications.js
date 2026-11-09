const NotificationUI = (() => {
  let busy=false, syncing=false, formReady=false, timer, registration, permissionObserver;
  const el=id=>document.getElementById(id);
  const report=message=>{if(el('notification-sync'))el('notification-sync').textContent=message;};
  async function api(route,method='GET',body) {
    const s=await NotificationCore.state();const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
    try {
      const r=await fetch(new URL('./api/notifications/'+route,document.baseURI),{method,cache:'no-store',signal:controller.signal,headers:{Accept:'application/json','X-PWA-Request':'1','X-Device-Id':s.deviceId,'X-Device-Token':s.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      if(!r.headers.get('content-type')?.includes('application/json'))throw new Error('API de notificaciones no disponible.');
      const data=await r.json();if(!r.ok)throw new Error(data.error?.message||'Error de notificaciones.');return data.data;
    }finally{clearTimeout(timeout);}
  }
  function permission() {
    const supported='Notification' in window&&'serviceWorker' in navigator;
    const value=supported?Notification.permission:'unsupported';
    el('notification-permission').textContent={granted:'Permiso concedido · avisos del sistema disponibles',denied:'Permiso denegado · habilítalo en la configuración del sitio. El centro sigue funcionando.',default:'Permiso pendiente · activa los avisos solo si los deseas.',unsupported:'Navegador no compatible con avisos del sistema. Usa el centro de notificaciones.'}[value];
    el('notification-enable').disabled=!supported||value==='denied';
    el('notification-enable').textContent=value==='granted'?'Conectar Web Push':'Activar notificaciones';
    el('notification-permission').dataset.permission=value;
  }
  function populate(p) {
    for(const key of ['enabled','overdue','daily','muted'])el('pref-'+key).checked=p[key];
    el('pref-minutes').value=p.minutes;el('pref-daily-time').value=p.dailyTime;
  }
  async function savePreferences(event) {
    event.preventDefault();
    const p={enabled:el('pref-enabled').checked,overdue:el('pref-overdue').checked,daily:el('pref-daily').checked,muted:el('pref-muted').checked,minutes:Number(el('pref-minutes').value),dailyTime:el('pref-daily-time').value,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone};
    await NotificationCore.update('state','device',s=>({...s,preferences:p,version:s.version+1,dirty:true}));
    report('Preferencias guardadas localmente; pendientes de sincronizar.');App.showToast('Preferencias guardadas en este dispositivo.','success');
    if(!p.enabled||p.muted)for(const n of await registration?.getNotifications()||[])n.close();
    await tick();void sync();
  }
  async function sync() {
    if(syncing)return;syncing=true;
    try {
      await api('device','POST',{});
      let s=await NotificationCore.state();
      if(s.dirty) {
        const confirmed=await api('preferences','PUT',{version:s.version,preferences:s.preferences});
        await NotificationCore.update('state','device',current=>current.version===s.version?{...current,dirty:false,version:confirmed.version,preferences:confirmed.preferences}:current);
      }
      s=await NotificationCore.state();
      if(s.disablePush) {
        await api('subscription','DELETE',{});
        const sub=await registration?.pushManager?.getSubscription();if(sub)await sub.unsubscribe();
        await NotificationCore.update('state','device',current=>({...current,disablePush:false,subscriptionHash:null}));
      } else if(registration?.pushManager && Notification.permission==='granted') {
        const sub=await registration.pushManager.getSubscription();
        if(sub) {
          const fingerprint=await NotificationCore.hash(JSON.stringify(sub.toJSON()));
          if(s.subscriptionHash!==fingerprint) { await api('subscription','PUT',sub.toJSON());await NotificationCore.update('state','device',current=>({...current,subscriptionHash:fingerprint})); }
        }
      }
      const remote=await api('reminders');
      for(const row of remote)if(row.kind!=='test' && Date.parse(row.event.at)<=Date.now())await NotificationCore.deliver({...row.event,source:'server'},registration);
      const events=await NotificationCore.all('events');const pending=events.filter(e=>!e.acknowledged&&/^[a-f0-9]{64}$/.test(e.id)).slice(0,100);
      if(pending.length) {
        await api('received','POST',{ids:pending.map(e=>e.id)});
        for(const e of pending)await NotificationCore.update('events',e.id,r=>({...r,acknowledged:true}));
      }
      report('Preferencias sincronizadas. Web Push requiere suscripción y programador activo.');
      await render();
    }catch(error){report('Modo local: '+error.message+' Los cambios pendientes se conservan.');}
    finally{syncing=false;}
  }
  async function tick() {
    if(busy)return;busy=true;
    try {
      const s=await NotificationCore.state();const tasks=await StorageEngine.getTasks();
      const events=await NotificationCore.plan(s.deviceId,s.preferences,tasks);
      registration=await navigator.serviceWorker?.getRegistration();
      for(const e of events)if(Date.parse(e.at)<=Date.now()&&Date.parse(e.expiresAt)>Date.now())await NotificationCore.deliver(e,registration);
      // Close already visible system notifications after a local completion/delete/reschedule.
      for(const n of await registration?.getNotifications()||[]) {
        if(!n.data?.taskId)continue;
        if(!events.some(e=>e.id===n.data.eventId))n.close();
      }
      await render();
    }catch(error){report(error.message);}finally{busy=false;}
  }
  async function enable() {
    const result=await Notification.requestPermission(); // Only called from the user's button.
    permission();if(result!=='granted')return;
    report('Conectando Web Push…');
    registration=await navigator.serviceWorker.ready;
    await api('device','POST',{});
    const config=await api('config');if(!config.configured||!config.publicKey)throw new Error('El servidor requiere Composer y claves VAPID.');
    const key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const sub=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    await api('subscription','PUT',sub.toJSON());
    await NotificationCore.update('state','device',s=>({...s,disablePush:false,subscriptionHash:null}));
    report('Web Push conectado. Usa Prueba push para verificar el envío externo.');App.showToast('Suscripción Web Push registrada.','success');void sync();
  }
  async function disable() {
    await NotificationCore.update('state','device',s=>({...s,disablePush:true}));
    const sub=await registration?.pushManager?.getSubscription();if(sub)await sub.unsubscribe();
    report('Push desactivado en este navegador; eliminación pendiente de confirmar en el servidor.');void sync();
  }
  function openTask(id) {
    el('notification-center').close();
    App.navigateTo('tasks');
    window.location.hash='tasks?task='+encodeURIComponent(id);
    if(TaskManager.getMetrics().tasks.some(t=>t.id===id))TaskManager.editTask(id);
    else App.showToast('La tarea ya no está disponible o aún no se ha sincronizado.','info');
  }
  async function snooze(id) {
    const task=(await StorageEngine.getTasks()).find(t=>t.id===id);
    if(!task||task.completed||!task.dueAt)return;
    await StorageEngine.saveTask({...task,snoozedUntil:NotificationCore.iso(Math.floor((Date.now()+600000)/1000)*1000),updatedAt:new Date().toISOString()});
    App.showToast('Recordatorio pospuesto 10 minutos.','success');await tick();
  }
  function button(text,fn) {const b=document.createElement('button');b.type='button';b.className='btn-sm btn-outline';b.textContent=text;b.addEventListener('click',()=>Promise.resolve(fn()).catch(e=>App.showToast(e.message,'error')));return b;}
  function card(container,title,date,taskId,options={}) {
    const article=document.createElement('article');article.className='notification-card'+(options.unread?' unread':'');
    const p=document.createElement('p');p.textContent=title;article.append(p);
    const small=document.createElement('small');small.textContent=date;article.append(small);
    const actions=document.createElement('div');actions.className='notification-actions';
    if(taskId){actions.append(button('Ver tarea',()=>openTask(taskId)));if(options.canSnooze)actions.append(button('Posponer 10 min',()=>snooze(taskId)));}
    if(options.event)actions.append(button(options.unread?'Marcar leída':'Leída',async()=>{await NotificationCore.update('events',options.event.id,r=>({...r,read:true}));await render();}));
    article.append(actions);container.append(article);
  }
  async function render() {
    permission();const s=await NotificationCore.state();if(!formReady){populate(s.preferences);formReady=true;}
    const events=(await NotificationCore.all('events')).filter(e=>!e.cleared).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
    const unread=events.filter(e=>!e.read).length;el('notification-count').hidden=!unread;el('notification-count').textContent=unread>99?'99+':String(unread);el('notification-bell').setAttribute('aria-label',`Notificaciones: ${unread} sin leer`);
    const tasks=await StorageEngine.getTasks();const now=Date.now();
    for(const id of ['notification-list','notification-upcoming','notification-overdue'])el(id).replaceChildren();
    for(const e of events.slice(0,100)) {
      const t=tasks.find(t=>t.id===e.taskId);
      card(el('notification-list'),e.body,new Date(e.at).toLocaleString('es-MX'),e.taskId,{unread:!e.read,event:e,canSnooze:t&&!t.completed&&!!t.dueAt});
    }
    for(const t of tasks.filter(t=>!t.completed&&t.dueAt).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt))) {
      const due=Date.parse(t.dueAt);if(due>now+86400000)continue;
      card(el(due<=now?'notification-overdue':'notification-upcoming'),t.title,new Date(due).toLocaleString('es-MX'),t.id,{canSnooze:true});
    }
    for(const id of ['notification-list','notification-upcoming','notification-overdue'])if(!el(id).children.length){const p=document.createElement('p');p.className='notification-empty';p.textContent='Sin avisos en esta sección.';el(id).append(p);}
  }
  async function init() {
    try {
      await NotificationCore.state();registration=await navigator.serviceWorker?.getRegistration();
      const bind=(id,fn)=>el(id).addEventListener('click',()=>Promise.resolve(fn()).catch(e=>{report(e.message);App.showToast(e.message,'error');}));
      bind('notification-bell',async()=>{await render();el('notification-center').showModal();});
      bind('notification-close',()=>el('notification-center').close());
      bind('notification-enable',enable);bind('notification-disable',disable);
      el('notification-settings-form').addEventListener('submit',e=>savePreferences(e).catch(error=>App.showToast(error.message,'error')));
      for(const [id,field] of [['notification-read','read'],['notification-clear','cleared']])bind(id,async()=>{for(const e of await NotificationCore.all('events'))await NotificationCore.update('events',e.id,r=>({...r,[field]:true,read:true}));await render();});
      bind('notification-test',async()=>{const s=await NotificationCore.state();const e=await NotificationCore.event(s.deviceId,null,'test',crypto.randomUUID(),Date.now(),Date.now()+3600000,'PWA Life: Este es un aviso de prueba local.');await NotificationCore.deliver(e,registration);await render();});
      bind('notification-push-test',async()=>{await api('device','POST',{});await api('test','POST',{});report('Prueba encolada. Cierra la pestaña; el programador debe enviarla en aproximadamente un minuto.');});
      window.addEventListener('tasks-changed',tick);window.addEventListener('data-synced',()=>{void tick();void sync();});window.addEventListener('online',()=>{void tick();void sync();});window.addEventListener('focus',()=>{permission();void tick();void sync();});
      navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='NOTIFICATIONS_CHANGED')void render();if(e.data?.type==='OPEN_TASK')openTask(e.data.taskId);});
      if(navigator.permissions)try{permissionObserver=await navigator.permissions.query({name:'notifications'});permissionObserver.onchange=permission;}catch{}
      await tick();void sync();timer=setInterval(()=>{void tick();void sync();},30000);
    }catch(error){report('No se pudo iniciar el centro: '+error.message);}
  }
  return {init,tick,sync,render,openTask,snooze,api};
})();
