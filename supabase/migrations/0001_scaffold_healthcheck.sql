-- Up migration: trivial scaffold table to prove migration workflow
CREATE TABLE IF NOT EXISTS scaffold_healthcheck (
  id   INT PRIMARY KEY,
  note TEXT
);
