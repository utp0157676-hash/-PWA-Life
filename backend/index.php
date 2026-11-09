<?php
declare(strict_types=1);
ini_set('display_errors', '0');
require __DIR__ . '/helpers/Response.php';
require __DIR__ . '/config/database.php';
require __DIR__ . '/helpers/Validator.php';
require __DIR__ . '/models/Record.php';
require __DIR__ . '/controllers/RecordController.php';
$db = null;
try {
    $method = $_SERVER['REQUEST_METHOD'];
    $origin = configuration()['origin'] ?? 'http://localhost';
    if (isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] !== $origin) throw new ApiError(403, 'Origen no permitido.');
    if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') throw new ApiError(403, 'Solicitud entre sitios no permitida.');
    if (!in_array($method, ['GET','POST','PUT','PATCH','DELETE'], true)) {
        header('Allow: GET, POST, PUT, PATCH, DELETE');
        throw new ApiError(405, 'Método no permitido.');
    }
    $body = [];
    if ($method !== 'GET') {
        if (($_SERVER['HTTP_X_PWA_REQUEST'] ?? '') !== '1') throw new ApiError(403, 'Falta cabecera de solicitud PWA.');
        if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') throw new ApiError(415, 'Se requiere application/json.');
        $raw = file_get_contents('php://input', false, null, 0, 262145);
        if (strlen($raw) > 262144) throw new ApiError(413, 'Solicitud demasiado grande.');
        try { $object = json_decode($raw, false, 512, JSON_THROW_ON_ERROR); }
        catch (JsonException $e) { throw new ApiError(400, 'JSON inválido.'); }
        if (!is_object($object)) throw new ApiError(400, 'Se requiere un objeto JSON.');
        $body = (array)$object;
    }
    $path = trim($_GET['route'] ?? '', '/');
    if ($path === 'health' && $method === 'GET') {
        $db = database();
        $db->query('SELECT id FROM tasks LIMIT 0');
        $db->query('SELECT id FROM notes LIMIT 0');
        $db->query('SELECT id FROM sync_operations LIMIT 0');
        respond(['data'=>['status'=>'ok']]);
    }
    if (!preg_match('~^(tasks|notes)(?:/([^/]+))?$~D', $path, $matches)) throw new ApiError(404, 'Ruta no encontrada.');
    $id = isset($matches[2]) ? Validator::id($matches[2]) : null;
    $db = database();
    (new RecordController($db))->handle($matches[1], $id, $method, $body);
} catch (Throwable $e) {
    if ($db && $db->inTransaction()) $db->rollBack();
    if ($e instanceof ApiError) respond(['error'=>['message'=>$e->getMessage()]], $e->status);
    error_log('[PWA API] ' . $e->getMessage());
    respond(['error'=>['message'=>'Servicio no disponible. Revisa la configuración y MySQL.']], 503);
}
