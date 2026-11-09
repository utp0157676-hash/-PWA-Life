<?php
declare(strict_types=1);
function configuration(): array {
    static $config;
    if ($config !== null) return $config;
    $file = __DIR__ . '/database.local.php';
    $config = is_file($file) ? require $file : [];
    foreach (['host', 'port', 'name', 'user', 'password', 'origin'] as $key) {
        $value = getenv('PWA_' . strtoupper($key));
        if ($value !== false) $config[$key] = $value;
    }
    return $config;
}
function database(): PDO {
    $c = configuration();
    foreach (['host', 'port', 'name', 'user', 'password'] as $key) {
        if (!array_key_exists($key, $c)) throw new RuntimeException('Falta configuración local.');
    }
    if (!preg_match('/^[a-zA-Z0-9_]+$/D', $c['name']) || !ctype_digit((string)$c['port']) ||
        !preg_match('/^[a-zA-Z0-9.:-]+$/D', $c['host'])) throw new RuntimeException('Configuración inválida.');
    $pdo = new PDO("mysql:host={$c['host']};port={$c['port']};dbname={$c['name']};charset=utf8mb4", $c['user'], $c['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}
