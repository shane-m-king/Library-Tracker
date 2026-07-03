import Modal from './Modal.jsx';
import Button from './Button.jsx';
import styles from './ConfirmDialog.module.css';

// A confirmation modal for a destructive action, built on the generic Modal: a
// message (children), a Cancel button and a danger-styled Confirm button, an inline
// error slot, and a busy state that disables both buttons and swaps the confirm
// label. Extracted because the remove-book, remove-loan and delete-account modals
// were the same shape three times.
//
// Props:
//   isOpen, onClose - forwarded to Modal (Cancel/Escape/backdrop all call onClose)
//   title           - dialog heading
//   onConfirm       - runs the destructive action
//   confirmLabel    - confirm button text (default 'Remove')
//   busyLabel       - confirm text while the action runs (default 'Removing…')
//   busy            - disables both buttons and shows busyLabel
//   error           - optional inline error message (announced via role="alert")
//   returnFocusRef  - forwarded to Modal (focus target on close; see Modal)
//   children        - the confirmation message body
//
// Note the caller guards children that read a nullable target (e.g. a row being
// deleted) with `{target && <p>…</p>}`, since children are evaluated before Modal
// decides whether to render.
export default function ConfirmDialog({
  isOpen,
  onClose,
  title,
  onConfirm,
  confirmLabel = 'Remove',
  busyLabel = 'Removing…',
  busy = false,
  error,
  returnFocusRef,
  children,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} returnFocusRef={returnFocusRef}>
      <div className={styles.confirm}>
        {children}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
