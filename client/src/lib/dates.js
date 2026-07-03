// Small date helpers for the client. Dates in this app are plain 'YYYY-MM-DD'
// calendar strings (the API casts its DATE columns to text precisely to avoid
// timezone shifts), so we stay in that format on the client too.

// Today's date as a 'YYYY-MM-DD' string in the user's LOCAL timezone.
//
// The tempting one-liner `new Date().toISOString().slice(0, 10)` is a trap:
// toISOString() is UTC, so for anyone west of UTC an evening "today" rolls over to
// tomorrow (8pm on the 23rd in New York is already the 24th in UTC). We shift the
// timestamp by the local offset first, so the UTC slice yields the LOCAL calendar
// day - matching the user's own clock and what an <input type="date"> shows them.
export function todayIso() {
  const now = new Date();
  const localMs = now.getTime() - now.getTimezoneOffset() * 60000;
  return new Date(localMs).toISOString().slice(0, 10);
}

// Format a plain 'YYYY-MM-DD' string for display, e.g. "Jun 27, 2026". This is for
// DISPLAY ONLY - comparisons (like the overdue check) stay on the raw string, which
// sorts correctly and needs no parsing.
//
// We split the parts and build a LOCAL date via new Date(y, m-1, d) rather than
// new Date('2026-06-27'), which JS parses as UTC midnight and would render as the
// day before for anyone west of UTC (the same timezone trap todayIso avoids).
// Returns '' for a null/blank value and the original string if it isn't a plain
// date, so callers can drop the result straight into JSX without guarding.
export function formatDate(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
