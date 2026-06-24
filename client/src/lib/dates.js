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
