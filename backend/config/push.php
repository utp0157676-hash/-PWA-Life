<?php
declare(strict_types=1);
function pushConfiguration(): array {
    $path = __DIR__ . '/push.local.php';
    $config = is_file($path) ? require $path : [];
    foreach (['subject','publicKey','privateKey'] as $key) {
        $value = getenv('PWA_VAPID_' . strtoupper($key));
        if ($value !== false) $config[$key] = $value;
    }
    return $config;
}
