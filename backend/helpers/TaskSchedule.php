<?php
declare(strict_types=1);
final class TaskSchedule {
    public static function validate(array $data, ?array $existing): array {
        $r = array_replace($existing ?? [], $data);
        if (empty($r['dueDate']) || empty($r['dueTime'])) {
            if (!empty($r['dueTime']) && empty($r['dueDate'])) throw new ApiError(422, 'La hora requiere fecha.');
            return array_replace($data, ['dueTime'=>null, 'dueAt'=>null, 'timeZone'=>null, 'snoozedUntil'=>null]);
        }
        if (empty($r['dueAt']) || empty($r['timeZone'])) throw new ApiError(422, 'La fecha con hora requiere instante UTC y zona horaria.');
        try {
            $zone = new DateTimeZone($r['timeZone']);
            $utc = self::utc($r['dueAt']);
        } catch (Throwable $e) { throw new ApiError(422, 'Zona horaria o instante inválido.'); }
        if ($utc->setTimezone($zone)->format('Y-m-d H:i') !== $r['dueDate'] . ' ' . $r['dueTime']) throw new ApiError(422, 'La hora local no coincide con el instante UTC. Revisa el cambio de horario.');
        $out = array_replace($data, ['dueAt'=>$utc->format('Y-m-d H:i:s')]);
        if (array_key_exists('snoozedUntil', $data) && $data['snoozedUntil'] !== null) $out['snoozedUntil'] = self::utc($data['snoozedUntil'])->format('Y-m-d H:i:s');
        return $out;
    }
    public static function utc(string $value): DateTimeImmutable {
        $d = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:s\Z', $value, new DateTimeZone('UTC'));
        if (!$d || $d->format('Y-m-d\TH:i:s\Z') !== $value || $d->format('Y') < '1000') throw new ApiError(422, 'Fecha UTC inválida (YYYY-MM-DDTHH:mm:ssZ).');
        return $d;
    }
}
