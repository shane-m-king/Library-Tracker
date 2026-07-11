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
