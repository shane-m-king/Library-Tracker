import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { searchBooks } from '../services/googleBooks.js';

const router = Router();

// GET /api/books/search?q=...
// Searches Google Books and returns normalized results. This does NOT touch our
// database - caching a book happens later, when a user adds it to their library
// or wishlist (that's the moment we know the book matters).
router.get('/search', requireAuth, async (req, res) => {
  const q = (req.query.q ?? '').trim();

  if (!q) {
    return res.status(400).json({ error: 'a search query (?q=) is required' });
  }

  try {
    const results = await searchBooks(q);
    return res.json({ results });
  } catch (err) {
    console.error('Book search failed:', err);
    if (err.status === 429) {
      // Pass the rate-limit signal through, with an actionable message.
      return res.status(429).json({
        error:
          'Google Books rate limit reached. Try again shortly, or configure a GOOGLE_BOOKS_API_KEY.',
      });
    }
    // 502 Bad Gateway: our server is fine, but the upstream API failed.
    return res.status(502).json({ error: 'failed to fetch from Google Books' });
  }
});

export default router;
