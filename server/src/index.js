import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { query } from './db.js';
import authRouter from './routes/auth.js';
import booksRouter from './routes/books.js';
import libraryRouter from './routes/library.js';
import loansRouter from './routes/loans.js';
import usersRouter from './routes/users.js';
import friendsRouter from './routes/friends.js';

// Fail fast on missing critical configuration. Better a clear crash at startup
// than confusing 500s at request time (or, worse, signing JWTs no one can verify).
for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 4000;

// --- Middleware ---
app.use(cors({
  origin: process.env.CLIENT_ORIGIN,  // only our frontend may call this API
  credentials: true,                  // allow the auth cookie to be sent/received
}));
app.use(express.json());    // parse JSON request bodies into req.body
app.use(cookieParser());    // parse the Cookie header into req.cookies

// --- Routes ---
// Health check: confirms the server is up AND that it can reach the database.
// We run the cheapest possible query (SELECT 1) just to prove the round-trip works.
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Health check failed:', err.message);
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
});

// Auth routes: /api/auth/register, /login, /logout, /me
app.use('/api/auth', authRouter);

// Book routes: /api/books/search
app.use('/api/books', booksRouter);

// Library routes: the logged-in user's own collection (user_books)
app.use('/api/library', libraryRouter);

// Loan routes: lending and borrowing (loans)
app.use('/api/loans', loansRouter);

// User routes: profiles, discovery, and your own account (/me)
app.use('/api/users', usersRouter);

// Friend routes: the friends graph (requests, accept/decline, list)
app.use('/api/friends', friendsRouter);

// Catch-all for any request that didn't match a route above. Without this,
// Express's default handler replies with an HTML page, which breaks a client that
// always parses JSON. Mounted LAST so it only runs when nothing else matched.
app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// --- Start the server ---
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
