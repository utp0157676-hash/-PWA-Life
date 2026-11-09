<?php
declare(strict_types=1);
final class Validator {
    public static function id(mixed $id): string {
        if (!is_string($id) || !preg_match('/^[a-zA-Z0-9_-]{1,100}$/D', $id)) throw new ApiError(422, 'Identificador inválido.');
        return $id;
    }
    public static function record(string $type, array $input, bool $partial = false): array {
        $fields = $type === 'tasks'
            ? ['title'=>255, 'description'=>65535, 'priority'=>5, 'dueDate'=>10, 'completed'=>0, 'dueTime'=>5, 'dueAt'=>20, 'timeZone'=>64, 'reminderMinutes'=>0, 'notificationsEnabled'=>0, 'snoozedUntil'=>20]
            : ['title'=>255, 'content'=>65535, 'category'=>100, 'colorTag'=>20];
        $defaults = $type === 'tasks'
            ? ['description'=>'', 'priority'=>'media', 'dueDate'=>null, 'completed'=>false]
            : ['category'=>'Personal', 'colorTag'=>'#3b82f6'];
        foreach ($input as $key => $value) {
            if (!array_key_exists($key, $fields) && !in_array($key, ['id','createdAt','updatedAt','revision'], true)) throw new ApiError(422, 'Campo desconocido: ' . $key);
        }
        $out = $partial ? [] : $defaults;
        foreach ($fields as $key => $max) {
            if (!array_key_exists($key, $input)) {
                if (in_array($key, ['dueTime','dueAt','timeZone','reminderMinutes','notificationsEnabled','snoozedUntil'], true)) continue;
                if (!$partial && !array_key_exists($key, $defaults)) throw new ApiError(422, "Falta $key.");
                continue;
            }
            $v = $input[$key];
            if (in_array($key, ['completed','notificationsEnabled'], true)) {
                if (!is_bool($v)) throw new ApiError(422, "$key debe ser booleano.");
            } elseif ($key === 'reminderMinutes') {
                if ($v !== null && (!is_int($v) || !in_array($v, [0,5,15,30,60,1440], true))) throw new ApiError(422, 'Anticipación inválida.');
            } elseif (in_array($key, ['dueDate','dueTime','dueAt','timeZone','snoozedUntil'], true) && $v === null) {
                // Fecha opcional.
            } else {
                if (!is_string($v) || mb_strlen($v, 'UTF-8') > $max || strlen($v) > 65535) throw new ApiError(422, "Longitud o tipo inválido: $key.");
                if (in_array($key, ['title','content'], true) && trim($v) === '') throw new ApiError(422, "$key es obligatorio.");
                if ($key === 'priority' && !in_array($v, ['alta','media','baja'], true)) throw new ApiError(422, 'Prioridad inválida.');
                if ($key === 'colorTag' && !preg_match('/^#[0-9a-fA-F]{6}$/D', $v)) throw new ApiError(422, 'Color inválido.');
                if ($key === 'dueTime' && !preg_match('/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/D', $v)) throw new ApiError(422, 'Hora inválida.');
                if ($key === 'dueDate') {
                    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $v);
                    if (!$date || $date->format('Y-m-d') !== $v || $v < '1000-01-01') throw new ApiError(422, 'Fecha inválida.');
                }
            }
            $out[$key] = $v;
        }
        return $out;
    }
}
