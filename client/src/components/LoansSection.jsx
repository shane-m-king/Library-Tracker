import { useState } from 'react';
import LoanCard from './LoanCard.jsx';
import styles from './LoansSection.module.css';

// The two views of the loans area. 'current' = active (not yet returned) loans, the
// default since that's "what's out right now"; 'history' = returned loans, the
// completed past. Together they cover every loan, with no overlap.
const VIEWS = [
  { key: 'current', label: 'Current' },
  { key: 'history', label: 'History' },
];

// The "loans" area below the library on LibraryPage. Presentational: it receives all
// the user's loans (plus loading/error state) and slices them - it does NOT fetch.
// LibraryPage owns the useLoans data so it can refetch this section when a library
// change clears lent-out loans, and owns the record-a-loan modal that onRecordLoan
// opens.
//
// Two axes of organisation:
//   - a Current / History toggle (active vs returned), partitioned in memory so
//     switching is instant - we already hold every loan;
//   - within the chosen view, two labelled groups: Lent out and Borrowed.
//
// Props: loans, loading, error, onRetry (re-run the fetch after a failed load),
// onRecordLoan (open the record-a-loan modal), and the per-card actions
// onMarkReturned / onEditLoan / onDeleteLoan (passed straight through to each card).
export default function LoansSection({
  loans,
  loading,
  error,
  onRetry,
  onRecordLoan,
  onMarkReturned,
  onEditLoan,
  onDeleteLoan,
}) {
  const [view, setView] = useState('current');

  // Slice by the chosen view first (active vs returned), then by direction. Computed
  // unconditionally - harmless on an empty list - so the render branches stay simple.
  const visible = loans.filter((loan) => (view === 'current' ? loan.active : !loan.active));
  const lentOut = visible.filter((loan) => loan.direction === 'lent_out');
  const borrowed = visible.filter((loan) => loan.direction === 'borrowed');

  return (
    <section className={styles.section} aria-label="Borrowed and lent-out books">
      {/* The big loading/error states only show on the initial load (nothing here
          yet). Past that, the header - with the Record button - is always present,
          including when there are no loans, since that's when you most want it. */}
      {loading && loans.length === 0 ? (
        <p className={styles.state}>Loading your loans…</p>
      ) : error && loans.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.error}>{error}</p>
          <button type="button" className={styles.retry} onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Loans</h2>
            <div className={styles.headerActions}>
              {/* The view toggle is only meaningful once there are loans to slice. */}
              {loans.length > 0 && (
                <div
                  className={styles.viewToggle}
                  role="group"
                  aria-label="Show current loans or history"
                >
                  {VIEWS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      className={`${styles.viewButton} ${view === key ? styles.viewButtonActive : ''}`}
                      aria-pressed={view === key}
                      onClick={() => setView(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className={styles.recordButton} onClick={onRecordLoan}>
                Record a loan
              </button>
            </div>
          </div>

          {loans.length === 0 ? (
            <p className={styles.state}>You haven’t lent out or borrowed any books yet.</p>
          ) : visible.length === 0 ? (
            // There ARE loans, just none in this view (e.g. History with nothing
            // returned yet). A single line reads better than two empty groups.
            <p className={styles.empty}>
              {view === 'current' ? 'Nothing out on loan right now.' : 'No returned loans yet.'}
            </p>
          ) : (
            <>
              <LoanGroup
                title="Lent out"
                loans={lentOut}
                emptyText="Nothing here."
                onMarkReturned={onMarkReturned}
                onEdit={onEditLoan}
                onDelete={onDeleteLoan}
              />
              <LoanGroup
                title="Borrowed"
                loans={borrowed}
                emptyText="Nothing here."
                onMarkReturned={onMarkReturned}
                onEdit={onEditLoan}
                onDelete={onDeleteLoan}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}

// One labelled group of loans (or a muted note when this direction is empty but the
// other isn't - so both headings stay present for a stable, predictable layout).
function LoanGroup({ title, loans, emptyText, onMarkReturned, onEdit, onDelete }) {
  return (
    <div className={styles.group}>
      <h3 className={styles.heading}>{title}</h3>
      {loans.length === 0 ? (
        <p className={styles.empty}>{emptyText}</p>
      ) : (
        <ul className={styles.grid}>
          {loans.map((loan) => (
            <LoanCard
              key={loan.id}
              loan={loan}
              onMarkReturned={onMarkReturned}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
