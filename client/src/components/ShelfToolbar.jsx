import ToggleGroup from './ToggleGroup.jsx';
import { LIBRARY_FILTERS, LIBRARY_SORTS } from '../lib/libraryView.js';
import styles from './ShelfToolbar.module.css';

// The row of shelf controls between a library page's heading and its bookcase:
// the status filter tabs, a search box, and a sort order. Shared by
// LibraryPage and UserLibraryPage so the owner's shelf and a friend's are
// driven identically.
//
// Fully controlled - the page owns all three values. The filter drives the
// page's refetch (it's a server-side query param); query and sort are
// client-side over the already-fetched list. `query` is the RAW input value:
// the toolbar echoes every keystroke and the PAGE debounces before filtering,
// so typing feels instant while the shelf only re-shuffles on a pause.
//
// Props: filter/onFilterChange, query/onQueryChange, sort/onSortChange.
export default function ShelfToolbar({
  filter,
  onFilterChange,
  query,
  onQueryChange,
  sort,
  onSortChange,
}) {
  return (
    <div className={styles.toolbar}>
      <ToggleGroup
        options={LIBRARY_FILTERS}
        value={filter}
        onChange={onFilterChange}
        ariaLabel="Filter library by status"
      />
      <div className={styles.tools}>
        {/* type="search" gets the browser's built-in clear (×) affordance. */}
        <input
          type="search"
          className={styles.search}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search title or author…"
          aria-label="Search this library by title or author"
        />
        <label className={styles.sortField}>
          Sort
          <select
            className={styles.sort}
            value={sort}
            onChange={(event) => onSortChange(event.target.value)}
          >
            {LIBRARY_SORTS.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
