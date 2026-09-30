-- Apply once to the existing database. Existing performances become Day 1 auditions.
ALTER TABLE songs ADD COLUMN day INTEGER NOT NULL DEFAULT 1 CHECK(day BETWEEN 1 AND 5);
ALTER TABLE songs ADD COLUMN contestant_id INTEGER REFERENCES songs(id);
CREATE UNIQUE INDEX one_final_per_contestant ON songs(contestant_id) WHERE day = 5;
CREATE TABLE competition (id INTEGER PRIMARY KEY CHECK(id=1), day INTEGER NOT NULL DEFAULT 1 CHECK(day BETWEEN 1 AND 5));
INSERT INTO competition(id,day) VALUES(1,1);
CREATE TABLE qualification (id INTEGER PRIMARY KEY CHECK(id=1), places INTEGER NOT NULL CHECK(places IN (10,15)), audition_count INTEGER NOT NULL, confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE finalists (audition_id INTEGER PRIMARY KEY REFERENCES songs(id), ballot INTEGER NOT NULL DEFAULT 0 CHECK(ballot IN (0,1)));
CREATE TRIGGER qualification_guard BEFORE INSERT ON qualification
WHEN (SELECT day FROM competition WHERE id=1) != 4 OR EXISTS(SELECT 1 FROM songs WHERE status='open') OR NEW.audition_count != (SELECT COUNT(*) FROM songs WHERE day<5)
BEGIN SELECT RAISE(ABORT,'Close all auditions on Day 4 first'); END;
