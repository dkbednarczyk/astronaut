-- Upvote counters, one row per blog post slug.
-- A row is created lazily on the first vote for that slug, so this table
-- starts empty and only ever contains slugs that exist as real posts.
CREATE TABLE IF NOT EXISTS votes (
    slug  TEXT    PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0
);

-- One row per (identity, slug) pair, used to reject duplicate votes.
--
-- `hash` is SHA-256(cookie ID + slug + SALT). The ID is an opaque random
-- value the server minted, not anything derived from the visitor, so this
-- table records no IP, device, or browser information. Hashing it also means
-- a database dump cannot be replayed as working cookies.
--
-- No foreign key to `votes` on purpose: a vote row and its counter row are
-- written together, and orphan voters rows are harmless.
CREATE TABLE IF NOT EXISTS voters (
    hash       TEXT    PRIMARY KEY,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS voters_created_at_idx ON voters (created_at);
