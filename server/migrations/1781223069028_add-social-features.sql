-- Up Migration
--
-- The social layer: a friends graph, per-user library visibility, and a public
-- handle so users can find each other. Purely additive - nothing here changes or
-- breaks existing behavior.

-- ---------------------------------------------------------------------------
-- users.username: the public handle used to find and add friends.
--
-- CITEXT (like email) makes it case-insensitive, so @Shane and @shane can't both
-- exist. We add it NULLABLE for now and backfill existing rows, rather than
-- NOT NULL: registration doesn't collect a username yet, so a NOT NULL column
-- would break every new signup. This is the safe online-migration pattern - add
-- nullable, backfill, and only enforce NOT NULL in a later migration once every
-- write path is guaranteed to supply one. Format rules (length, allowed chars)
-- live in the API layer; the DB just guarantees uniqueness.
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN username CITEXT UNIQUE;

-- Give existing accounts a deterministic, unique placeholder handle so they're
-- immediately findable. 'user_' || id is unique because id is.
UPDATE users SET username = 'user_' || id WHERE username IS NULL;

-- ---------------------------------------------------------------------------
-- users.library_visibility: who may view this user's library.
--   public  = any logged-in user
--   friends = only accepted friends (the default)
--   private = only the owner
-- NOT NULL with a default, so existing rows are safely backfilled to 'friends'.
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN library_visibility TEXT NOT NULL DEFAULT 'friends'
    CHECK (library_visibility IN ('public', 'friends', 'private'));

-- ---------------------------------------------------------------------------
-- friendships: a self-referential many-to-many between users, with state.
--
-- The relationship is directional in storage (requester asked addressee), which
-- we need for the request -> accept flow and to show "incoming vs outgoing". But
-- a friendship itself is undirected: (A,B) and (B,A) are the SAME bond. We forbid
-- the reversed duplicate with a functional unique index on the normalized pair
-- (LEAST, GREATEST) - so once A befriends B, B can't open a second request to A.
--
-- Declining a request simply deletes the row, so there's no 'declined' state to
-- store - status is only 'pending' or 'accepted'.
-- ---------------------------------------------------------------------------
CREATE TABLE friendships (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requester_id BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,                      -- set when the request is accepted
  CHECK (requester_id <> addressee_id)           -- no befriending yourself
);

-- One bond per pair, in either direction. LEAST/GREATEST normalize the pair so
-- (3,7) and (7,3) collide on the same index key.
CREATE UNIQUE INDEX idx_friendships_pair
  ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));

-- We query friendships from both sides: outgoing/by-requester and
-- incoming/by-addressee, plus the "all my friends" OR across both columns. The
-- functional pair index above can't serve those plain-column lookups, so each
-- side gets its own btree index.
CREATE INDEX idx_friendships_requester ON friendships (requester_id);
CREATE INDEX idx_friendships_addressee ON friendships (addressee_id);


-- Down Migration

DROP TABLE IF EXISTS friendships;

ALTER TABLE users DROP COLUMN IF EXISTS library_visibility;
ALTER TABLE users DROP COLUMN IF EXISTS username;
