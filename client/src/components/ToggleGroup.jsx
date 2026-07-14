import styles from './ToggleGroup.module.css';

// A single-select segmented pill control. One place now owns the look + the
// role="group" / aria-pressed semantics that were built inline for the library
// filter, the loans current/history view, and the loan direction.
//
// Props:
//   options   - [{ key, label }] to render as pills.
//   value     - the selected key.
//   onChange  - called with the chosen key.
//   ariaLabel - labels the group for assistive tech.
//   size      - 'md' (default) | 'sm', mirroring Button's size API.
//   className - extra classes on the group container (e.g. layout margin from a page).
export default function ToggleGroup({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  className = '',
}) {
  return (
    <div className={`${styles.group} ${className}`.trim()} role="group" aria-label={ariaLabel}>
      {options.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className={[styles.button, styles[size], value === key && styles.active]
            .filter(Boolean)
            .join(' ')}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
