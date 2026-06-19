// Unit tests for the pure (no network, no DB) parts of the Google Books service:
// normalizeVolume, scoreBook, and rankResults. Run with `npm test` (node --test).
//
// These functions are exported specifically so they can be exercised in isolation -
// the search-quality logic is the kind of thing that's easy to break silently, so
// it's worth pinning down.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVolume, scoreBook, rankResults } from './googleBooks.js';

// A normalized-book factory for the ranking tests. Defaults are deliberately
// "empty" (no cover, no isbn, no popularity) so a test only opts into the signals it
// cares about, and an untouched book scores 0 against a non-matching query.
function makeBook(overrides = {}) {
  return {
    googleVolumeId: 'id',
    title: '',
    subtitle: null,
    authors: [],
    pageCount: null,
    averageRating: null,
    ratingsCount: null,
    isbn13: null,
    thumbnailUrl: null,
    ...overrides,
  };
}

// rankResults normalizes the query itself, so tests pass a raw query string.

test('normalizeVolume maps a full volume into our shape', () => {
  const volume = {
    id: 'abc123',
    volumeInfo: {
      title: 'The Hobbit',
      subtitle: 'There and Back Again',
      authors: ['J.R.R. Tolkien'],
      publisher: 'Houghton Mifflin',
      publishedDate: '1937',
      description: 'A hobbit goes on an adventure.',
      pageCount: 310,
      industryIdentifiers: [
        { type: 'ISBN_10', identifier: '0345339681' },
        { type: 'ISBN_13', identifier: '9780345339683' },
      ],
      categories: ['Fiction'],
      averageRating: 4.5,
      ratingsCount: 120,
      imageLinks: {
        thumbnail: 'http://books.example/img?id=1&edge=curl',
        smallThumbnail: 'http://books.example/small?id=1',
      },
    },
  };

  const book = normalizeVolume(volume);

  assert.equal(book.googleVolumeId, 'abc123');
  assert.equal(book.title, 'The Hobbit');
  assert.equal(book.subtitle, 'There and Back Again');
  assert.deepEqual(book.authors, ['J.R.R. Tolkien']);
  assert.equal(book.isbn10, '0345339681');
  assert.equal(book.isbn13, '9780345339683');
  assert.deepEqual(book.genres, ['Fiction']);
  assert.equal(book.averageRating, 4.5);
  assert.equal(book.ratingsCount, 120);
  // http -> https and the page-curl effect stripped.
  assert.equal(book.thumbnailUrl, 'https://books.example/img?id=1');
});

test('normalizeVolume hard-defaults a sparse volume', () => {
  const book = normalizeVolume({ id: 'x' });

  assert.equal(book.googleVolumeId, 'x');
  assert.equal(book.title, null);
  assert.deepEqual(book.authors, []);
  assert.deepEqual(book.genres, []);
  assert.equal(book.averageRating, null);
  assert.equal(book.ratingsCount, null);
  assert.equal(book.isbn13, null);
  assert.equal(book.thumbnailUrl, null);
});

test('scoreBook ranks an exact title above a substring ("contains") match', () => {
  const exact = scoreBook('the hobbit', ['the', 'hobbit'], makeBook({ title: 'The Hobbit' }));
  const contains = scoreBook(
    'the hobbit',
    ['the', 'hobbit'],
    makeBook({ title: 'The Hobbit: SparkNotes Literature Guide' })
  );
  assert.ok(exact > contains, `expected exact (${exact}) > contains (${contains})`);
});

test('rankResults floats the real book above a study guide', () => {
  const books = [
    makeBook({ title: 'The Hobbit (SparkNotes Literature Guide)', googleVolumeId: 'guide' }),
    makeBook({
      title: 'The Hobbit',
      googleVolumeId: 'real',
      thumbnailUrl: 'https://x/cover',
      isbn13: '9780345339683',
      ratingsCount: 500,
    }),
  ];

  const ranked = rankResults('the hobbit', books);
  assert.equal(ranked[0].googleVolumeId, 'real');
});

test('rankResults handles an author query', () => {
  const books = [
    makeBook({ title: 'Some Unrelated Title', authors: ['Nobody'], googleVolumeId: 'a' }),
    makeBook({ title: 'Another Title', authors: ['Brandon Sanderson'], googleVolumeId: 'b' }),
  ];

  const ranked = rankResults('brandon sanderson', books);
  assert.equal(ranked[0].googleVolumeId, 'b');
});

test('rankResults: a popular series entry leads its bare-stub namesake (Harry Potter case)', () => {
  // Shapes taken from the live API for the query "harry potter": the flagship novel
  // is a PREFIX match with real ratings, while the bare "Harry Potter" stub is an
  // EXACT-title match with almost none. With the small exact/prefix gap plus gated,
  // log-scaled popularity, the flagship must still lead - "the right book leads".
  const stub = makeBook({
    googleVolumeId: 'stub',
    title: 'Harry Potter',
    thumbnailUrl: 'https://x/cover',
    isbn13: '111',
    pageCount: 214,
    ratingsCount: 8,
    averageRating: 3,
  });
  const flagship = makeBook({
    googleVolumeId: 'flagship',
    title: "Harry Potter and the Sorcerer's Stone",
    thumbnailUrl: 'https://x/cover',
    isbn13: '222',
    pageCount: 312,
    ratingsCount: 308,
    averageRating: 4.5,
  });

  // Input puts the stub first, so a pass proves we actually re-ranked.
  const ranked = rankResults('harry potter', [stub, flagship]);
  assert.equal(ranked[0].googleVolumeId, 'flagship');
});

test('rankResults does not let popularity override an unrelated book (gating)', () => {
  // A wildly popular book that doesn't match the query must NOT outrank a genuine
  // (if less-rated) match - popularity is gated on text relevance.
  const popularUnrelated = makeBook({
    googleVolumeId: 'unrelated',
    title: 'A Totally Different Book',
    ratingsCount: 100000,
    averageRating: 5,
  });
  const relevant = makeBook({ googleVolumeId: 'relevant', title: 'Dune', ratingsCount: 3 });

  const ranked = rankResults('dune', [popularUnrelated, relevant]);
  assert.equal(ranked[0].googleVolumeId, 'relevant');
});

test('rankResults uses popularity only as a tiebreaker', () => {
  const books = [
    makeBook({ title: 'Dune', googleVolumeId: 'less', ratingsCount: 5 }),
    makeBook({ title: 'Dune', googleVolumeId: 'more', ratingsCount: 900 }),
  ];

  const ranked = rankResults('dune', books);
  assert.equal(ranked[0].googleVolumeId, 'more');
});

test('rankResults is stable for equal scores (keeps original order)', () => {
  // Neither title matches the query, so both score 0 -> original order must hold.
  const books = [
    makeBook({ title: 'Zeta', googleVolumeId: 'first' }),
    makeBook({ title: 'Alpha', googleVolumeId: 'second' }),
  ];

  const ranked = rankResults('nonmatching query', books);
  assert.deepEqual(
    ranked.map((b) => b.googleVolumeId),
    ['first', 'second']
  );
});

test('rankResults does not mutate its input array', () => {
  const books = [makeBook({ title: 'Beta' }), makeBook({ title: 'Alpha' })];
  const before = books.map((b) => b.title);

  rankResults('alpha', books);

  assert.deepEqual(
    books.map((b) => b.title),
    before
  );
});
