CREATE DATABASE IF NOT EXISTS pwa_life_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pwa_life_db;
CREATE TABLE IF NOT EXISTS tasks (
 id VARCHAR(100) COLLATE utf8mb4_bin PRIMARY KEY,
 title VARCHAR(255) NOT NULL,
 description TEXT NOT NULL,
 priority ENUM('alta','media','baja') NOT NULL DEFAULT 'media',
 due_date DATE NULL,
 completed BOOLEAN NOT NULL DEFAULT FALSE,
 created_at DATETIME NOT NULL,
 updated_at DATETIME NOT NULL,
 deleted_at DATETIME NULL,
 revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
 INDEX idx_tasks_active (deleted_at, completed, due_date),
 INDEX idx_tasks_priority (priority, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS notes (
 id VARCHAR(100) COLLATE utf8mb4_bin PRIMARY KEY,
 title VARCHAR(255) NOT NULL,
 content TEXT NOT NULL,
 category VARCHAR(100) NOT NULL DEFAULT 'Personal',
 color_tag VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
 created_at DATETIME NOT NULL,
 updated_at DATETIME NOT NULL,
 deleted_at DATETIME NULL,
 revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
 INDEX idx_notes_active (deleted_at, updated_at),
 INDEX idx_notes_category (category, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Ledger durable: no eliminar mientras puedan existir clientes con reintentos.
CREATE TABLE IF NOT EXISTS sync_operations (
 id VARCHAR(100) COLLATE utf8mb4_bin PRIMARY KEY,
 request_hash CHAR(64) NOT NULL,
 response_json MEDIUMTEXT NOT NULL,
 status_code SMALLINT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
