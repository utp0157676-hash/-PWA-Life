<?php
declare(strict_types=1);
final class ApiError extends RuntimeException {
    public function __construct(public int $status, string $message) { parent::__construct($message); }
}
function respond(array $body, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
