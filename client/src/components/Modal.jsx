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
// (string, shown as the heading and used as the aria label), children (the body).

// What counts as focusable for the trap and the initial focus.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

export default function Modal({ isOpen, onClose, title, children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Remember what was focused so we can hand focus back when we close.
    const previouslyFocused = document.activeElement;
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
      // Only restore focus if the trigger is still in the document.
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [isOpen]);

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
