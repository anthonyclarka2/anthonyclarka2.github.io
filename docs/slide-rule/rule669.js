/**
 * The K&E 669 as an instrument: its two faces, its rows, and what is printed on
 * each.
 *
 * The photographs show a two-sided rule, so this is not one scale list but two
 * complementary ones. The geometry of every ordinary scale still reduces to the
 * single logarithmic stock, which is why `posOf` in geometry.js is enough; what
 * lives here is the physical arrangement -- which face you are looking at, which
 * scales move with the slide, and in what order they are printed top to bottom.
 *
 * Rows are marked `slide: true` when they travel with the moving rule. A row
 * marked `unverified` is one whose graduations could not be recovered from a
 * photograph; it is drawn with its name so the layout is honest about what is
 * printed, but its ticks are not invented.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlideRule669 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* Row metrics. The photographs are about ten rows to the height of the rule,
     with the cursor glass straddling roughly the middle third. These are the
     proportions that fall out of that, not measurements off a ruler. */
  const ROW_H = 26;
  const TOP_PAD = 30;

  /**
   * Front face, top to bottom.
   *
   * `kind` names the graduation rule understood by geometry.js. `log` is the
   * ordinary scale; `cube` and `square` are the power scales; `projected` is a
   * trig scale read against its partner.
   */
  const FRONT = [
    { name: 'LL01', label: 'LL01', kind: 'log', red: true, unverified: true },
    { name: 'L', label: 'L', kind: 'log' },
    { name: 'K', label: 'K', kind: 'cube' },
    { name: 'A', label: 'A', kind: 'square' },
    { name: 'CF', label: 'CF', kind: 'cube' },
    { name: 'CIF', label: 'CIF', kind: 'cube', red: true },
    { name: 'CI', label: 'CI', kind: 'reciprocal', red: true },
    { name: 'C', label: 'C', kind: 'log' },
    { name: 'D', label: 'D', kind: 'log' },
    { name: 'DI', label: 'DI', kind: 'reciprocal', red: true },
    { name: 'LL1', label: 'LL1', kind: 'log', unverified: true },
  ];

  /**
   * Back face. The trig rows appear here and nowhere else, which is why the
   * app switches faces to do trigonometry at all.
   */
  const BACK = [
    { name: 'LL02', label: 'LL02', kind: 'log', red: true, unverified: true },
    { name: 'LL03', label: 'LL03', kind: 'log', red: true, unverified: true },
    { name: 'DF', label: 'DF', kind: 'unverified', unverified: true },
    { name: 'B', label: 'B', kind: 'cube' },
    { name: 'T', label: 'T', kind: 'projected', fn: 'tan', red: true },
    { name: 'SRT', label: 'SRT', kind: 'unverified', unverified: true },
    { name: 'S', label: 'S', kind: 'projected', fn: 'sin', red: true },
    { name: 'D', label: 'D', kind: 'log' },
    { name: 'LL3', label: 'LL3', kind: 'log', unverified: true },
    { name: 'LL2', label: 'LL2', kind: 'log', unverified: true },
  ];

  /**
   * Which scales ride the slide.
   *
   * Every face is built in three bands: the fixed scales printed above the slide,
   * the slide's own scales across the middle, and the fixed scales below. The
   * slide carries the second reading of each pair, so C against D multiplies,
   * CI against D reciprocates, and the cube and square scales read against L.
   */
  const SLIDE_SCALES = {
    front: ['CF', 'CIF', 'CI', 'C'],
    back: ['B', 'T', 'SRT', 'S'],
  };

  const FACES = { front: FRONT, back: BACK };

  /** Row layout for a face, as y positions from the top of the stock. */
  function layout(face) {
    const rows = FACES[face];
    if (!rows) throw new Error(`unknown face: ${face}`);
    return rows.map((row, i) => Object.assign({}, row, {
      y: TOP_PAD + i * ROW_H,
      height: ROW_H,
      index: i,
      slide: SLIDE_SCALES[face].includes(row.name),
    }));
  }

  /** Height of a face's rule body, needed by the camera and the minimap. */
  function height(face) {
    return TOP_PAD + FACES[face].length * ROW_H + 26;
  }

  /** Which face a scale lives on, so the app can switch to show it. */
  function faceFor(name) {
    if (FRONT.some((r) => r.name === name)) return 'front';
    if (BACK.some((r) => r.name === name)) return 'back';
    return null;
  }

  return { FRONT, BACK, FACES, SLIDE_SCALES, ROW_H, TOP_PAD, layout, height, faceFor };
});