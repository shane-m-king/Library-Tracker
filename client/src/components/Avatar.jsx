import styles from './Avatar.module.css';

// The brass-coin initials that mark a person everywhere one appears: the NavBar,
// person rows, the profile header. Sized by --avatar-size on a passed className
// (same pattern as BookCover's --cover-width). Decorative to assistive tech -
// every render site has the person's name in text beside it (or an aria-label on
// the wrapping link) - so the coin itself is aria-hidden.
//
// Props: name (display name, server-validated non-blank); className optional.

// "SK" from "Shane King", capped at two initials so long names can't overflow.
function initialsOf(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

export default function Avatar({ name, className = '' }) {
  return (
    <span className={`${styles.avatar} ${className}`.trim()} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}
