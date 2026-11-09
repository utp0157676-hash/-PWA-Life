<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require_once __DIR__ . '/../backend/config/database.php';
$db = database();
if (!$db->query("SELECT GET_LOCK('pwa-life-migrate-notifications', 10)")->fetchColumn()) throw new RuntimeException('Migración en curso.');
try {
    $before = [(int)$db->query('SELECT COUNT(*) FROM tasks')->fetchColumn(), (int)$db->query('SELECT COUNT(*) FROM notes')->fetchColumn()];
    $columns = [
        'due_time'=>'TIME NULL', 'due_at'=>'DATETIME NULL', 'time_zone'=>'VARCHAR(64) NULL',
        'reminder_minutes'=>'SMALLINT UNSIGNED NULL', 'notifications_enabled'=>'BOOLEAN NOT NULL DEFAULT TRUE',
        'snoozed_until'=>'DATETIME NULL'
    ];
    $known = $db->query('SHOW COLUMNS FROM tasks')->fetchAll(PDO::FETCH_COLUMN);
    foreach ($columns as $name => $definition) {
        if (!in_array($name, $known, true)) $db->exec("ALTER TABLE tasks ADD COLUMN $name $definition");
    }
    $indexes = $db->query('SHOW INDEX FROM tasks')->fetchAll();
    if (!in_array('idx_tasks_due_at', array_column($indexes, 'Key_name'), true)) $db->exec('CREATE INDEX idx_tasks_due_at ON tasks (due_at, completed, deleted_at)');
    $db->exec(file_get_contents(__DIR__ . '/../database/migrations/002_notifications.sql'));
    $after = [(int)$db->query('SELECT COUNT(*) FROM tasks')->fetchColumn(), (int)$db->query('SELECT COUNT(*) FROM notes')->fetchColumn()];
    if ($before !== $after) throw new RuntimeException('Los conteos cambiaron durante la migración; revisar concurrencia.');
    echo 'Migración 002 completada. Registros conservados: ' . json_encode(['tasks'=>$after[0], 'notes'=>$after[1]]) . PHP_EOL;
} finally { $db->query("SELECT RELEASE_LOCK('pwa-life-migrate-notifications')"); }
