import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import { getErrorMessage } from '../api/apiFetch.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import Button from '../components/Button.jsx';
import Field from '../components/Field.jsx';
import Notice from '../components/Notice.jsx';
import { useNotice } from '../hooks/useNotice.js';
import styles from './ProfilePage.module.css';

// Your own account: view your email (read-only here - changing it needs its own
// flow) and edit the three fields the profile PATCH allows - display name, username,
// and who can see your library. Below that, a separated "danger zone" to delete the
// account. Profile mutations go through the auth context so `user` stays the single
// source of truth (the form re-seeds from the server's canonical response on save).

// The visibility choices, as data so the <select> and the explanatory hint render
// from one source. The hint for the chosen value is shown under the control.
const VISIBILITIES = [
  { value: 'public', label: 'Public', hint: 'Anyone with an account can see your library.' },
  {
    value: 'friends',
    label: 'Friends only',
    hint: 'Only people you’ve accepted as friends can see your library.',
  },
  { value: 'private', label: 'Private', hint: 'Only you can see your library.' },
];

export default function ProfilePage() {
  const { user, updateProfile, deleteAccount } = useAuth();
  const navigate = useNavigate();

  // Seeded from the current user; the profile fields are all required server-side,
  // so there are no null-to-'' conversions to do (unlike the library/loan forms).
  const [form, setForm] = useState({
    displayName: user.displayName,
    username: user.username,
    libraryVisibility: user.libraryVisibility,
  });
  const [submitting, setSubmitting] = useState(false);
  const { notice, showNotice, clearNotice } = useNotice();

  // Account-deletion modal state, mirroring the library/loan remove confirmations.
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (notice) clearNotice();
  }

  // PATCH diff: send only the fields that actually changed from the current user.
  // None are nullable, so each is a trimmed (for text) or selected value.
  function buildChanges() {
    const changes = {};
    const displayName = form.displayName.trim();
    if (displayName !== user.displayName) changes.displayName = displayName;
    const username = form.username.trim();
    if (username !== user.username) changes.username = username;
    if (form.libraryVisibility !== user.libraryVisibility) {
      changes.libraryVisibility = form.libraryVisibility;
    }
    return changes;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    // Mirror the server's rules client-side for a fast, friendly check; the server
    // remains the real authority (and the source of the uniqueness check).
    if (form.displayName.trim() === '') {
      showNotice('Display name can’t be empty.', 'error');
      return;
    }
    if (!/^[A-Za-z0-9_]{3,30}$/.test(form.username.trim())) {
      showNotice('Username must be 3–30 characters: letters, numbers, or underscores.', 'error');
      return;
    }

    const changes = buildChanges();
    if (Object.keys(changes).length === 0) {
      showNotice('No changes to save.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const saved = await updateProfile(changes);
      // Re-seed the form from the server's canonical user (it may have trimmed or
      // otherwise normalised what we sent), so the diff baseline matches exactly.
      setForm({
        displayName: saved.displayName,
        username: saved.username,
        libraryVisibility: saved.libraryVisibility,
      });
      showNotice('Profile updated.');
    } catch (err) {
      // The server's messages here are user-facing (e.g. "that username is already
      // taken"), so surface them directly.
      showNotice(getErrorMessage(err, 'Could not save your profile.'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      // The session is over and `user` is now null; land on the public home page
      // rather than letting the protected route bounce us to login.
      navigate('/', { replace: true });
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Could not delete your account.'));
      setDeleting(false);
    }
  }

  const chosenVisibility = VISIBILITIES.find((v) => v.value === form.libraryVisibility);

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Your profile</h1>
        <Link to="/" className={styles.backLink}>
          Back home
        </Link>
      </div>

      <Notice notice={notice} onDismiss={clearNotice} />

      <form className={styles.form} onSubmit={handleSubmit}>
        {/* Email is shown for reference but isn't editable here. */}
        <div className={styles.field}>
          <span className={styles.label}>Email</span>
          <p className={styles.readonly}>{user.email}</p>
          <span className={styles.hint}>Email can’t be changed here.</span>
        </div>

        <Field
          label="Display name"
          htmlFor="profile-displayName"
          name="displayName"
          type="text"
          value={form.displayName}
          onChange={handleChange}
          autoComplete="name"
        />

        <Field
          label="Username"
          htmlFor="profile-username"
          name="username"
          type="text"
          value={form.username}
          onChange={handleChange}
          autoComplete="username"
          pattern="[A-Za-z0-9_]{3,30}"
          title="3 to 30 characters: letters, numbers, or underscores"
          hint="3–30 characters: letters, numbers, or underscores."
        />

        <Field
          label="Library visibility"
          htmlFor="profile-visibility"
          as="select"
          name="libraryVisibility"
          value={form.libraryVisibility}
          onChange={handleChange}
          hint={chosenVisibility?.hint}
        >
          {VISIBILITIES.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </Field>

        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>

      {/* Danger zone: account deletion, set apart so it can't be hit casually. */}
      <section className={styles.danger} aria-label="Delete account">
        <h2 className={styles.dangerTitle}>Delete account</h2>
        <p className={styles.dangerText}>
          Permanently delete your account and everything in it — your library, loans, and
          friendships. This can’t be undone.
        </p>
        <Button
          variant="danger"
          onClick={() => {
            setDeleteError(null);
            setIsDeleteOpen(true);
          }}
        >
          Delete my account
        </Button>
      </section>

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title="Delete account"
        onConfirm={handleConfirmDelete}
        confirmLabel="Delete account"
        busyLabel="Deleting…"
        busy={deleting}
        error={deleteError}
      >
        <p>
          Permanently delete your account, <strong>@{user.username}</strong>? Your library,
          loans, and friendships will all be removed. This can’t be undone.
        </p>
      </ConfirmDialog>
    </main>
  );
}
