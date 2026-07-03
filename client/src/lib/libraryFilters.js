// The owned / wishlist / all status filter shown above a library grid - the user's
// own on LibraryPage and a friend's on UserLibraryPage. 'all' is the UI's "no
// filter" (translated to an omitted ?status= for the API). Shared so the two pages
// can't drift.
export const LIBRARY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'owned', label: 'Owned' },
  { key: 'wishlist', label: 'Wishlist' },
];
