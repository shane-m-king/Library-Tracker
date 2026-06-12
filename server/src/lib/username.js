// Shared username (handle) validation, used by registration and profile updates
// so the rules can't drift between them. A handle is 3-30 characters of letters,
// digits, or underscores - no spaces or punctuation, so it's safe to display raw
// and to drop into a URL later. Case-insensitive UNIQUEness is enforced by the
// DB's CITEXT column, not here. Surrounding whitespace is trimmed before checking.

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

// Returns { ok: true, value } with the trimmed handle, or { ok: false, error }
// carrying a client-facing message.
export function normalizeUsername(value) {
  if (typeof value !== 'string') {
    return { ok: false, error: 'username must be a string' };
  }
  const trimmed = value.trim();
  if (!USERNAME_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error: 'username must be 3-30 characters: letters, numbers, or underscores',
    };
  }
  return { ok: true, value: trimmed };
}
