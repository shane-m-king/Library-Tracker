// How we expose a user over the API. There are two distinct shapes, and which one
// you get depends on WHO is looking - this is the heart of the social layer's
// privacy model, so it lives in one place that every user-returning endpoint uses.
//
//   toUser       - the SELF view: what you may see about your OWN account. Includes
//                  email (yours, and private to you) but never the password hash.
//   toPublicUser - the PUBLIC view: what ANY other logged-in user may see about
//                  you. Just identity + handle. Never email, never the hash.
//
// Both are camelCase to match the rest of the API (library/loans). Keeping the
// projections explicit means a column added to `users` later (say, a private
// phone number) is NOT leaked to other users by default - we'd have to opt it in.

export function toUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    username: row.username,
    libraryVisibility: row.library_visibility,
    createdAt: row.created_at,
  };
}

export function toPublicUser(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    username: row.username,
  };
}
