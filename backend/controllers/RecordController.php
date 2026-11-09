<?php
declare(strict_types=1);
final class RecordController {
    public function __construct(private PDO $db) {}
    public function handle(string $type, ?string $id, string $method, array $body): void {
        $model = new Record($this->db, $type);
        if ($method === 'GET') {
            if ($id === null) respond(['data'=>$model->all(($_GET['include_deleted'] ?? '') === '1')]);
            $row = $model->find($id);
            if (!$row || $row['deletedAt']) throw new ApiError(404, 'Registro no encontrado.');
            respond(['data'=>$row]);
        }
        $allowed = $id === null ? ['POST'] : ($type === 'tasks' ? ['PUT','PATCH','DELETE'] : ['PUT','DELETE']);
        if (!in_array($method, $allowed, true)) {
            header('Allow: GET, ' . implode(', ', $allowed));
            throw new ApiError(405, 'Método no permitido.');
        }
        $id = Validator::id($id ?? ($body['id'] ?? null));
        if (isset($body['id']) && $body['id'] !== $id) throw new ApiError(422, 'ID de cuerpo y ruta no coinciden.');
        $token = Validator::id($_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? null);
        $hash = hash('sha256', $method . '|' . $type . '|' . $id . '|' . json_encode($body));
        $this->db->beginTransaction();
        // La clave única serializa reintentos concurrentes en la misma transacción.
        $s = $this->db->prepare('INSERT IGNORE INTO sync_operations (id, request_hash, response_json, status_code) VALUES (?, ?, ?, 0)');
        $s->execute([$token, $hash, '{}']);
        $s = $this->db->prepare('SELECT * FROM sync_operations WHERE id = ? FOR UPDATE');
        $s->execute([$token]);
        $op = $s->fetch();
        if ($op['request_hash'] !== $hash) throw new ApiError(409, 'Clave de operación reutilizada con otro contenido.');
        if ((int)$op['status_code'] !== 0) {
            $this->db->commit();
            respond(json_decode($op['response_json'], true, 512, JSON_THROW_ON_ERROR), (int)$op['status_code']);
        }
        $existing = $model->find($id, true);
        if ($method === 'POST') {
            if ($existing) throw new ApiError(409, 'El ID ya existe; se conserva la copia local para resolver el conflicto.');
            $data = Validator::record($type, $body);
            if (isset($body['createdAt'])) {
                if (!is_string($body['createdAt']) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/D', $body['createdAt'])) throw new ApiError(422, 'createdAt debe ser ISO 8601 UTC.');
                try { $created = new DateTimeImmutable($body['createdAt']); }
                catch (Exception $e) { throw new ApiError(422, 'createdAt inválido.'); }
                $errors = DateTimeImmutable::getLastErrors();
                if ($errors && ($errors['warning_count'] || $errors['error_count'])) throw new ApiError(422, 'createdAt inválido.');
                if ($created->format('Y') < '1000' || $created->format('Y') > '9999') throw new ApiError(422, 'createdAt fuera de rango.');
                $data['createdAt'] = $created->format('Y-m-d H:i:s');
            }
        } else {
            if (!$existing) throw new ApiError(404, 'Registro no encontrado.');
            if (!isset($body['revision']) || !is_int($body['revision']) || $body['revision'] !== $existing['revision']) throw new ApiError(409, 'El servidor cambió. Se conserva el cambio local.');
            if ($method === 'DELETE') {
                $data = ['deletedAt'=>gmdate('Y-m-d H:i:s')];
            } else {
                if ($existing['deletedAt']) throw new ApiError(409, 'El registro fue eliminado. Guarda la copia local con otro ID.');
                $data = Validator::record($type, $body, $method === 'PATCH');
            }
        }
        $result = ['data'=>$model->write($id, $data, $method === 'POST')];
        $status = $method === 'POST' ? 201 : 200;
        $s = $this->db->prepare('UPDATE sync_operations SET response_json = ?, status_code = ? WHERE id = ?');
        $s->execute([json_encode($result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $status, $token]);
        $this->db->commit();
        respond($result, $status);
    }
}
