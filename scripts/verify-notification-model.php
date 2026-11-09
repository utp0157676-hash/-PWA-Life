<?php
declare(strict_types=1);
require __DIR__.'/../backend/helpers/Response.php';
require __DIR__.'/../backend/helpers/TaskSchedule.php';
require __DIR__.'/../backend/services/ReminderService.php';
require __DIR__.'/../backend/helpers/Validator.php';
function check(bool $condition): void { if (!$condition) throw new RuntimeException('Comprobación fallida.'); }
$task=['id'=>'task-time','title'=>'Entregar reporte','dueDate'=>'2026-11-09','dueTime'=>'18:00','dueAt'=>'2026-11-10T00:00:00Z','timeZone'=>'America/Mexico_City','completed'=>false,'notificationsEnabled'=>true];
$valid=TaskSchedule::validate($task,null);check($valid['dueAt']==='2026-11-10 00:00:00');
foreach ([5,30] as $minutes) {
    $events=ReminderService::plan('device',ReminderService::defaults(),[array_replace($task,['reminderMinutes'=>$minutes])],strtotime('2026-11-09T22:00:00Z'));
    check(strtotime($events[0]['at'])===strtotime($task['dueAt'])-$minutes*60);
    check(count($events)===2);
}
check(ReminderService::plan('device',ReminderService::defaults(),[array_replace($task,['completed'=>true])])===[]);
check(ReminderService::plan('device',ReminderService::defaults(),[array_replace($task,['dueAt'=>null])])===[]);
try { TaskSchedule::validate(array_replace($task,['dueTime'=>'17:00']),null);throw new RuntimeException('No rechazó zona incorrecta.'); } catch(ApiError $e) { check($e->status===422); }
echo "Modelo PHP: zona horaria, 5/30 minutos, vencidas, completadas, fecha sin hora y validación aprobados.\n";
