import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

// A reusable, accessible modal dialog. It's deliberately generic - it knows nothing
// about books or libraries - so the same component serves the "add a book" flow and
// (next) the destructive-action confirmations in Step 5c.
//
// Accessibility is the whole point of having a shared primitive rather than a bare
// <div> overlay. It handles, in one place:
//   - role="dialog" + aria-modal + a label tied to the title, so assistive tech
//     announces it as a dialog and knows its name.
//   - A focus trap: Tab / Shift+Tab cycle within the dialog instead of leaking to
//     the now-inert page behind it.
//   - Focus return: focus goes back to whatever was focused (the trigger button) on
//     close, so keyboard users aren't dumped at the top of the page.
//   - Escape to close, and a backdrop click to close.
//   - Background scroll lock while open.
//
// Rendered through a portal into <body> so it sits above everything regardless of
// where it's mounted in the tree (no parent overflow/z-index can clip it).
//
// Props: isOpen, onClose (called for Escape / backdrop / close button), title
// (string, shown as the heading and used as the aria label), children (the body),
// returnFocusRef (optional) - a ref to focus on close INSTEAD of the trigger. Pass it
// when the trigger is about to be removed while the modal is open (e.g. a delete
// confirm whose "Remove" button lives on the row being deleted): returning focus to a
// doomed element drops it to <body>, so the caller points here at a stable landmark
// (its page heading) instead.

// What counts as focusable for the trap and the initial focus.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

export default function Modal({ isOpen, onClose, title, children, returnFocusRef }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Remember what was focused so we can hand focus back when we close.
    const previouslyFocused = document.activeElement;
    // Capture the explicit return target (the caller's stable landmark) up front. It
    // doesn't change while the modal is open, so reading it here - rather than off the
    // ref inside the cleanup - is equivalent and keeps the cleanup off a live ref.
    const explicitReturn = returnFocusRef?.current ?? null;
    const dialog = dialogRef.current;

    // Move focus into the dialog - unless the content already auto-focused something
    // (e.g. the search input's autoFocus, which runs during commit, before this
    // effect). If focus is already inside, respect it; otherwise focus the first
    // focusable, or the dialog itself (it has tabIndex=-1) if it has none yet.
    if (!dialog.contains(document.activeElement)) {
      const focusables = dialog.querySelectorAll(FOCUSABLE);
      (focusables[0] ?? dialog).focus();
    }

    // Lock background scroll, remembering the prior value to restore it exactly.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevOverflow;
      // Prefer an explicit return target when the caller gave one - it's a stable
      // element chosen precisely because the trigger is about to disappear (a delete
      // removing the row it lived on). Otherwise return to the trigger, but only if
      // it's still in the document, so we never focus a detached node (-> <body>).
      if (explicitReturn instanceof HTMLElement && explicitReturn.isConnected) {
        explicitReturn.focus();
      } else if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen, returnFocusRef]);

  if (!isOpen) return null;

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    // Focus trap: keep Tab within the dialog by wrapping at the ends.
    const focusables = dialogRef.current.querySelectorAll(FOCUSABLE);
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // Close only when the backdrop itself is clicked, not when a click bubbles up from
  // the dialog content (currentTarget === target means the backdrop was the target).
  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) onClose();
  }

  return createPortal(
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.header}>
          <h2 id="modal-title" className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
