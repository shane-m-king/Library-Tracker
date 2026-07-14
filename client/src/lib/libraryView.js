// How a library shelf is VIEWED: the status filter tabs, the sort orders, and
// the text search. Shared by LibraryPage (the owner's shelf) and
// UserLibraryPage (a friend's) so the two can't drift.
//
// Only the status filter touches the server (it's a query param on the list
// fetch); sort and search run client-side over the fetched list - the client
// already holds the whole library to page the bookcase, so re-ordering and
// filtering it costs nothing and responds instantly.

// 'all' is the UI's "no filter" (translated to an omitted ?status= for the API).
export const LIBRARY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'owned', label: 'Owned' },
  { key: 'wishlist', label: 'Wishlist' },
];

// Sort orders for the shelf. 'recent' (the default) is the order the server
// already sends - newest first - so it means "don't re-sort".
export const LIBRARY_SORTS = [
  { key: 'recent', label: 'Recently added' },
  { key: 'title', label: 'Title A–Z' },
  { key: 'author', label: 'Author A–Z' },
];

// Case-insensitive, accent-insensitive compare ('base': a = A = á), so
// shelving order matches how a person alphabetizes, not char codes.
function collate(a, b) {
  return (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base' });
}

// Returns the items in the chosen order - a copy when it re-sorts, the input
// itself for 'recent' (already the server's order). Author sort uses the
// first-listed author (the primary one), pushes author-less books to the end
// rather than letting '' alphabetize first, and tie-breaks on title so one
// author's books shelve alphabetically.
export function sortLibraryItems(items, sort) {
  if (sort === 'title') {
    return [...items].sort((a, b) => collate(a.book.title, b.book.title));
  }
  if (sort === 'author') {
    return [...items].sort((a, b) => {
      const aAuthor = a.book.authors?.[0];
      const bAuthor = b.book.authors?.[0];
      if (aAuthor == null && bAuthor != null) return 1;
      if (aAuthor != null && bAuthor == null) return -1;
      return collate(aAuthor, bAuthor) || collate(a.book.title, b.book.title);
    });
  }
  return items;
}

// Case-insensitive substring match on the title and every author. A blank
// query matches everything, so callers can filter unconditionally.
export function matchesLibrarySearch(item, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.book.title, ...(item.book.authors ?? [])].some((text) =>
    text?.toLowerCase().includes(q)
  );
}
