import { useState, useCallback } from 'react';

// A transient page banner: a single { text, tone } notice with show/clear actions.
// tone is 'success' (default) or 'error'; the <Notice> component maps it to the
// banner's colour and ARIA role. Extracted because LibraryPage, FriendsPage and
// ProfilePage each held the same little state + helper - now they share one.
export function useNotice() {
  const [notice, setNotice] = useState(null);
  const showNotice = useCallback((text, tone = 'success') => setNotice({ text, tone }), []);
  const clearNotice = useCallback(() => setNotice(null), []);
  return { notice, showNotice, clearNotice };
}
