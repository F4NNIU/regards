-- mail.db migration 46: what agents asked to send, to notice a message
-- asked twice (a run replayed, an agent that lost track): the same
-- recipients, subject and text. Only a fingerprint is kept, not the text.

CREATE TABLE agent_sends (
    id          INTEGER PRIMARY KEY,
    account_id  TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    -- SHA-256 of the recipients, the subject and the text, as hex.
    fingerprint TEXT NOT NULL,
    -- Unix time in milliseconds.
    asked_at    INTEGER NOT NULL,
    -- The hold it waited as; NULL when it went after an undo window.
    hold_id     INTEGER
) STRICT;

CREATE INDEX agent_sends_by_message ON agent_sends (account_id, fingerprint, id);
