import { todayIso } from './dates.js';

// A loan is overdue when it's still out and its due date has passed. Dates are
// plain 'YYYY-MM-DD' strings, which compare correctly as strings (in the
// user's own timezone via todayIso). A returned loan is never overdue -
// however late it came back, it's back.
//
// Shared by LoanShelf (the overdue chip on the cover) and LoanDetailModal
// (the status badge), so the two can never disagree about the same loan.
export function isOverdue(loan) {
  return loan.active && loan.dueDate != null && loan.dueDate < todayIso();
}

// Order loans by the question each view asks - loans are about time, not
// titles (the covers-only shelf doesn't even show a title until clicked).
//   Current: "what's due back soonest?" - due date ascending, which floats
//   overdue to the front (and clusters their red chips on page one); loans
//   with no due date carry no urgency and sink to the end.
//   History: "what came back recently?" - return date descending.
// Ties fall back to title so equal loans keep a stable, scannable order.
// Returns a new array; the input is not touched.
export function sortLoansForView(loans, view) {
  const byTitle = (a, b) =>
    (a.book.title ?? '').localeCompare(b.book.title ?? '', undefined, { sensitivity: 'base' });

  const sorted = [...loans];
  if (view === 'current') {
    sorted.sort((a, b) => {
      if (a.dueDate !== b.dueDate) {
        if (a.dueDate == null) return 1;
        if (b.dueDate == null) return -1;
        return a.dueDate < b.dueDate ? -1 : 1; // 'YYYY-MM-DD' compares as a string
      }
      return byTitle(a, b);
    });
  } else {
    sorted.sort((a, b) => {
      // History loans always have returnedOn (that's what makes them history);
      // the ?? '' is belt-and-braces against a malformed one, not a real case.
      const aReturned = a.returnedOn ?? '';
      const bReturned = b.returnedOn ?? '';
      if (aReturned !== bReturned) return aReturned < bReturned ? 1 : -1;
      return byTitle(a, b);
    });
  }
  return sorted;
}
