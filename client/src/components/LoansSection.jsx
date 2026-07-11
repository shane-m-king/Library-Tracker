import LoanShelf from './LoanShelf.jsx';
import Button from './Button.jsx';
import ToggleGroup from './ToggleGroup.jsx';
import styles from './LoansSection.module.css';

// The two views of the loans area. 'current' = active (not yet returned) loans, the
// default since that's "what's out right now"; 'history' = returned loans, the
// completed past. Together they cover every loan, with no overlap.
const VIEWS = [
  { key: 'current', label: 'Current' },
  { key: 'history', label: 'History' },
];

// The "loans" area below the library on LibraryPage: two thin covers-only
// shelves (Lent out / Borrowed) side by side, so the collection stays the
// star of the page. Everything about a loan - who has it, dates, actions -
// moved into LoanDetailModal, opened by clicking a cover (the same pattern
// as the collection's shelf).
//
// Presentational: it receives all the user's loans (plus loading/error state)
// and slices them - it does NOT fetch. LibraryPage owns the useLoans data so
// it can refetch this section when a library change clears lent-out loans,
// and owns the record-a-loan modal that onRecordLoan opens.
//
// Two axes of organisation:
//   - a Current / History toggle (active vs returned), partitioned in memory so
//     switching is instant - we already hold every loan;
//   - within the chosen view, two labelled shelves: Lent out and Borrowed.
//
// The current/history toggle is CONTROLLED by the parent (`view` + `onViewChange`)
// rather than held locally, so a mutation on LibraryPage that produces a now-active
// loan (recording one, or un-returning one) can snap the view back to Current -
// otherwise the result would land in a view the user isn't looking at and seem to
// vanish.
//
// Props: loans, loading, error, view ('current' | 'history'), onViewChange(view),
// onRetry (re-run the fetch after a failed load), onRecordLoan (open the
// record-a-loan modal), onOpenLoan(loan) (open the loan detail modal).
export default function LoansSection({
  loans,
  loading,
  error,
  view,
  onViewChange,
  onRetry,
  onRecordLoan,
  onOpenLoan,
}) {
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
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Loans</h2>
            <div className={styles.headerActions}>
              {/* The view toggle is only meaningful once there are loans to slice. */}
              {loans.length > 0 && (
                <ToggleGroup
                  options={VIEWS}
                  value={view}
                  onChange={onViewChange}
                  ariaLabel="Show current loans or history"
                />
              )}
              <Button variant="primary" onClick={onRecordLoan}>
                Record a loan
              </Button>
            </div>
          </div>

          {/* The shelves render whether or not anything is on them - an empty
              board IS the empty state (the shelves announce emptiness to
              screen readers internally), so the layout never jumps between
              "has loans" and "doesn't".

              key={view}: switching Current/History remounts the shelves so
              their internal paging resets - page 2 of Current means nothing
              in History (same pattern as the bookcase's key={filter}). */}
          <div className={styles.groups}>
            <LoanGroup key={`lent-${view}`} title="Lent out" loans={lentOut} onOpen={onOpenLoan} />
            <LoanGroup
              key={`borrowed-${view}`}
              title="Borrowed"
              loans={borrowed}
              onOpen={onOpenLoan}
            />
          </div>
        </>
      )}
    </section>
  );
}

// One labelled shelf of loans; an empty direction shows its bare board.
function LoanGroup({ title, loans, onOpen }) {
  return (
    <div className={styles.group}>
      <h3 className={styles.heading}>{title}</h3>
      <LoanShelf loans={loans} onOpen={onOpen} />
    </div>
  );
}
