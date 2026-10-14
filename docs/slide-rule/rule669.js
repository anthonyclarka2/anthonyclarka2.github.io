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
  const BOTTOM_PAD = 26;

  /* The slide band is drawn taller than a fixed row and separated from the stock
     by a seam. On the instrument the seam is a hairline where the sliding bar
     meets the fixed scale plate; here it is strengthened, because a viewer who
     cannot see where one piece of material ends and the next begins has no way
     to tell that the middle rows can move. */
  const SLIDE_BAND_SCALE = 1.25;
  const SEAM = 8;

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

  /**
   * Row layout for a face, as y positions from the top of the stock.
   *
   * The slide's band is given extra height and separated from the fixed bands by
   * a visible seam. The photographs show that seam only faintly, but it is what
   * tells you the middle bar is a separate piece of material that can be moved,
   * so it is drawn more strongly here than in a photograph.
   */
  function layout(face) {
    const rows = FACES[face];
    if (!rows) throw new Error(`unknown face: ${face}`);
    const slideRows = SLIDE_SCALES[face];

    let y = TOP_PAD;
    return rows.map((spec, i) => {
      const onSlide = slideRows.includes(spec.name);
      // Spread the spec so every declared property survives into the layout: the
      // renderer reads kind, red and unverified, and a row that quietly lost
      // them would be drawn as something other than what the rule prints.
      const placed = Object.assign({}, spec, {
        y,
        height: onSlide ? ROW_H * SLIDE_BAND_SCALE : ROW_H,
        index: i,
        slide: onSlide,
        band: onSlide ? 'slide' : 'stock',
      });
      y += placed.height;
      // A seam is a gap between two pieces, not a band added on top of one, so
      // the space is reserved once, where the fixed stock gives way to the
      // slide. Adding it before every slide row would split the sliding bar
      // into four pieces, which is not what the instrument is.
      const nextIsSlide = i < rows.length - 1 && slideRows.includes(rows[i + 1].name);
      if (!onSlide && nextIsSlide) y += SEAM;
      return placed;
    });
  }

  /**
   * The y range of the sliding band, so the renderer can draw the seam and the
   * slide as one physical piece rather than inferring it from row flags.
   */
  function slideBand(face) {
    const rows = layout(face);
    const slideRows = rows.filter((r) => r.slide);
    if (slideRows.length === 0) throw new Error(`no slide scales on ${face}`);
    const first = slideRows[0];
    const last = slideRows[slideRows.length - 1];
    return {
      top: first.y,
      bottom: last.y + last.height,
      height: last.y + last.height - first.y,
    };
  }

  /** Height of a face's rule body, needed by the camera and the minimap. */
  function height(face) {
    const rows = layout(face);
    const last = rows[rows.length - 1];
    return last.y + last.height + BOTTOM_PAD;
  }

  /** Which face a scale lives on, so the app can switch to show it. */
  function faceFor(name) {
    if (FRONT.some((r) => r.name === name)) return 'front';
    if (BACK.some((r) => r.name === name)) return 'back';
    return null;
  }

  return {
    FRONT, BACK, FACES, SLIDE_SCALES,
    ROW_H, TOP_PAD, BOTTOM_PAD, SLIDE_BAND_SCALE, SEAM,
    layout, slideBand, height, faceFor,
  };
});