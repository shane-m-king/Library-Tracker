import { useState, useEffect } from 'react';

// Returns a debounced copy of `value` that only updates once `value` has stopped
// changing for `delay` ms. Typical use: debounce a search input so we react to a
// pause in typing rather than to every keystroke.
//
// How it works: each change schedules a timer to publish the new value; if another
// change arrives first, the cleanup clears that pending timer and a fresh one is
// scheduled. So the value is only committed after a quiet gap of `delay` ms.
//
// It's intentionally generic (any value, any delay) - no knowledge of search or the
// API - so it can be reused anywhere a debounce is handy.
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
