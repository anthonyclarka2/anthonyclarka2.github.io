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

  /* How each class of graduation is printed, as a fraction of its row's height.
     The instrument prints the values it names on long ticks and fills in between
     with short ones, so a scale reads at a glance: the long ticks are the
     landmarks a reader aims the cursor at.

     These live here rather than in the renderer because the slide plate has to
     know how far a row's printing reaches above its baseline in order to size
     itself around it. Duplicating the number in two modules is how the plate
     and the graduations came to disagree about where the slide begins. */
  const GRADES = [
    { len: 0.62, width: 1, opacity: 0.9, font: 9 },     // labelled
    { len: 0.40, width: 0.7, opacity: 0.7, font: 7.5 }, // between the labels
    { len: 0.24, width: 0.55, opacity: 0.55, font: 7 }, // fine subdivision
  ];

  /* The tallest graduation, and therefore how far a row's printing reaches
     above its baseline. A row's `y` is its BASELINE: its graduations are drawn
     upward from it, so its printed extent is [y - height * TALLEST, y]. */
  const TALLEST_GRADUATION = GRADES[0].len;

  /**
   * Front face, top to bottom.
   *
   * `kind` names the graduation rule understood by geometry.js. `log` is the
   * ordinary scale; `cube` and `square` are the power scales; `projected` is a
   * trig scale read against its partner.
   */
  const FRONT = [
    { name: 'LL01', label: 'LL01', kind: 'log-log', red: true },
    { name: 'L', label: 'L', kind: 'log' },
    { name: 'K', label: 'K', kind: 'cube' },
    { name: 'A', label: 'A', kind: 'square' },
    { name: 'CF', label: 'CF', kind: 'cube' },
    { name: 'CIF', label: 'CIF', kind: 'cube', red: true },
    { name: 'CI', label: 'CI', kind: 'reciprocal', red: true },
    { name: 'C', label: 'C', kind: 'log' },
    { name: 'D', label: 'D', kind: 'log' },
    { name: 'DI', label: 'DI', kind: 'reciprocal', red: true },
    { name: 'LL1', label: 'LL1', kind: 'log-log' },
  ];

  /**
   * Back face. The trig rows appear here and nowhere else, which is why the
   * app switches faces to do trigonometry at all.
   */
  const BACK = [
    { name: 'LL02', label: 'LL02', kind: 'log-log', red: true },
    { name: 'LL03', label: 'LL03', kind: 'log-log', red: true },
    { name: 'DF', label: 'DF', kind: 'unverified', unverified: true },
    { name: 'B', label: 'B', kind: 'cube' },
    { name: 'T', label: 'T', kind: 'projected', fn: 'tan', red: true },
    { name: 'SRT', label: 'SRT', kind: 'unverified', unverified: true },
    { name: 'S', label: 'S', kind: 'projected', fn: 'sin', red: true },
    { name: 'D', label: 'D', kind: 'log' },
    { name: 'LL3', label: 'LL3', kind: 'log-log' },
    { name: 'LL2', label: 'LL2', kind: 'log-log' },
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

  /**
   * Which sliding row each face's dividing line falls below, from the
   * photographs. See `slideMidline` for why this is not simply the midpoint.
   */
  const SLIDE_MIDLINE = { front: 'CIF', back: 'B' };

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
   *
   * The band spans the PRINTED EXTENT of the sliding rows, not the range from
   * one baseline to the next. A row's `y` is its baseline and its graduations
   * are drawn upward from it, so [first.y, last.y + last.height] put the first
   * sliding row's numbers outside the plate, on the stock above it, and the last
   * stock row's numbers under the plate where they were invisible. Neither
   * throws: one reads as the slide boundary being in the wrong place and the
   * other as a missing scale.
   */
  function slideBand(face) {
    const rows = layout(face);
    const slideRows = rows.filter((r) => r.slide);
    if (slideRows.length === 0) throw new Error(`no slide scales on ${face}`);
    const first = slideRows[0];
    const last = slideRows[slideRows.length - 1];
    const top = first.y - first.height * TALLEST_GRADUATION;
    const bottom = last.y;
    return { top, bottom, height: bottom - top };
  }

  /**
   * The line printed across the sliding bar.
   *
   * On the instrument the slide is divided by a horizontal line: after CIF on the
   * front face and after B on the back. It is a division WITHIN one piece of
   * material, so it is not a seam -- a seam is a gap between two pieces and
   * reserves its own space, while this is a line printed on the bar and travels
   * with it.
   *
   * Stated as the row the line falls below rather than derived from the band's
   * geometry, because the two faces divide at different points: the front splits
   * its four sliding rows two and two and so happens to land on the midpoint,
   * while the back splits one from three and does not. Taking the midpoint for
   * both puts the back's line a row too low, between T and SRT.
   *
   * Placed in the gap between the two rows' printing rather than on the
   * boundary between their baselines. A row's graduations are drawn upward from
   * its baseline, so the boundary is where the lower row's ticks start -- a line
   * there runs straight into them. The gap is the only place on the bar where a
   * line prints cleanly, and it is where the photographs show it.
   *
   * Resolved through the layout rather than as a constant, so it stays correct
   * if a row height ever changes.
   */
  function slideMidline(face) {
    const rows = layout(face);
    const above = rows.find((r) => r.name === SLIDE_MIDLINE[face]);
    if (!above) throw new Error(`no midline row on ${face}`);
    if (!above.slide) throw new Error(`midline row ${above.name} is not on the slide`);
    const below = rows[above.index + 1];
    if (!below || !below.slide) throw new Error(`no slide row below ${above.name}`);
    // The upper row's printing ends at its baseline; the lower row's begins a
    // graduation's length above its own.
    return (above.y + (below.y - below.height * TALLEST_GRADUATION)) / 2;
  }

  /** Height of a face's rule body, needed by the camera and the minimap. */
  function height(face) {
    const rows = layout(face);
    const last = rows[rows.length - 1];
    return last.y + last.height + BOTTOM_PAD;
  }

  /**
   * The graduated width of the rule. This is a property of the instrument, not
   * of the current face, and is what the camera clamps against so a window can
   * never show graduations past the end of the stock. It is kept separate from
   * the drawn width, which also includes the slide's overhang.
   */
  const AXIS_WIDTH = 1000;
  function width() { return AXIS_WIDTH; }

  /** Which face a scale lives on, so the app can switch to show it. */
  function faceFor(name) {
    const both = facesFor(name);
    return both.length ? both[0] : null;
  }

  /**
   * Every face a scale is printed on.
   *
   * D is printed on both, so a single face is not the whole answer for it.
   * `faceFor` returns the first and is right for "which face should I show",
   * but not for "can this face show D" -- which is false on the back if D is
   * only ever reported as front, and that is how a reciprocal read got refused
   * on a face that prints it.
   */
  function facesFor(name) {
    const out = [];
    if (FRONT.some((r) => r.name === name)) out.push('front');
    if (BACK.some((r) => r.name === name)) out.push('back');
    return out;
  }

  /**
   * Can this face show an operation?
   *
   * Every scale it reads has to be printed here. True when the list is empty,
   * because an operation that reads nothing off the rule can be narrated on
   * either face -- there is no scale to be missing.
   */
  function faceCanShow(scales, face) {
    return scales.every((name) => facesFor(name).includes(face));
  }

  /**
   * Which face to draw.
   *
   * An explicit choice always wins. That is the whole point of the Front and
   * Back buttons: being able to look at the other side of the instrument. It
   * used not to, because the face was recomputed from the expression on every
   * redraw, so choosing the back for `2.5 * 3.7` put it straight back to the
   * front -- C is printed on the front only, so the automatic switch always had
   * an opinion. The button appeared inert, and appeared to work only for `sin`,
   * where the two answers happened to agree.
   *
   * With no choice, the face follows the scales the plan reads, so the rule
   * turns over rather than the animation pretending a scale exists where it
   * does not. A scale printed on both faces -- D is -- is satisfied by either,
   * so reading only D leaves the rule where it is.
   *
   * `chosen` is meant to be cleared when the expression changes, so that a face
   * picked to have a look round does not then silently govern the next
   * calculation.
   */
  function resolveFace(scales, { chosen = null, current = 'front' } = {}) {
    if (chosen) return chosen;
    if (faceCanShow(scales, current)) return current;
    for (const candidate of ['front', 'back']) {
      if (faceCanShow(scales, candidate)) return candidate;
    }
    // Nothing can show every scale. Sine is the case that reaches here: S is
    // printed on the back and CI on the front, so the two scales a sine is read
    // with are never on the same face. Fall back to the first scale that exists
    // anywhere, so trigonometry still turns the rule over rather than narrating
    // an S scale that is not on the face being shown. Which of the two is the
    // better face to show is recorded as an open question in plans/ISSUES.md.
    const first = scales.find((name) => facesFor(name).length);
    return first ? facesFor(first)[0] : current;
  }

  return {
    FRONT, BACK, FACES, SLIDE_SCALES,
    ROW_H, TOP_PAD, BOTTOM_PAD, SLIDE_BAND_SCALE, SEAM,
    layout, slideBand, slideMidline, height, width,
    faceFor, facesFor, faceCanShow, resolveFace,
    GRADES, TALLEST_GRADUATION,
  };
});