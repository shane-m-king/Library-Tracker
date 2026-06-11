// The single source of truth for what a "loan item" looks like coming out of our
// API: a loans row joined to its catalog book (with authors collapsed into an
// array), mapped into our camelCase contract with a convenience `active` flag.
//
// Every endpoint that returns loans goes through here - GET (list) and POST/PATCH
// (the one row they just wrote) - so they can never drift into different shapes.
// This mirrors services/libraryItems.js.

import pool from '../db.js';

// Shape one joined loan row into the API contract: loan fields on top, the
// catalog book nested under `book`. Keeping this explicit means our column names
// aren't leaked straight to clients - the API shape is something we choose.
export function toLoanItem(row) {
  return {
    id: row.id,
    direction: row.direction,
    counterpartyName: row.counterparty_name,
    loanedOn: row.loaned_on,
    dueDate: row.due_date,
    returnedOn: row.returned_on,
    active: row.returned_on === null, // not yet returned
    notes: row.notes,
    createdAt: row.created_at,
    book: {
      id: row.book_id,
      googleVolumeId: row.google_volume_id,
      title: row.title,
      subtitle: row.subtitle,
      authors: row.authors,
      thumbnailUrl: row.thumbnail_url,
      smallThumbnailUrl: row.small_thumbnail_url,
    },
  };
}

// Fetch a user's loans as API-shaped objects, newest first. All filters optional:
//   direction - 'lent_out' | 'borrowed', or null for both
//   active    - true (not yet returned) | false (returned) | null for either
//   id        - a single loan id, or null for all the user's loans
//
// `executor` is the connection POOL by default, or a transaction `client` when
// the caller needs the read to see its own not-yet-committed write (POST/PATCH
// re-fetching the row they just changed). Both expose the same `.query` method.
export async function getLoanItems(
  { userId, direction = null, active = null, id = null },
  executor = pool
) {
  // The date columns are cast to text so they serialize as plain 'YYYY-MM-DD'
  // strings instead of timezone-shiftable Date objects. Authors are aggregated in
  // a correlated subquery (a JOIN would fan the loan row out, once per author).
  // Each ($n IS NULL OR ...) clause is a no-op when that filter is null, so one
  // query serves "list all", the filtered lists, and "fetch one". For `active` we
  // compare the boolean expression (returned_on IS NULL) against the requested flag.
  const result = await executor.query(
    `SELECT
       l.id, l.direction, l.counterparty_name,
       l.loaned_on::text   AS loaned_on,
       l.due_date::text    AS due_date,
       l.returned_on::text AS returned_on,
       l.notes, l.created_at,
       b.id AS book_id, b.google_volume_id, b.title, b.subtitle,
       b.thumbnail_url, b.small_thumbnail_url,
       COALESCE(
         (SELECT array_agg(a.name ORDER BY ba.position)
            FROM book_authors ba JOIN authors a ON a.id = ba.author_id
           WHERE ba.book_id = b.id),
         '{}'
       ) AS authors
     FROM loans l
     JOIN books b ON b.id = l.book_id
     WHERE l.user_id = $1
       AND ($2::text    IS NULL OR l.direction = $2)
       AND ($3::boolean IS NULL OR (l.returned_on IS NULL) = $3)
       AND ($4::bigint  IS NULL OR l.id = $4)
     ORDER BY l.created_at DESC`,
    [userId, direction, active, id]
  );

  return result.rows.map(toLoanItem);
}

// Convenience wrapper for the single-row case (POST/PATCH). Returns the one
// mapped loan, or null if no row matched (e.g. it isn't this user's).
export async function getLoanItem({ userId, id }, executor = pool) {
  const items = await getLoanItems({ userId, id }, executor);
  return items[0] ?? null;
}
