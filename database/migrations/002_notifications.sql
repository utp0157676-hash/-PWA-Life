-- Ejecutar con scripts/migrate-notifications.php (adiciones de columnas idempotentes).
-- No contiene datos, credenciales ni DROP/TRUNCATE.
CREATE TABLE IF NOT EXISTS notification_devices (
 device_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 token_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 preferences_json TEXT NOT NULL,
 preferences_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS push_subscriptions (
 device_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 endpoint TEXT NOT NULL,
 endpoint_hash CHAR(64) CHARACTER SET ascii NOT NULL UNIQUE,
 p256dh VARCHAR(100) CHARACTER SET ascii NOT NULL,
 auth_key VARCHAR(30) CHARACTER SET ascii NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (device_id) REFERENCES notification_devices(device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS scheduled_reminders (
 event_id CHAR(64) CHARACTER SET ascii PRIMARY KEY,
 device_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 task_id VARCHAR(100) COLLATE utf8mb4_bin NULL,
 kind VARCHAR(20) NOT NULL,
 send_at DATETIME NOT NULL,
 expires_at DATETIME NOT NULL,
 payload_json TEXT NOT NULL,
 status ENUM('pending','accepted','cancelled','failed','expired') NOT NULL DEFAULT 'pending',
 attempts INT UNSIGNED NOT NULL DEFAULT 0,
 next_attempt_at DATETIME NULL,
 sent_at DATETIME NULL,
 received_at DATETIME NULL,
 FOREIGN KEY (device_id) REFERENCES notification_devices(device_id),
 INDEX idx_reminder_due (status, send_at, next_attempt_at),
 INDEX idx_reminder_task (task_id, status),
 INDEX idx_reminder_device (device_id, send_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS notification_logs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 event_id CHAR(64) CHARACTER SET ascii NOT NULL,
 attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 result VARCHAR(30) NOT NULL,
 http_status SMALLINT NULL,
 FOREIGN KEY (event_id) REFERENCES scheduled_reminders(event_id),
 INDEX idx_notification_event (event_id, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
