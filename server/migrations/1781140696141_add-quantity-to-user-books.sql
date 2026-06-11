-- Up Migration

-- How many copies of this book the user owns. Drives the lending rule: a user
-- may have at most `quantity` active lent-out loans for a given book. Defaults to
-- 1 (the common case) and backfills any existing rows. CHECK (>= 1) keeps an
-- owned entry meaningful; for wishlist rows the value is simply unused.
ALTER TABLE user_books
  ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1);

-- Down Migration

ALTER TABLE user_books
  DROP COLUMN quantity;
