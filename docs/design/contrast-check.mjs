// WCAG 2.1 contrast check for the fireside token pairs, including translucent
// tints composited over the surface they actually sit on.
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const composite = (rgba, base) => rgba.slice(0, 3).map((c, i) => Math.round(c * rgba[3] + base[i] * (1 - rgba[3])));
const lum = (rgb) => {
  const [r, g, b] = rgb.map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const BG = hex('#332614'), SURFACE = hex('#241a10'), SUNKEN = hex('#1b1209');
const checks = [
  // [label, fg, bg, required]
  ['text on bg', hex('#efe3d0'), BG, 4.5],
  ['text on surface', hex('#efe3d0'), SURFACE, 4.5],
  ['muted on bg (captions 12px)', hex('#b9a488'), BG, 4.5],
  ['muted on surface', hex('#b9a488'), SURFACE, 4.5],
  ['text on sunken (inputs)', hex('#efe3d0'), SUNKEN, 4.5],
  ['on-accent on accent (buttons)', hex('#1a120b'), hex('#e8863b'), 4.5],
  ['on-accent on danger (buttons)', hex('#1a120b'), hex('#e97867'), 4.5],
  ['danger text on bg', hex('#e97867'), BG, 4.5],
  ['danger text on surface', hex('#e97867'), SURFACE, 4.5],
  ['danger on danger-surface@surface', hex('#e97867'), composite([233, 120, 103, 0.14], SURFACE), 4.5],
  ['accent on bg (UI/links, 3:1)', hex('#e8863b'), BG, 3],
  ['brass on bg (decor/404, 3:1)', hex('#c9a35a'), BG, 3],
  ['success text on tint@surface', hex('#a7d3ac'), composite([74, 122, 79, 0.25], SURFACE), 4.5],
  ['warning text on tint@surface', hex('#f0b27c'), composite([232, 134, 59, 0.18], SURFACE), 4.5],
  ['info text on tint@surface', hex('#aac4ea'), composite([93, 128, 180, 0.24], SURFACE), 4.5],
  ['neutral text on tint@surface', hex('#d4c3a8'), composite([201, 163, 90, 0.16], SURFACE), 4.5],
  ['wish marker: info text on tint@surface', hex('#aac4ea'), composite([93, 128, 180, 0.24], SURFACE), 4.5],
  ['focus ring: accent on bg (3:1)', hex('#e8863b'), BG, 3],
  ['focus ring: accent on surface (3:1)', hex('#e8863b'), SURFACE, 3],
];

// ---- The hearth-photo backdrop (library pages) ----
// The backdrop is FIXED while content scrolls, so any text can pass over the
// photo's brightest pixel (the fire core, rgb(255,255,220) - found by scanning
// the PNG) at the scrim's THINNEST stop. Pipeline under text there:
// photo * brightness(0.55), then the scrim's warm black at its lowest alpha
// (0.45), then any local panel. Keep these constants in sync with
// HearthBackdrop.module.css and the .state/.pageStatus/.empty panels.
const FIRE_CORE = [255, 255, 220].map((c) => c * 0.55); // after brightness()
const SCRIM_MIN = composite([20, 12, 6, 0.45], FIRE_CORE);
const PANEL = composite([20, 12, 6, 0.7], SCRIM_MIN);
checks.push(
  ['photo worst case: text on scrim-min (scrolling content)', hex('#efe3d0'), SCRIM_MIN, 4.5],
  ['photo worst case: large text 3:1 on scrim-min (h2s)', hex('#efe3d0'), SCRIM_MIN, 3],
  ['photo worst case: muted on local panel (.state/.pageStatus/.empty)', hex('#b9a488'), PANEL, 4.5],
  ['photo worst case: danger on local panel (.state errors)', hex('#e97867'), PANEL, 4.5]
);

for (const [label, fg, bg, req] of checks) {
  const r = ratio(fg, bg);
  console.log(`${r >= req ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)} (need ${req})  ${label}`);
}
