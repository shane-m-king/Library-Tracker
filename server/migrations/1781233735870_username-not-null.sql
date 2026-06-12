-- Up Migration
--
-- Final step of the safe online migration for users.username. It was added
-- NULLABLE in add-social-features so existing rows and the then-unchanged
-- registration path wouldn't break. Existing rows were backfilled, and register
-- now requires a username, so every row has one and every write supplies one -
-- making it safe to enforce NOT NULL. (SET NOT NULL scans the table and fails if
-- any NULL remains, so this also asserts the backfill was complete.)
ALTER TABLE users ALTER COLUMN username SET NOT NULL;

-- Down Migration

ALTER TABLE users ALTER COLUMN username DROP NOT NULL;
