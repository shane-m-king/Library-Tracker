import { useSyncExternalStore } from 'react';

// True while the given media query matches, re-rendering when it changes.
// CSS media queries can restyle a layout, but they can't change what React
// RENDERS - the Bookshelf needs to know how many books fit a shelf, not just
// how wide a column is. useSyncExternalStore is React's primitive for exactly
// this: subscribing a component to state that lives outside React (here, the
// browser's matchMedia) without effect/state juggling.
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches
  );
}
