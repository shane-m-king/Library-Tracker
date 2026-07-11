import Avatar from './Avatar.jsx';
import styles from './PersonRow.module.css';

// One person in a list: their avatar, display name and @handle on the left, an
// actions slot (children) on the right. Shared by user-search results, the friends
// list, and pending requests so every person row reads and aligns the same.
// Presentational only - it knows nothing about what the actions are.
//
// Props: user ({ displayName, username }); children - the action(s) for this row.
export default function PersonRow({ user, children }) {
  return (
    <li className={styles.row}>
      <Avatar name={user.displayName} />
      <div className={styles.info}>
        <p className={styles.name}>{user.displayName}</p>
        <p className={styles.handle}>@{user.username}</p>
      </div>
      {children && <div className={styles.actions}>{children}</div>}
    </li>
  );
}
