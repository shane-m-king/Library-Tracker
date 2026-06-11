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

// Run several queries as ONE atomic transaction. We check out a single dedicated
// client from the pool (a transaction must run all its statements on the same
// connection), wrap the work in BEGIN/COMMIT, and ROLLBACK if anything throws -
// so a multi-step write either fully happens or not at all. The `finally` always
// returns the client to the pool, success or failure, so we never leak connections.
//
// Usage:
//   await withTransaction(async (client) => {
//     await client.query('INSERT ...');
//     await client.query('INSERT ...');
//   });
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err; // let the caller decide how to respond
  } finally {
    client.release();
  }
}

export default pool;
