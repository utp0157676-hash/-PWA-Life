<?php
declare(strict_types=1);
final class Record {
    private array $map;
    public function __construct(private PDO $db, private string $table) {
        if (!in_array($table, ['tasks','notes'], true)) throw new LogicException('Tabla inválida.');
        $this->map = ['id'=>'id','title'=>'title','createdAt'=>'created_at','updatedAt'=>'updated_at','deletedAt'=>'deleted_at','revision'=>'revision'] +
            ($table === 'tasks' ? ['description'=>'description','priority'=>'priority','dueDate'=>'due_date','completed'=>'completed'] : ['content'=>'content','category'=>'category','colorTag'=>'color_tag']);
    }
    private function decode(array $row): array {
        $out = [];
        foreach ($this->map as $key => $column) {
            $v = $row[$column];
            if ($key === 'completed') $v = (bool)$v;
            if ($key === 'revision') $v = (int)$v;
            if (in_array($key, ['createdAt','updatedAt','deletedAt'], true) && $v !== null) $v = str_replace(' ', 'T', $v) . 'Z';
            $out[$key] = $v;
        }
        return $out;
    }
    public function all(bool $deleted): array {
        $sql = "SELECT * FROM {$this->table}" . ($deleted ? '' : ' WHERE deleted_at IS NULL') . ' ORDER BY created_at, id';
        return array_map(fn($r) => $this->decode($r), $this->db->query($sql)->fetchAll());
    }
    public function find(string $id, bool $lock = false): ?array {
        $s = $this->db->prepare("SELECT * FROM {$this->table} WHERE id = ?" . ($lock ? ' FOR UPDATE' : ''));
        $s->execute([$id]);
        $r = $s->fetch();
        return $r ? $this->decode($r) : null;
    }
    public function write(string $id, array $data, bool $create): array {
        $values = [];
        foreach ($data as $key => $v) $values[$this->map[$key]] = is_bool($v) ? (int)$v : $v;
        $values['updated_at'] = gmdate('Y-m-d H:i:s');
        if ($create) {
            $values['created_at'] = $values['created_at'] ?? $values['updated_at'];
            $values['id'] = $id;
            $columns = implode(', ', array_keys($values));
            $marks = implode(', ', array_fill(0, count($values), '?'));
            $s = $this->db->prepare("INSERT INTO {$this->table} ($columns) VALUES ($marks)");
            $s->execute(array_values($values));
        } else {
            $sets = implode(', ', array_map(fn($c) => "$c = ?", array_keys($values)));
            $s = $this->db->prepare("UPDATE {$this->table} SET $sets, revision = revision + 1 WHERE id = ?");
            $s->execute([...array_values($values), $id]);
        }
        return $this->find($id);
    }
}
