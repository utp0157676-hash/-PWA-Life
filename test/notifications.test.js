const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const {webcrypto}=require('node:crypto');
const context={crypto:webcrypto,TextEncoder,Intl,Date};
vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/notification-core.js`,'utf8')+'\nthis.core=NotificationCore;',context);
const core=context.core;
const task={id:'task-time',title:'Entregar reporte',dueDate:'2026-11-09',dueTime:'18:00',dueAt:'2026-11-10T00:00:00Z',timeZone:'America/Mexico_City',completed:false,notificationsEnabled:true};
const prefs={...core.defaults,timeZone:'America/Mexico_City'};
const now=Date.parse('2026-11-09T22:00:00Z');
test('5 and 30 minute reminders preserve the UTC deadline',async()=>{
  for(const minutes of [5,30]){const [e]=await core.plan('device',prefs,[{...task,reminderMinutes:minutes}],now);assert.equal(Date.parse(e.at),Date.parse(task.dueAt)-minutes*60000);}
});
test('same schedule gives identical dedupe ID, change in date or offset changes it',async()=>{
  const [a]=await core.plan('device',prefs,[task],now);const [b]=await core.plan('device',prefs,[task],now);
  const [c]=await core.plan('device',prefs,[{...task,reminderMinutes:30}],now);assert.equal(a.id,b.id);assert.notEqual(a.id,c.id);
});
test('completed, deleted and per-task disabled tasks have no future reminders',async()=>{
  for(const patch of [{completed:true},{deletedAt:'2026-11-09T00:00:00Z'},{_deleted:true},{notificationsEnabled:false}])assert.equal((await core.plan('device',prefs,[{...task,...patch}],now)).length,0);
});
test('date-only tasks never receive an invented clock time',async()=>{
  assert.equal((await core.plan('device',prefs,[{...task,dueTime:null,dueAt:null}],now)).length,0);
});
test('overdue event is generated once per schedule, after the due event',async()=>{
  const events=await core.plan('device',prefs,[task],now);const overdue=events.find(e=>e.kind==='overdue');assert.match(overdue.body,/Tarea vencida/);assert.equal(Date.parse(overdue.at),Date.parse(task.dueAt)+60000);
});
test('snooze replaces the original scheduled notifications',async()=>{
  const events=await core.plan('device',prefs,[{...task,snoozedUntil:'2026-11-10T00:10:00Z'}],now);assert.equal(events.length,1);assert.equal(events[0].kind,'snooze');assert.equal(events[0].at,'2026-11-10T00:10:00Z');
});
test('daily summary counts pending date-only tasks and uses the configured timezone',async()=>{
  const events=await core.plan('device',{...prefs,daily:true,dailyTime:'09:00'},[{...task,dueAt:null}, {...task,id:'done',completed:true}],now);
  assert.equal(events.length,1);assert.equal(events[0].at,'2026-11-09T15:00:00Z');assert.match(events[0].body,/1 tareas/);
});
test('global disabled preference stops planning; mute preserves center events',async()=>{
  assert.equal((await core.plan('device',{...prefs,enabled:false},[task],now)).length,0);assert.equal((await core.plan('device',{...prefs,muted:true},[task],now)).length,2);
});
test('timezone conversion handles Mexico and rejects missing DST wall time',()=>{
  assert.equal(core.iso(core.wallTime('2026-11-09','18:00','America/Mexico_City')),task.dueAt);
  assert.throws(()=>core.wallTime('2026-03-08','02:30','America/New_York'),/inexistente/);
});
