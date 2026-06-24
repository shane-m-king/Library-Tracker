// Talks to the Google Books API and normalizes its deeply-nested, verbose
// response into the tidy shape the rest of our app cares about. Node 22 has a
// global fetch(), so we need no HTTP library.

const GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1/volumes';

// How long we'll wait on Google before giving up. fetch() has NO timeout of its
// own, so without this a hung upstream would hang our request (and hold a
// connection) indefinitely. 8s is generous for a JSON lookup yet bounds the worst
// case the user can experience.
const REQUEST_TIMEOUT_MS = 8000;

// Google's cover URLs come back as http:// and sometimes carry a page-curl
// effect. Normalize to https and strip the curl so covers render cleanly.
function cleanImageUrl(url) {
  if (!url) return null;
  return url.replace(/^http:/, 'https:').replace('&edge=curl', '');
}

// Google lists identifiers in an array of { type, identifier }. Pull out the
// ISBN-10 and ISBN-13 if present.
function extractIsbns(industryIdentifiers = []) {
  let isbn10 = null;
  let isbn13 = null;
  for (const id of industryIdentifiers) {
    if (id.type === 'ISBN_10') isbn10 = id.identifier;
    if (id.type === 'ISBN_13') isbn13 = id.identifier;
  }
  return { isbn10, isbn13 };
}

// Map one Google "volume" into our normalized book shape. Note the field names
// here mirror our needs; almost everything can be missing, so we default hard.
// Exported so it can be unit-tested without hitting the live API.
export function normalizeVolume(volume) {
  const info = volume.volumeInfo ?? {};
  const images = info.imageLinks ?? {};
  const { isbn10, isbn13 } = extractIsbns(info.industryIdentifiers);

  return {
    googleVolumeId: volume.id,
    title: info.title ?? null,
    subtitle: info.subtitle ?? null,
    authors: info.authors ?? [],
    publisher: info.publisher ?? null,
    publishedDate: info.publishedDate ?? null,
    description: info.description ?? null,
    pageCount: info.pageCount ?? null,
    // Popularity signals, used by rankResults to break ties toward the edition most
    // people mean. Sparsely populated by Google, hence weighted lightly there.
    averageRating: info.averageRating ?? null,
    ratingsCount: info.ratingsCount ?? null,
    isbn10,
    isbn13,
    // Google calls these "categories"; we call them genres throughout our app
    // (matching the genres table and the nested book shape in library/loans).
    genres: info.categories ?? [],
    thumbnailUrl: cleanImageUrl(images.thumbnail),
    smallThumbnailUrl: cleanImageUrl(images.smallThumbnail),
  };
}

// Lower-case, collapse runs of whitespace, and trim - so text comparisons below are
// case- and spacing-insensitive ("The   Hobbit" matches "the hobbit").
function normalizeText(value) {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Score one normalized book against the user's (already normalized) query and its
// word tokens. Higher is more relevant. The guiding philosophy is "the right book
// leads": text relevance dominates, popularity is a strong tiebreaker AMONG relevant
// results, and quality is a light nudge. Tuned against real Google data for tricky
// series queries (e.g. "harry potter") - see googleBooks.test.js.
//
// Exported so the weighting can be unit-tested directly, without the live API.
export function scoreBook(query, queryTokens, book) {
  const title = normalizeText(book.title);

  // --- Text relevance: does this book match what they typed? ---
  let textScore = 0;

  // Title match - the dominant signal; only the strongest tier applies. The gap
  // between exact (80) and prefix (70) is deliberately SMALL: for a series/partial
  // query like "harry potter", a real entry ("Harry Potter and the...") is a prefix
  // match and should sit right alongside a bare exact-title stub, not far behind it.
  // We keep a slight exact edge so true single-title searches ("Dune" over "Dune
  // Messiah") still resolve correctly.
  if (title && title === query) textScore += 80; // exact title
  else if (query && title.startsWith(query)) textScore += 70; // "harry potter and the..."
  else if (query && title.includes(query)) textScore += 40; // appears somewhere in title

  // Word coverage: reward titles containing the query's words even out of order.
  if (queryTokens.length > 0) {
    const matched = queryTokens.filter((t) => title.includes(t)).length;
    textScore += 20 * (matched / queryTokens.length);
  }

  // Author match - handles searching by author rather than title.
  const authors = normalizeText((book.authors ?? []).join(' '));
  if (query && authors.includes(query)) textScore += 20;
  else if (queryTokens.length > 0) {
    const matched = queryTokens.filter((t) => authors.includes(t)).length;
    textScore += 10 * (matched / queryTokens.length);
  }

  // Subtitle is a weak signal.
  if (query && normalizeText(book.subtitle).includes(query)) textScore += 5;

  // --- Quality: a real published edition (cover, ISBN-13, real page count) over a
  // bare stub. Noisy - some legitimate editions lack these - so weighted lightly. ---
  let quality = 0;
  if (book.thumbnailUrl) quality += 4;
  if (book.isbn13) quality += 3;
  if (book.pageCount && book.pageCount >= 50) quality += 2;

  // --- Popularity: a strong tiebreaker among RELEVANT results, GATED on a text match
  // so a popular but unrelated book can never float up. Log-scaled because the jump
  // from 8 to 308 ratings is meaningful while 5,000 vs 50,000 barely is; capped so one
  // runaway count can't bury an otherwise-better match. ratingsCount is sparse, so in
  // practice this mainly elevates the few flagship editions that actually have ratings
  // - which is exactly the book the user usually wants. ---
  let popularity = 0;
  if (textScore > 0) {
    if (book.ratingsCount > 0) {
      popularity += Math.min(20 * Math.log10(book.ratingsCount + 1), 50);
    }
    if (book.averageRating) popularity += book.averageRating; // up to +5
  }

  return textScore + quality + popularity;
}

// Re-rank normalized search results best-match-first for the user's query. Pure: it
// returns a new sorted array and never mutates its input. Ties fall back to the
// original (Google) order via the index, so equal scores stay stable.
export function rankResults(query, books) {
  const q = normalizeText(query);
  const qTokens = q.split(' ').filter(Boolean);

  return books
    .map((book, index) => ({ book, index, score: scoreBook(q, qTokens, book) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.book);
}

// One place that calls Google and returns parsed JSON, with a hard timeout and
// consistent error tagging. Every thrown error carries a `.status` so the routes
// can branch on it: the real HTTP status on a bad response (e.g. 429 = rate
// limited, 404 = bad id), or 504 when WE gave up waiting. Without a status, a
// timeout would fall through to a generic 500 instead of an upstream-failure 502.
async function fetchGoogleJson(url) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    // AbortSignal.timeout aborts with a TimeoutError; anything else here is a
    // network-level failure (DNS, refused, dropped). Either way it's an upstream
    // problem, not ours - present it as a gateway timeout/failure.
    const error = new Error(
      err.name === 'TimeoutError'
        ? `Google Books API timed out after ${REQUEST_TIMEOUT_MS}ms`
        : `Could not reach Google Books: ${err.message}`
    );
    error.status = 504;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`Google Books API returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// Search Google Books and return an array of normalized books, best match first.
export async function searchBooks(queryText) {
  const params = new URLSearchParams({
    q: queryText,
    maxResults: '20',
  });

  // Use an API key if one is configured. Works fine without it in development.
  if (process.env.GOOGLE_BOOKS_API_KEY) {
    params.set('key', process.env.GOOGLE_BOOKS_API_KEY);
  }

  const data = await fetchGoogleJson(`${GOOGLE_BOOKS_URL}?${params}`);
  const items = data.items ?? []; // no matches -> items is absent
  const books = items.map(normalizeVolume);
  // Re-rank so the book the user most likely wants is first, rather than trusting
  // Google's default order (which often surfaces guides/reprints above the real one).
  return rankResults(queryText, books);
}

// Fetch ONE specific volume by its Google id and return it normalized. Used when
// a user adds a book to their library: rather than trust the catalog data the
// client sends, the server re-fetches the authoritative record from Google. The
// single-volume endpoint returns the volume object directly (not wrapped in an
// `items` array like search), and normalizeVolume already reads exactly that shape.
export async function getVolume(volumeId) {
  const params = new URLSearchParams();
  if (process.env.GOOGLE_BOOKS_API_KEY) {
    params.set('key', process.env.GOOGLE_BOOKS_API_KEY);
  }
  const queryString = params.toString();
  const url = `${GOOGLE_BOOKS_URL}/${encodeURIComponent(volumeId)}${queryString ? `?${queryString}` : ''}`;

  // Same timeout + status-tagging as search (404 = bad id, 429 = rate limited, 504
  // = we timed out). The single-volume endpoint returns the volume object directly.
  const volume = await fetchGoogleJson(url);
  return normalizeVolume(volume);
}
