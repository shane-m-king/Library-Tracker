-- Up Migration

-- Case-insensitive text type, used for emails (so Foo@x.com == foo@x.com).
-- "citext" is a trusted extension, so the database owner can install it.
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- users: application accounts
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         CITEXT      NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  display_name  TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- books: shared, cached metadata from the Google Books API
-- One row per unique book; every user references these rows.
-- ---------------------------------------------------------------------------
CREATE TABLE books (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  google_volume_id    TEXT        NOT NULL UNIQUE,
  title               TEXT        NOT NULL,
  subtitle            TEXT,
  description         TEXT,
  publisher           TEXT,
  published_date      TEXT,        -- Google sends partial dates ("2011", "2011-05")
  page_count          INTEGER,
  isbn_10             TEXT,
  isbn_13             TEXT,
  thumbnail_url       TEXT,        -- ~128px cover
  small_thumbnail_url TEXT,        -- ~80px cover
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- authors & genres: normalized lookup tables (one row per unique value)
-- ---------------------------------------------------------------------------
CREATE TABLE authors (
  id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE genres (
  id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------------
-- book_authors: links books <-> authors, preserving author order
-- ---------------------------------------------------------------------------
CREATE TABLE book_authors (
  book_id   BIGINT   NOT NULL REFERENCES books(id)   ON DELETE CASCADE,
  author_id BIGINT   NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  position  SMALLINT NOT NULL DEFAULT 1,
  PRIMARY KEY (book_id, author_id)
);
CREATE INDEX idx_book_authors_author_id ON book_authors (author_id);

-- ---------------------------------------------------------------------------
-- book_genres: links books <-> genres
-- ---------------------------------------------------------------------------
CREATE TABLE book_genres (
  book_id  BIGINT NOT NULL REFERENCES books(id)  ON DELETE CASCADE,
  genre_id BIGINT NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, genre_id)
);
CREATE INDEX idx_book_genres_genre_id ON book_genres (genre_id);

-- ---------------------------------------------------------------------------
-- user_books: a user's OWNERSHIP relationship to a book (the "what's mine" axis)
-- Carries per-user data: status, rating, notes, acquisition details.
-- ---------------------------------------------------------------------------
CREATE TABLE user_books (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id        BIGINT      NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  status         TEXT        NOT NULL CHECK (status IN ('wishlist', 'owned')),
  rating         SMALLINT    CHECK (rating BETWEEN 1 AND 5),
  notes          TEXT,
  acquired_date  DATE,
  acquired_place TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);
CREATE INDEX idx_user_books_book_id ON user_books (book_id);

-- ---------------------------------------------------------------------------
-- loans: lending & borrowing events (the "where is it right now" axis)
-- direction distinguishes a book you lent out vs. one you borrowed.
-- returned_on IS NULL means the loan is still active.
-- ---------------------------------------------------------------------------
CREATE TABLE loans (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id           BIGINT      NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  direction         TEXT        NOT NULL CHECK (direction IN ('lent_out', 'borrowed')),
  counterparty_name TEXT        NOT NULL,
  loaned_on         DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE,
  returned_on       DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_loans_user_id ON loans (user_id);
CREATE INDEX idx_loans_book_id ON loans (book_id);

-- Down Migration

-- Drop in reverse dependency order (children before parents).
DROP TABLE IF EXISTS loans;
DROP TABLE IF EXISTS user_books;
DROP TABLE IF EXISTS book_genres;
DROP TABLE IF EXISTS book_authors;
DROP TABLE IF EXISTS genres;
DROP TABLE IF EXISTS authors;
DROP TABLE IF EXISTS books;
DROP TABLE IF EXISTS users;
DROP EXTENSION IF EXISTS citext;
