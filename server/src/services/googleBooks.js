// Talks to the Google Books API and normalizes its deeply-nested, verbose
// response into the tidy shape the rest of our app cares about. Node 22 has a
// global fetch(), so we need no HTTP library.

const GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1/volumes';

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
    isbn10,
    isbn13,
    // Google calls these "categories"; we call them genres throughout our app
    // (matching the genres table and the nested book shape in library/loans).
    genres: info.categories ?? [],
    thumbnailUrl: cleanImageUrl(images.thumbnail),
    smallThumbnailUrl: cleanImageUrl(images.smallThumbnail),
  };
}

// Search Google Books and return an array of normalized books.
export async function searchBooks(queryText) {
  const params = new URLSearchParams({
    q: queryText,
    maxResults: '20',
  });

  // Use an API key if one is configured. Works fine without it in development.
  if (process.env.GOOGLE_BOOKS_API_KEY) {
    params.set('key', process.env.GOOGLE_BOOKS_API_KEY);
  }

  const response = await fetch(`${GOOGLE_BOOKS_URL}?${params}`);
  if (!response.ok) {
    // Attach the upstream status so the route can react (e.g. 429 = rate limited).
    const error = new Error(`Google Books API returned ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const items = data.items ?? []; // no matches -> items is absent
  return items.map(normalizeVolume);
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

  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(`Google Books API returned ${response.status}`);
    error.status = response.status; // 404 = bad id, 429 = rate limited, etc.
    throw error;
  }

  const volume = await response.json();
  return normalizeVolume(volume);
}
