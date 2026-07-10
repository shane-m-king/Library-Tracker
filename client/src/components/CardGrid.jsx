import styles from './CardGrid.module.css';

// The responsive card grid shared by the library, a friend's library, and the loans
// section. Renders a <ul> because its children are cards (LibraryItemCard / LoanCard)
// that each render an <li> - a list of items, semantically. The grid lays out as many
// ~280px columns as fit, then wraps.
//
// Callers pass an optional className to merge (none currently need to); everything
// else - the <li> children - is forwarded through.
export default function CardGrid({ className = '', children, ...rest }) {
  return (
    <ul className={`${styles.grid} ${className}`.trim()} {...rest}>
      {children}
    </ul>
  );
}
