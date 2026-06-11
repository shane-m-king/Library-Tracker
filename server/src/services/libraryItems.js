// The single source of truth for what a "library item" looks like coming out of
// our API: a user_books row joined to its catalog book, with the book's authors
// and genres collapsed back into arrays, mapped into our camelCase contract.
//
// Every endpoint that returns library items goes through here - GET (list), and
// POST/PATCH (the one row they just wrote) - so they can never drift into
// different shapes. It's also written to be reused by the upcoming social
// endpoint (viewing another user's library), which is the same query behind a
// visibility gate.

import pool from '../db.js';

// Shape one joined DB row into the API's response contract: the personal fields
// at the top level, with the shared catalog data nested under `book`. Keeping
// this explicit means our column names aren't leaked straight to clients - the
// API shape is something we choose on purpose.
export function toLibraryItem(row) {
  return {
    id: row.id,
    status: row.status,
    rating: row.rating,
    notes: row.notes,
    quantity: row.quantity,
    acquiredDate: row.acquired_date,
    acquiredPlace: row.acquired_place,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    book: {
      id: row.book_id,
      googleVolumeId: row.google_volume_id,
      title: row.title,
      subtitle: row.subtitle,
      authors: row.authors,
      genres: row.genres,
      publishedDate: row.published_date,
      pageCount: row.page_count,
      isbn10: row.isbn_10,
      isbn13: row.isbn_13,
      publisher: row.publisher,
      thumbnailUrl: row.thumbnail_url,
      smallThumbnailUrl: row.small_thumbnail_url,
    },
  };
}

// Fetch a user's library items as API-shaped objects. Both filters are optional:
//   status - 'owned' | 'wishlist', or null for all
//   id     - a single user_books id, or null for the whole library
//
// `executor` is whatever runs the query: the connection POOL by default, or a
// transaction `client` when the caller needs the read to see its own
// not-yet-committed write (POST/PATCH re-fetching the row they just changed).
// Both expose the same `.query(text, params)` method, so either works.
export async function getLibraryItems({ userId, status = null, id = null }, executor = pool) {
  // Authors and genres are each one-to-many off the book. JOINing both directly
  // would fan out a book with 1 author and 3 genres into 3 rows (and 2x3 -> 6),
  // corrupting the aggregates. Instead each array is built in its own correlated
  // subquery, computed independently so they never multiply against each other.
  // COALESCE(..., '{}') yields an empty array (not NULL) when there are none.
  //
  // acquired_date is cast to text so it serializes as a plain 'YYYY-MM-DD'
  // string; left as a DATE, the pg driver returns a JS Date that can shift by a
  // day across timezones when converted to JSON.
  //
  // Each ($n IS NULL OR col = $n) clause is a no-op when that filter is null,
  // letting one query serve "list all", "filter by status", and "fetch one".
  const result = await executor.query(
    `SELECT
       ub.id, ub.status, ub.rating, ub.notes, ub.quantity,
       ub.acquired_date::text AS acquired_date, ub.acquired_place,
       ub.created_at, ub.updated_at,
       b.id AS book_id, b.google_volume_id, b.title, b.subtitle,
       b.published_date, b.page_count, b.isbn_10, b.isbn_13, b.publisher,
       b.thumbnail_url, b.small_thumbnail_url,
       COALESCE(
         (SELECT array_agg(a.name ORDER BY ba.position)
            FROM book_authors ba JOIN authors a ON a.id = ba.author_id
           WHERE ba.book_id = b.id),
         '{}'
       ) AS authors,
       COALESCE(
         (SELECT array_agg(g.name ORDER BY g.name)
            FROM book_genres bg JOIN genres g ON g.id = bg.genre_id
           WHERE bg.book_id = b.id),
         '{}'
       ) AS genres
     FROM user_books ub
     JOIN books b ON b.id = ub.book_id
     WHERE ub.user_id = $1
       AND ($2::text   IS NULL OR ub.status = $2)
       AND ($3::bigint IS NULL OR ub.id = $3)
     ORDER BY ub.created_at DESC`,
    [userId, status, id]
  );

  return result.rows.map(toLibraryItem);
}

// Convenience wrapper for the single-row case (POST/PATCH). Returns the one
// mapped item, or null if no row matched (e.g. it isn't this user's).
export async function getLibraryItem({ userId, id }, executor = pool) {
  const items = await getLibraryItems({ userId, id }, executor);
  return items[0] ?? null;
}
