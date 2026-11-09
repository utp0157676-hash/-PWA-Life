<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/../vendor/autoload.php';
$path = __DIR__ . '/../backend/config/push.local.php';
if (is_file($path)) { echo "Claves VAPID existentes conservadas.\n"; exit; }
$subject = $argv[1] ?? 'https://github.com/utp0157676-hash/-PWA-Life';
if (!preg_match('~^(mailto:|https://)~', $subject)) throw new RuntimeException('Subject debe ser mailto: o https://.');
// On Windows OpenSSL needs a known configuration path to generate EC keys.
putenv('OPENSSL_CONF=' . __DIR__ . '/openssl-pwa.cnf');
$keys = Minishlink\WebPush\VAPID::createVapidKeys();
$keys['subject'] = $subject;
$file = fopen($path, 'x');
if (!$file) throw new RuntimeException('No se pudo crear la configuración privada.');
fwrite($file, "<?php\nreturn " . var_export($keys, true) . ";\n");
fclose($file);
echo "Claves VAPID generadas en configuración local protegida. No se imprimen secretos.\n";
