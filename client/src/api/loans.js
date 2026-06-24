// Loan API calls: thin, named wrappers over apiFetch, mirroring api/library.js.
// Components and hooks call `listLoans(...)` instead of knowing URLs or query-string
// formatting. Each resolves to the server's envelope as-is ({ items }) and throws
// ApiError on failure (see apiFetch).
//
import { apiFetch } from './apiFetch.js';

// GET /api/loans -> { items }. Lists the logged-in user's loans, newest first. Both
// filters are optional:
//   direction - 'lent_out' | 'borrowed' to filter, or omitted for both
//   active    - true (not yet returned) | false (returned), or omitted for either
// We only append a param when it's actually set, so the default call stays a clean
// GET /api/loans. Note `active` is a BOOLEAN: we test `!= null` (not truthiness) so
// that `active: false` (show returned) is still sent rather than dropped.
export function listLoans({ direction, active } = {}) {
  const params = new URLSearchParams();
  if (direction) params.set('direction', direction);
  if (active != null) params.set('active', String(active));
  const queryString = params.toString();
  return apiFetch(queryString ? `/loans?${queryString}` : '/loans');
}

// POST /api/loans -> { item }. Records a loan. The client sends only the
// googleVolumeId (the server is the source of truth for catalog data and caches the
// book itself on a borrow). `direction` is 'lent_out' | 'borrowed'. counterpartyName
// is required; loanedOn defaults to today server-side if omitted; dueDate and notes
// are optional. Undefined fields are dropped by JSON.stringify, so we just leave the
// optional ones out. Throws ApiError: 422 if you try to lend a book you don't own,
// 409 if every owned copy is already lent out.
export function createLoan({ googleVolumeId, direction, counterpartyName, loanedOn, dueDate, notes }) {
  return apiFetch('/loans', {
    method: 'POST',
    body: { googleVolumeId, direction, counterpartyName, loanedOn, dueDate, notes },
  });
}

// PATCH /api/loans/:id -> { item }. Partial update: `changes` holds only the fields
// that actually changed (counterpartyName, dueDate, returnedOn, notes). Marking a
// loan returned is just `{ returnedOn: '<date>' }`; clearing it (returnedOn: null)
// reopens the loan. direction and the book aren't editable - changing those would
// make it a different loan.
export function updateLoan(id, changes) {
  return apiFetch(`/loans/${id}`, { method: 'PATCH', body: changes });
}

// DELETE /api/loans/:id -> { ok: true }. Removes the loan record. loans is a leaf
// table, so there's nothing to cascade.
export function deleteLoan(id) {
  return apiFetch(`/loans/${id}`, { method: 'DELETE' });
}
