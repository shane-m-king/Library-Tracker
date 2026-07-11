import styles from './Badge.module.css';

// The status pill used wherever a record states what it IS: owned/wishlist on a
// book, lent/borrowed/active/returned/overdue on a loan. Tones map straight onto
// the semantic status tokens, so callers say what a state MEANS, not what colour
// it is:
//   neutral - settled/at rest (owned, returned)   info    - dusk blue (wishlist, borrowed)
//   success - healthy/active                       warning - needs an eye (lent out)
//   danger  - wrong (overdue)
//
// Props: tone (one of the above, default neutral); children - the label.
export default function Badge({ tone = 'neutral', children }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
