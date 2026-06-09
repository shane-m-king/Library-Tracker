import pg from 'pg';

// pg is a CommonJS package, so we import the default export and pull Pool off it.
const { Pool } = pg;

// A connection POOL keeps a small set of open connections and hands them out
// per query, instead of opening/closing a fresh connection every time. This is
// the standard way to talk to Postgres from a web server.
//
// The connection details come from DATABASE_URL (loaded from .env).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Thin helper so the rest of the app can run queries without importing the pool
// directly. Usage: query('SELECT * FROM books WHERE id = $1', [bookId])
export function query(text, params) {
  return pool.query(text, params);
}

export default pool;
