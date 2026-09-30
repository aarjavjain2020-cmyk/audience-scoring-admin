CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER NOT NULL UNIQUE,
  performer TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  total INTEGER NOT NULL DEFAULT 0,
  vote_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_song ON songs(status) WHERE status = 'open';
CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL REFERENCES songs(id),
  device_hash TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 20),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(song_id, device_hash)
);
CREATE TABLE IF NOT EXISTS login_attempts (
  address_hash TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  last_attempt INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS count_vote AFTER INSERT ON votes
BEGIN
  UPDATE songs SET total = total + NEW.score, vote_count = vote_count + 1 WHERE id = NEW.song_id;
END;
