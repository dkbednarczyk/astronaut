CREATE TABLE IF NOT EXISTS votes (
    slug  TEXT    PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0
);

-- hash is SHA-256(identity cookie ID + slug + SALT), one row per vote
CREATE TABLE IF NOT EXISTS voters (
    hash       TEXT    PRIMARY KEY,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS voters_created_at_idx ON voters (created_at);
