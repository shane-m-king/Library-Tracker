import styles from './Button.module.css';

// The button primitive. Renders a real <button> by default, or any element/component
// via `as` - e.g. `as={Link} to="/x"` for a router link styled as a button. One place
// now owns the accent/outline/danger looks, the size scale, hover, and disabled state
// that were copied across ~15 stylesheets.
//
// Props:
//   variant - 'primary' (accent solid, default) | 'secondary' (neutral outline) |
//             'danger' (solid) | 'dangerOutline' (outline, danger text) |
//             'link' (inline text link; ignores size).
//   size    - 'xs' | 'sm' | 'md' (default) | 'lg'.
//   as      - element/component to render (default 'button').
//   className - extra classes appended after the variant/size (e.g. layout from a parent).
//   ...rest - forwarded (onClick, disabled, type, to, aria-*, children, ...).
//
// A real <button> defaults to type="button" so it never submits a form by accident;
// pass type="submit" explicitly where you want that.
export default function Button({
  as: As = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}) {
  const classes = [
    styles.button,
    styles[variant],
    variant !== 'link' && styles[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const typeProp = As === 'button' && rest.type === undefined ? { type: 'button' } : {};

  return <As className={classes} {...typeProp} {...rest} />;
}
