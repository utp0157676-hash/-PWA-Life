<?php
declare(strict_types=1);
// Scheduler entry point. Never expose a process/send administrative HTTP endpoint.
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__.'/../vendor/autoload.php';
require __DIR__.'/../backend/config/database.php';
require __DIR__.'/../backend/config/push.php';
require __DIR__.'/../backend/models/Record.php';
require __DIR__.'/../backend/services/ReminderService.php';
use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;
$db = database(); $stats=['planned'=>0,'accepted'=>0,'failed'=>0,'expired'=>0];
if (!$db->query("SELECT GET_LOCK('pwa-life-push-worker',0)")->fetchColumn()) { echo "Otro procesador está activo.\n"; exit; }
try {
    $db->beginTransaction(); ReminderService::reconcileAll($db); $db->commit();
    $stats['expired']=$db->exec("UPDATE scheduled_reminders SET status='expired' WHERE status='pending' AND expires_at<=UTC_TIMESTAMP()");
    $config=pushConfiguration();
    if (empty($config['privateKey'])) throw new RuntimeException('Configura VAPID antes de ejecutar el procesador.');
    $options=['timeout'=>10,'connect_timeout'=>5,'allow_redirects'=>false];
    $ca=__DIR__.'/../backend/config/windows-ca.pem';
    if (is_file($ca)) $options['verify']=$ca;
    $push=new WebPush(['VAPID'=>['subject'=>$config['subject'],'publicKey'=>$config['publicKey'],'privateKey'=>$config['privateKey']]],['TTL'=>300,'urgency'=>'normal'],10,$options);
    $rows=$db->query("SELECT r.event_id FROM scheduled_reminders r JOIN push_subscriptions s ON s.device_id=r.device_id AND s.active=TRUE WHERE r.status='pending' AND r.received_at IS NULL AND r.send_at<=UTC_TIMESTAMP() AND r.expires_at>UTC_TIMESTAMP() AND (r.next_attempt_at IS NULL OR r.next_attempt_at<=UTC_TIMESTAMP()) ORDER BY r.send_at LIMIT 100")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($rows as $id) {
        // Re-read under lock immediately before send. A request already in flight
        // cannot be recalled; SW also checks the local task and notification ledger.
        $db->beginTransaction();
        $s=$db->prepare("SELECT r.*,d.preferences_json,s.endpoint,s.p256dh,s.auth_key,s.active FROM scheduled_reminders r JOIN notification_devices d ON d.device_id=r.device_id JOIN push_subscriptions s ON s.device_id=r.device_id WHERE r.event_id=? FOR UPDATE");$s->execute([$id]);$r=$s->fetch();
        if (!$r || $r['status']!=='pending' || !$r['active'] || $r['received_at']) { $db->commit();continue; }
        $prefs=json_decode($r['preferences_json'],true);
        if (!$prefs['enabled'] || $prefs['muted']) { $db->commit();continue; }
        $stats['planned']++;
        $code=null; $result='network_error'; $accepted=false; $expired=false;
        try {
            $report=$push->sendOneNotification(Subscription::create(['endpoint'=>$r['endpoint'],'keys'=>['p256dh'=>$r['p256dh'],'auth'=>$r['auth_key']]]),$r['payload_json'],['TTL'=>min(300,max(1,strtotime($r['expires_at'].' UTC')-time())),'topic'=>substr($id,0,32)]);
            $accepted=$report->isSuccess();$expired=$report->isSubscriptionExpired();
            $code=$report->getResponse()?->getStatusCode();
            $result=$accepted?'push_service_accepted':($expired?'subscription_expired':'push_service_rejected');
        } catch (Throwable $e) { /* No endpoints/keys in logs or output. */ }
        if ($expired) { $s=$db->prepare('UPDATE push_subscriptions SET active=FALSE WHERE device_id=?');$s->execute([$r['device_id']]); }
        $attempts=(int)$r['attempts']+1;
        $status=$accepted?'accepted':($expired||$attempts>=8?'failed':'pending');
        $next=gmdate('Y-m-d H:i:s',time()+min(3600,60*(2**min(6,$attempts-1))));
        $s=$db->prepare('UPDATE scheduled_reminders SET status=?,attempts=?,next_attempt_at=?,sent_at=? WHERE event_id=?');
        $s->execute([$status,$attempts,$next,$accepted?gmdate('Y-m-d H:i:s'):null,$id]);
        $s=$db->prepare('INSERT INTO notification_logs (event_id,result,http_status) VALUES (?,?,?)');$s->execute([$id,$result,$code]);
        $db->commit(); $stats[$accepted?'accepted':'failed']++;
    }
    echo json_encode($stats,JSON_UNESCAPED_UNICODE).PHP_EOL;
} catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    fwrite(STDERR,"Procesador no disponible: revisa MySQL, migración, extensiones y VAPID.\n");exit(1);
} finally { $db->query("SELECT RELEASE_LOCK('pwa-life-push-worker')"); }
