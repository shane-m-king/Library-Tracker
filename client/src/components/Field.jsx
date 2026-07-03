import styles from './Field.module.css';

// A labelled form control: the .field wrapper, a <label> tied to the control by id,
// the control itself, and an optional hint below. Renders an <input> by default, or
// a <select> / <textarea> via `as` (pass <option>s as children for a select). One
// place now owns the field/label/input/hint styling copied across five forms.
//
// Props:
//   label     - the label text/node.
//   htmlFor   - id shared by the <label> (htmlFor) and the control (id).
//   as        - 'input' (default) | 'select' | 'textarea'.
//   optional  - marks the field optional in the label: true -> "(optional)", or a
//               string for custom wording (e.g. "(leave blank if not returned)").
//   hint      - small helper text shown under the control.
//   className - extra classes on the control.
//   children  - control contents (e.g. a select's <option>s).
//   ...control - forwarded to the control (type, value, onChange, name, required,
//                pattern, autoFocus, rows, placeholder, autoComplete, min, step, ...).
export default function Field({
  label,
  htmlFor,
  as: As = 'input',
  optional,
  hint,
  className = '',
  children,
  ...control
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
        {optional && (
          <span className={styles.optional}> {optional === true ? '(optional)' : optional}</span>
        )}
      </label>
      <As id={htmlFor} className={`${styles.input} ${className}`.trim()} {...control}>
        {children}
      </As>
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}
