-- mail.db migration 45: what became of an undo.
--
-- An agent's activity names the undo that reverses each change. Undo ids
-- were reused once the newest entry was gone (taken, or expired), so an
-- old activity entry could come to name a later, unrelated undo. They are
-- now never reused, and never one an activity entry already names.

CREATE TABLE undo_log_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    description TEXT NOT NULL,  -- for the toast, for example "Archived 2 messages"
    inverse     TEXT NOT NULL   -- JSON
) STRICT;
INSERT INTO undo_log_new (id, created_at, expires_at, description, inverse)
    SELECT id, created_at, expires_at, description, inverse FROM undo_log;
DROP TABLE undo_log;
ALTER TABLE undo_log_new RENAME TO undo_log;

DELETE FROM sqlite_sequence WHERE name IN ('undo_log', 'undo_log_new');
INSERT INTO sqlite_sequence (name, seq) VALUES (
    'undo_log',
    MAX(
        COALESCE((SELECT MAX(id) FROM undo_log), 0),
        COALESCE((SELECT MAX(undo_id) FROM agent_audit), 0)
    )
);

-- When the person undid an agent's change (Unix ms): the activity can then
-- tell an undo that was used from one that ran out.
ALTER TABLE agent_audit ADD COLUMN undone_at INTEGER;
