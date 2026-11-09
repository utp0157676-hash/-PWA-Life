<?php
declare(strict_types=1);
final class ReminderService {
    public static function defaults(): array {
        return ['enabled'=>true,'minutes'=>15,'overdue'=>true,'daily'=>false,'dailyTime'=>'09:00','muted'=>false,'timeZone'=>'America/Mexico_City'];
    }
    public static function event(string $device, ?string $task, string $kind, string $signature, int $at, int $expires, string $message, ?string $dueAt = null): array {
        $id = hash('sha256', "$device|$kind|" . ($task ?? '') . "|$signature");
        return ['id'=>$id,'taskId'=>$task,'kind'=>$kind,'at'=>gmdate('Y-m-d\TH:i:s\Z',$at),'expiresAt'=>gmdate('Y-m-d\TH:i:s\Z',$expires),'title'=>'PWA Life','body'=>$message,'dueAt'=>$dueAt];
    }
    public static function plan(string $device, array $prefs, array $tasks, ?int $now = null): array {
        $now ??= time(); $p = array_replace(self::defaults(), $prefs); $events = [];
        if (!$p['enabled']) return [];
        $zone = new DateTimeZone($p['timeZone']);
        $today = (new DateTimeImmutable('@'.$now))->setTimezone($zone)->format('Y-m-d');
        $todayCount = 0;
        foreach ($tasks as $t) {
            if ($t['completed'] || !empty($t['deletedAt']) || ($t['notificationsEnabled'] ?? true) === false) continue;
            if (($t['dueDate'] ?? null) === $today) $todayCount++;
            if (empty($t['dueAt'])) continue; // Date-only tasks never get an invented time.
            $due = strtotime($t['dueAt']); $minutes = $t['reminderMinutes'] ?? $p['minutes'];
            $snooze = empty($t['snoozedUntil']) ? 0 : strtotime($t['snoozedUntil']);
            $signature = "$due|$minutes|$snooze";
            if ($snooze) {
                $events[] = self::event($device,$t['id'],'snooze',$signature,$snooze,$snooze+86400,"⏰ PWA Life: Recordatorio pospuesto de '{$t['title']}'.",$t['dueAt']);
            } else {
                $message = $minutes ? "⏰ PWA Life: Tu tarea '{$t['title']}' vence en $minutes minutos." : "⏰ PWA Life: Tu tarea '{$t['title']}' vence a las {$t['dueTime']}.";
                $events[] = self::event($device,$t['id'],'due',$signature,$due-$minutes*60,$due+60,$message,$t['dueAt']);
                if ($p['overdue']) $events[] = self::event($device,$t['id'],'overdue',$signature,$due+60,$due+86400,"⚠️ Tarea vencida: {$t['title']}. Su fecha límite ya pasó.",$t['dueAt']);
            }
        }
        if ($p['daily'] && $todayCount) {
            $at = (new DateTimeImmutable($today.' '.$p['dailyTime'], $zone))->getTimestamp();
            $end = (new DateTimeImmutable($today.' 00:00', $zone))->modify('+1 day')->getTimestamp();
            $events[] = self::event($device,null,'daily',$today.'|'.$p['dailyTime'],$at,$end,"PWA Life: Tienes $todayCount tareas pendientes para hoy.");
        }
        foreach ($events as &$event) {
            if ($event['taskId']) foreach ($tasks as $task) if ($task['id']===$event['taskId']) { $event['taskRevision']=$task['revision']??1;break; }
        }
        return $events;
    }
    public static function reconcileAll(PDO $db): void {
        $tasks = (new Record($db,'tasks'))->all(false);
        foreach ($db->query('SELECT * FROM notification_devices')->fetchAll() as $device) self::reconcile($db, $device, $tasks);
    }
    public static function reconcile(PDO $db, array $device, ?array $tasks = null): void {
        $tasks ??= (new Record($db,'tasks'))->all(false);
        $events = self::plan($device['device_id'], json_decode($device['preferences_json'], true, 512, JSON_THROW_ON_ERROR), $tasks);
        $s = $db->prepare("UPDATE scheduled_reminders SET status='cancelled' WHERE device_id=? AND status='pending' AND kind<>'test'");
        $s->execute([$device['device_id']]);
        foreach ($events as $event) self::store($db,$device['device_id'],$event);
    }
    public static function store(PDO $db, string $device, array $event): void {
        $s = $db->prepare("INSERT INTO scheduled_reminders (event_id,device_id,task_id,kind,send_at,expires_at,payload_json) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE payload_json=VALUES(payload_json), status=IF(status='cancelled','pending',status)");
        $s->execute([$event['id'],$device,$event['taskId'],$event['kind'],str_replace(['T','Z'],[' ',''],$event['at']),str_replace(['T','Z'],[' ',''],$event['expiresAt']),json_encode($event, JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
    }
}
