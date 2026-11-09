<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/../backend/config/database.php';
try {
    $c = configuration();
    $pdo = new PDO("mysql:host={$c['host']};port={$c['port']};charset=utf8mb4", $c['user'], $c['password'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $pdo->exec(file_get_contents(__DIR__ . '/../database/pwa_life_db.sql'));
    echo "Estructura pwa_life_db importada sin borrar tablas ni registros.\n";
} catch (Throwable $e) {
    fwrite(STDERR, "No se pudo importar: revisa MySQL y database.local.php.\n");
    exit(1);
}
