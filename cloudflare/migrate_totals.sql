ALTER TABLE songs ADD COLUMN total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE songs ADD COLUMN vote_count INTEGER NOT NULL DEFAULT 0;
UPDATE songs SET
  total = COALESCE((SELECT SUM(score) FROM votes WHERE song_id = songs.id), 0),
  vote_count = (SELECT COUNT(*) FROM votes WHERE song_id = songs.id);
CREATE TRIGGER IF NOT EXISTS count_vote AFTER INSERT ON votes
BEGIN
  UPDATE songs SET total = total + NEW.score, vote_count = vote_count + 1 WHERE id = NEW.song_id;
END;
