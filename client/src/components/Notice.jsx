import styles from './Notice.module.css';

// A transient banner for the result of an action. Presentational: it renders the
// { text, tone } shape from useNotice, mapping tone to BOTH the colour (success =
// green, error = red) and the ARIA role (status = polite, alert = assertive) so an
// error is never announced as a success. Renders nothing when notice is null.
//
// Props: notice ({ text, tone } | null); onDismiss (optional) - when given, a
// dismiss button is shown that calls it.
export default function Notice({ notice, onDismiss }) {
  if (!notice) return null;
  const isError = notice.tone === 'error';
  return (
    <div
      className={`${styles.notice} ${isError ? styles.error : ''}`}
      role={isError ? 'alert' : 'status'}
    >
      <span>{notice.text}</span>
      {onDismiss && (
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
