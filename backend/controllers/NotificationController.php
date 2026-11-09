<?php
declare(strict_types=1);
final class NotificationController {
    public function __construct(private PDO $db) {}
    public static function preferences(array $body): array {
        $p = ReminderService::defaults();
        if (array_diff(array_keys($body), array_keys($p))) throw new ApiError(422,'Preferencia desconocida.');
        foreach ($p as $key=>$default) {
            if (!array_key_exists($key,$body)) throw new ApiError(422,"Falta preferencia $key.");
            if (is_bool($default) && !is_bool($body[$key])) throw new ApiError(422,"$key debe ser booleano.");
        }
        if (!is_int($body['minutes']) || !in_array($body['minutes'],[0,5,15,30,60,1440],true)) throw new ApiError(422,'Anticipación inválida.');
        if (!is_string($body['dailyTime']) || !preg_match('/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/D',$body['dailyTime'])) throw new ApiError(422,'Hora de resumen inválida.');
        if (!is_string($body['timeZone']) || !in_array($body['timeZone'],DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC),true)) throw new ApiError(422,'Zona horaria inválida.');
        return $body;
    }
    public static function subscription(array $body): array {
        $endpoint = $body['endpoint'] ?? null; $keys = (array)($body['keys'] ?? []);
        if (!is_string($endpoint) || strlen($endpoint)>2048) throw new ApiError(422,'Endpoint inválido.');
        $url = parse_url($endpoint); $host = strtolower($url['host'] ?? '');
        $allowed = in_array($host,['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'],true)
            || preg_match('/^[a-z0-9-]+\.(?:notify|wns)\.windows\.com$/D',$host);
        if (!$allowed || ($url['scheme']??'')!=='https' || isset($url['user']) || isset($url['pass']) || isset($url['fragment']) || (isset($url['port']) && $url['port']!==443)) throw new ApiError(422,'Servicio push no permitido.');
        foreach (['p256dh'=>65,'auth'=>16] as $key=>$length) {
            $value = $keys[$key] ?? '';
            if (!is_string($value) || !preg_match('/^[A-Za-z0-9_-]+={0,2}$/D',$value) || strlen(base64_decode(strtr($value,'-_','+/'),true) ?: '')!==$length) throw new ApiError(422,'Clave de suscripción inválida.');
        }
        return ['endpoint'=>$endpoint,'keys'=>$keys];
    }
    public function handle(string $route, string $method, array $body): void {
        // Academic scope: only the local machine. Do not trust forwarded IP headers.
        if (!in_array($_SERVER['REMOTE_ADDR']??'', ['127.0.0.1','::1'],true)) throw new ApiError(403,'Notificaciones limitadas al equipo local. Se requiere autenticación para acceso remoto.');
        $routes = ['config'=>['GET'],'device'=>['POST'],'preferences'=>['GET','PUT'],'subscription'=>['GET','PUT','DELETE'],'reminders'=>['GET'],'test'=>['POST'],'received'=>['POST']];
        if (!isset($routes[$route])) throw new ApiError(404,'Ruta de notificaciones no encontrada.');
        if (!in_array($method,$routes[$route],true)) { header('Allow: '.implode(', ',$routes[$route])); throw new ApiError(405,'Método no permitido.'); }
        if ($route==='config') {
            $c=pushConfiguration(); respond(['data'=>['publicKey'=>$c['publicKey']??null,'configured'=>!empty($c['privateKey']) && is_file(__DIR__.'/../../vendor/autoload.php')]]);
        }
        $id=$_SERVER['HTTP_X_DEVICE_ID']??''; $token=$_SERVER['HTTP_X_DEVICE_TOKEN']??'';
        if (!preg_match('/^[a-f0-9-]{36}$/D',$id) || !preg_match('/^[a-f0-9]{64}$/D',$token)) throw new ApiError(401,'Identidad de dispositivo requerida.');
        $hash=hash('sha256',$token);
        $s=$this->db->prepare('SELECT * FROM notification_devices WHERE device_id=?'); $s->execute([$id]); $device=$s->fetch();
        if ($route==='device' && !$device) {
            $s=$this->db->prepare('INSERT IGNORE INTO notification_devices (device_id,token_hash,preferences_json) VALUES (?,?,?)');
            $s->execute([$id,$hash,json_encode(ReminderService::defaults())]);
            $s=$this->db->prepare('SELECT * FROM notification_devices WHERE device_id=?'); $s->execute([$id]); $device=$s->fetch();
        }
        if (!$device || !hash_equals($device['token_hash'],$hash)) throw new ApiError(401,'Dispositivo no autorizado.');
        if ($route==='device') respond(['data'=>['registered'=>true]]);
        if ($route==='preferences') {
            if ($method==='PUT') {
                if (!isset($body['version']) || !is_int($body['version']) || $body['version']<1 || !isset($body['preferences']) || !is_object($body['preferences'])) throw new ApiError(422,'Versión y preferencias requeridas.');
                $prefs=self::preferences((array)$body['preferences']);
                $s=$this->db->prepare('UPDATE notification_devices SET preferences_json=?,preferences_version=?,updated_at=UTC_TIMESTAMP() WHERE device_id=? AND preferences_version<?');
                $s->execute([json_encode($prefs),$body['version'],$id,$body['version']]);
                $s=$this->db->prepare('SELECT * FROM notification_devices WHERE device_id=?');$s->execute([$id]);$device=$s->fetch();
                $this->db->beginTransaction(); ReminderService::reconcile($this->db,$device); $this->db->commit();
            }
            respond(['data'=>['version'=>(int)$device['preferences_version'],'preferences'=>json_decode($device['preferences_json'],true)]]);
        }
        if ($route==='subscription') {
            if ($method==='PUT') {
                $sub=self::subscription($body); $endpointHash=hash('sha256',$sub['endpoint']);
                $s=$this->db->prepare('SELECT device_id FROM push_subscriptions WHERE endpoint_hash=?');$s->execute([$endpointHash]);$owner=$s->fetchColumn();
                if ($owner && $owner!==$id) throw new ApiError(409,'La suscripción pertenece a otro dispositivo.');
                $s=$this->db->prepare('SELECT device_id FROM push_subscriptions WHERE device_id=?');$s->execute([$id]);$own=$s->fetchColumn();
                try {
                    if ($own) {
                        $s=$this->db->prepare('UPDATE push_subscriptions SET endpoint=?,endpoint_hash=?,p256dh=?,auth_key=?,active=TRUE,updated_at=UTC_TIMESTAMP() WHERE device_id=?');
                        $s->execute([$sub['endpoint'],$endpointHash,$sub['keys']['p256dh'],$sub['keys']['auth'],$id]);
                    } else {
                        $s=$this->db->prepare('INSERT INTO push_subscriptions (device_id,endpoint,endpoint_hash,p256dh,auth_key) VALUES (?,?,?,?,?)');
                        $s->execute([$id,$sub['endpoint'],$endpointHash,$sub['keys']['p256dh'],$sub['keys']['auth']]);
                    }
                } catch (PDOException $e) {
                    if ($e->getCode()==='23000') throw new ApiError(409,'Suscripción registrada concurrentemente. Reintenta sin cambiar de dispositivo.');
                    throw $e;
                }
            } elseif ($method==='DELETE') {
                $s=$this->db->prepare('DELETE FROM push_subscriptions WHERE device_id=?');$s->execute([$id]);
            }
            $s=$this->db->prepare('SELECT active,updated_at FROM push_subscriptions WHERE device_id=?');$s->execute([$id]);$sub=$s->fetch();
            respond(['data'=>['active'=>$sub ? (bool)$sub['active'] : false,'updatedAt'=>$sub['updated_at']??null]]); // Never disclose endpoint or keys.
        }
        if ($route==='test') {
            $s=$this->db->prepare("SELECT COUNT(*) FROM scheduled_reminders WHERE device_id=? AND kind='test' AND send_at>UTC_TIMESTAMP()-INTERVAL 1 MINUTE");$s->execute([$id]);
            if ($s->fetchColumn()>0) throw new ApiError(429,'Espera un minuto antes de otra prueba.');
            $e=ReminderService::event($id,null,'test',bin2hex(random_bytes(16)),time(),time()+3600,'PWA Life: Notificación de prueba desde el programador PHP.');
            ReminderService::store($this->db,$id,$e);respond(['data'=>['id'=>$e['id'],'queued'=>true]],202);
        }
        if ($route==='received') {
            $ids=$body['ids']??[];
            if (!is_array($ids)||count($ids)>100) throw new ApiError(422,'Lista de eventos inválida.');
            $s=$this->db->prepare('UPDATE scheduled_reminders SET received_at=COALESCE(received_at,UTC_TIMESTAMP()) WHERE event_id=? AND device_id=?');
            foreach ($ids as $event) { if (!is_string($event)||!preg_match('/^[a-f0-9]{64}$/D',$event)) throw new ApiError(422,'Evento inválido.'); $s->execute([$event,$id]); }
            respond(['data'=>['recorded'=>true]]);
        }
        $s=$this->db->prepare("SELECT event_id,task_id,kind,send_at,status,attempts,sent_at,received_at,payload_json FROM scheduled_reminders WHERE device_id=? AND status<>'cancelled' AND expires_at>UTC_TIMESTAMP() ORDER BY send_at DESC LIMIT 200");
        $s->execute([$id]); $rows=$s->fetchAll();
        foreach ($rows as &$row) { $row['event']=json_decode($row['payload_json'],true);unset($row['payload_json']); }
        respond(['data'=>$rows]);
    }
}
