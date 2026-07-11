import hearth from '../assets/images/Hearth_Background.png';
import styles from './HearthBackdrop.module.css';

// The room behind the shelves: the hearth photo, blurred and dimmed, fixed to
// the viewport so the wall stays put while the page scrolls. Rendered by the
// library pages only - the rest of the app keeps its flat ground.
//
// Layering lesson from the design mockups (v6): scene layers live BELOW the
// content at z-index -1 and are never touched by content-level selectors. The
// scrim is a separate layer over the photo, not baked into it, so text
// contrast is guaranteed regardless of what the photo has in any given spot.
//
// aria-hidden + empty alt: pure decoration - the page reads identically
// without it.
export default function HearthBackdrop() {
  return (
    <div className={styles.room} aria-hidden="true">
      <img src={hearth} alt="" className={styles.photo} />
      <div className={styles.scrim} />
    </div>
  );
}
