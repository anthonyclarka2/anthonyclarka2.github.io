/**
 * The K&E 4181-3 as an instrument: its two faces, its rows, and what is printed
 * on each.
 *
 * The photographs show a two-sided rule, so this is not one scale list but two
 * complementary ones. The geometry of every scale reduces to the single
 * logarithmic axis in geometry.js; what lives here is the physical arrangement
 * -- which face you are looking at, which scales move with the slide, and in
 * what order they are printed top to bottom.
 *
 * Rows are marked `slide: true` when they travel with the moving rule. A row
 * marked `unverified` is one whose graduations could not be recovered from a
 * photograph; it is drawn with its name so the layout is honest about what is
 * printed, but its ticks are not invented.
 *
 * The two faces were swapped in an earlier reading of the photographs. The
 * front carries DF and the log-log pair LL2/LL3; the back carries L, K and A
 * and the log-log pair LL01/LL1. `tests/slide-rule/rule669.test.js` holds the
 * specification as a table so the next reading error is caught rather than
 * shipped.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlideRule669 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* --------------------------------------------------------------- metrics
     Measured off the photographs rather than chosen. The front photograph is
     7859 x 1356 and the rule in it is 7754px long and 1004px tall cap to cap;
     the graduated length is 5895px and the front's row pitch is 99.2px. Every
     number below is one of those ratios, expressed in row-heights so the whole
     rule scales from a single decision about how tall a row is.

     The measurements matter because they are what makes the drawing the
     instrument's shape rather than a tall thin sketch of a slide rule: at
     1114 x 376 the app was drawing the rule at 2.96:1 where the instrument is
     6.96:1, more than twice as stubby as the thing it depicts. */
  const ROW_H = 26;

  /* The body's height in front-row-heights. 1004px of ivory against a 99.2px
     row pitch. It is the same physical height on both faces, which is why the
     back's eleven rows are shorter than the front's ten rather than the back
     being taller. */
  const IVORY_H = 10.12 * ROW_H;

  /* The graduated length: one decade of C and D, which is what every other row
     is laid over. 5895px against the 99.2px row pitch. */
  const AXIS_W = 59.4 * ROW_H;

  /* Ivory either side of the graduations. The left is the column the row names
     are printed in; the right carries each row's range caption and the maker's
     mark. Measured at 438px and 658px. */
  const LEGEND_COL = 4.4 * ROW_H;
  const END_COL = 6.6 * ROW_H;

  /* How far the names stop short of the index: 65px on the front photograph,
     which is where the legend column meets the graduated area. Kept separate
     from the column's own width because the two do different jobs -- the width
     reserves the ivory, the gap is the air between a name and the first
     graduation, and a row whose name touched its scale would read as one
     string. */
  const LEGEND_GAP = 0.65 * ROW_H;

  /* The aluminium end caps, measured at 391px and 355px. */
  const CAP_L = 3.9 * ROW_H;
  const CAP_R = 3.6 * ROW_H;

  /* The seam is drawn taller than a hairline. On the instrument it is a groove
     where the sliding bar meets the fixed plate; here it is what tells a viewer
     that the middle rows can move at all, and a groove an instrument maker
     would be proud of is invisible at screen size. */
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
   * The numbers each log-log row prints, left to right.
   *
   * An entry is either a bare number -- a value the row prints -- or `{ run:
   * [from, to, step] }`, which stands for every value from one to the other at
   * that step. Written as objects rather than as bare arrays because a list of
   * three numbers and a run of three numbers are otherwise the same shape, and
   * LL03 prints three numbers in a row that are not a run: `.005 .002 .001`.
   *
   * These were read at 1:1 from the two photographs. LL2's `1.11 1.15 ... 2 2.5
   * e`, LL3's `3` through `20000`, LL01's `.99` to `.90` and LL1's `1.01` to
   * `1.1` are transcribed. LL03's numbers were dictated from the instrument and
   * are exact.
   */
  const LL_MARKS = {
    LL01: [{ run: [0.98, 0.91, 0.01] }],
    // .90 down to .80 every two hundredths, then .80 down to .40 every five
    // hundredths. The row's own ends are named separately, in LL_ENDS.
    LL02: [{ run: [0.90, 0.80, 0.02] }, { run: [0.80, 0.40, 0.05] }],
    // .35 down to .10 every five hundredths, .05 down to .01 every hundredth,
    // and then the three the row prints below a hundredth and the three below a
    // thousandth -- which are NOT evenly spaced, which is why they are named.
    LL03: [{ run: [0.35, 0.10, 0.05] }, { run: [0.05, 0.01, 0.01] },
      0.005, 0.002, 0.001, 0.0005, 0.0002, 0.0001],
    LL1: [{ run: [1.02, 1.10, 0.01] }],
    LL2: [{ run: [1.11, 1.30, 0.01] }, { run: [1.32, 2.00, 0.02] }, { run: [2.05, 2.60, 0.05] }],
    // Not a run above a hundred: the instrument thins its labels to the same
    // 1-2-5 series the graduations themselves are spaced on, so 100 200 500
    // 1000 2000 5000 10000 20000 is what is printed.
    LL3: [{ run: [3, 10, 1] }, { run: [20, 50, 10] },
      100, 200, 500, 1000, 2000, 5000, 10000, 20000],
  };

  /**
   * The rows that have been walked mark by mark, described the way the
   * instrument is graduated.
   *
   * Each stretch is a run of values with the step they are marked at, and the
   * steps at which a mark is printed longer: `medium` for the tick a reader
   * counts in fives at, `long` for the one they count tens at. Grade and label
   * are INDEPENDENT -- the numbers a row prints are listed in LL_MARKS above,
   * and a stretch says nothing about which of its marks carry one -- because on
   * LL03 the printed `.005`, `.002` and `.001` sit on medium ticks while the
   * printed `.0005`, `.0002` and `.0001` sit on long ones. A model that graded a
   * mark by whether it was printed would get one of those two groups wrong.
   *
   * LL02, dictated from the instrument and checked against the photograph at
   * 1:1. The row opens on a long unlabelled tick at e^-0.1; four short ticks
   * take it to `.90`, whose graduation runs between its last two characters;
   * from .90 to .80 the subdivision is thousandths with the fives medium and the
   * tens long; and from .80 down to the row's foot the subdivision is
   * two-thousandths with every fifth mark medium and the twenty-fifths long.
   */
  const LL_REGIONS = {
    LL02: [
      { from: 0.904, to: 0.901, step: 0.001 },
      { from: 0.90, to: 0.80, step: 0.001, medium: 0.005, long: 0.01 },
      { from: 0.80, to: 0.37, step: 0.002, medium: 0.01, long: 0.05 },
    ],
    /**
     * LL03, dictated from the instrument. The row opens on a MEDIUM tick
     * carrying the printed `1/e`, then three short, one medium, four short, and
     * the printed `.35` on a long tick:
     *
     *   .35 -.30   two-thousandths, hundredths medium, the numbers long
     *   .10 -.02   thousandths, fives medium, tens long
     *   .02 -.01   half-thousandths, thousandths medium, five-thousandths long
     *   .01 -.005  two ten-thousandths, thousandths medium
     *   .005 -.002 the same, so .002 sits on a medium tick
     *   .002 -.001  ten-thousandths, half-thousandths medium
     *   .001 -.0005 ten-thousandths, .0005 long
     *   .0005 -.0002 twenty-millionths, ten-thousandths medium, .0002 long
     *   .0002 -.0001 hundred-thousandths, .00005 medium, .0001 long
     *   .0001 -foot hundred-thousandths, .00005 medium, the foot long
     *
     * The stretches that begin one mark in rather than on a printed number --
     * the opening, and the run up to the row's foot -- start where the
     * instrument's first tick after that number is, which is what keeps the
     * medium ticks on the values the instrument puts them on.
     */
    LL03: [
      { from: 0.366, to: 0.352, step: 0.002, medium: 0.01 },
      { from: 0.35, to: 0.10, step: 0.002, medium: 0.01, long: 0.05 },
      { from: 0.10, to: 0.02, step: 0.001, medium: 0.005, long: 0.01 },
      { from: 0.02, to: 0.01, step: 0.0005, medium: 0.001, long: 0.005 },
      { from: 0.01, to: 0.005, step: 0.0002, medium: 0.001 },
      { from: 0.005, to: 0.002, step: 0.0002, medium: 0.001 },
      { from: 0.002, to: 0.001, step: 0.0001, medium: 0.0005 },
      { from: 0.001, to: 0.0005, step: 0.0001, long: 0.0005 },
      { from: 0.00048, to: 0.00022, step: 0.00002, medium: 0.0001 },
      { from: 0.00022, to: 0.00020, step: 0.00002, long: 0.0002 },
      { from: 0.0002, to: 0.0001, step: 0.00001, medium: 0.00005, long: 0.0001 },
      { from: 0.00009, to: 0.00005, step: 0.00001, medium: 0.00005 },
    ],
  };

  /*
   * The marks a log-log row prints at its own ends, which are exact natural
   * logarithms rather than round numbers: `e` at the foot of LL3, `1/e` at the
   * foot of LL02. They are named rather than computed because the instrument
   * names them: a reader looking for e finds a printed `e`, not the digits of
   * 2.718.
   *
   * The first of each row's two entries is its LEFT-hand end, because that is
   * the order the marks table above reads in and the order the eye reads the
   * instrument in. On the rows below one the left-hand end is the LARGER value:
   * those rows run downhill. LL02's left-hand end is not named here because the
   * instrument does not name it either: the row opens on a bare long tick at
   * e^-0.1 and the first number it prints is `.90`, one step in.
   */
  const LL_ENDS = {
    LL01: [[Math.exp(-0.01), '.99'], [Math.exp(-0.1), '.90']],
    LL02: [[Math.exp(-1), '1/e']],
    // The row opens on a MEDIUM tick carrying the printed name, not a long one.
    // Its foot carries no name at all: the last number the instrument prints on
    // this row is `.0001`, and the long tick past it is bare.
    LL03: [[Math.exp(-1), '1/e', 1]],
    LL1: [[Math.exp(0.01), '1.01']],
    LL2: [[Math.E, 'e']],
    LL3: [[Math.E, 'e']],
  };

  /**
   * Front face, top to bottom: ten rows.
   *
   * `scale` names the graduation in geometry.js that the row prints. It is on
   * the row rather than derived from the row's name in the renderer, because
   * two tables of names is how a row ends up reading one scale and printing
   * another's graduations.
   *
   * `red` marks the rows whose numbers the instrument prints in red. The row
   * NAMES in the left-hand column are black on every row of both faces, which
   * the photographs are clear about.
   */
  const FRONT = [
    { name: 'LL02', label: 'LL02', scale: 'LL02', red: true, regions: LL_REGIONS.LL02, marks: LL_MARKS.LL02, ends: LL_ENDS.LL02 },
    { name: 'LL03', label: 'LL03', scale: 'LL03', red: true, regions: LL_REGIONS.LL03, marks: LL_MARKS.LL03, ends: LL_ENDS.LL03 },
    { name: 'DF', label: 'DF', scale: 'DF' },
    { name: 'CF', label: 'CF', scale: 'CF' },
    { name: 'CIF', label: 'CIF', scale: 'CIF', red: true },
    { name: 'CI', label: 'CI', scale: 'CI', red: true },
    { name: 'C', label: 'C', scale: 'C' },
    { name: 'D', label: 'D', scale: 'D' },
    { name: 'LL3', label: 'LL3', scale: 'LL3', marks: LL_MARKS.LL3, ends: LL_ENDS.LL3 },
    { name: 'LL2', label: 'LL2', scale: 'LL2', marks: LL_MARKS.LL2, ends: LL_ENDS.LL2 },
  ];

  /**
   * Back face, top to bottom: eleven rows.
   *
   * The trig rows appear here and nowhere else, which is why the app switches
   * faces to do trigonometry at all. `SRT` is the one row whose graduations are
   * still not recovered from a photograph.
   */
  const BACK = [
    { name: 'LL01', label: 'LL01', scale: 'LL01', red: true, marks: LL_MARKS.LL01, ends: LL_ENDS.LL01 },
    { name: 'L', label: 'L', scale: 'L' },
    { name: 'K', label: 'K', scale: 'K' },
    { name: 'A', label: 'A', scale: 'A' },
    { name: 'B', label: 'B', scale: 'B' },
    { name: 'T', label: 'T', scale: 'T', red: true },
    { name: 'SRT', label: 'SRT', unverified: true },
    { name: 'S', label: 'S', scale: 'S', red: true },
    { name: 'D', label: 'D', scale: 'D' },
    { name: 'DI', label: 'DI', scale: 'DI', red: true },
    { name: 'LL1', label: 'LL1', scale: 'LL1', marks: LL_MARKS.LL1, ends: LL_ENDS.LL1 },
  ];

  /**
   * Which scales ride the slide.
   *
   * Every face is built in three bands: the fixed scales printed above the
   * slide, the slide's own scales across the middle, and the fixed scales below.
   * The slide carries the second reading of each pair, so C against D
   * multiplies, CI against D reciprocates, and the folded pair reads against
   * its unfolded partner.
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
   * Rows tile the body exactly, at one height per face: the instrument's rows
   * are evenly pitched, and a face with eleven of them has shorter ones than a
   * face with ten. The slide's band is not taller than the stock rows -- the
   * photographs show a uniform pitch straight across it -- so the seam is the
   * only thing marking where the two pieces of material meet.
   */
  function layout(face) {
    const rows = FACES[face];
    if (!rows) throw new Error(`unknown face: ${face}`);
    const slideRows = SLIDE_SCALES[face];

    // The seams come out of the body's height rather than being added to it, so
    // that both faces are the same physical height and a face change does not
    // resize the rule.
    const rowHeight = (IVORY_H - SEAM * 2) / rows.length;

    let top = 0;
    return rows.map((spec, i) => {
      const onSlide = slideRows.includes(spec.name);
      // Spread the spec so every declared property survives into the layout: the
      // renderer reads scale, red and unverified, and a row that quietly lost
      // them would be drawn as something other than what the rule prints.
      const placed = Object.assign({}, spec, {
        y: top + rowHeight,
        height: rowHeight,
        index: i,
        slide: onSlide,
        band: onSlide ? 'slide' : 'stock',
      });
      top += rowHeight;
      // A seam is a gap between two pieces, not a band added on top of one. It
      // is reserved once at each edge of the slide and nowhere else, because
      // adding it before every sliding row would split the bar into four
      // pieces, which is not what the instrument is.
      const next = rows[i + 1];
      const nextIsSlide = next ? slideRows.includes(next.name) : false;
      if (onSlide !== nextIsSlide) top += SEAM;
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
  function height() {
    return IVORY_H;
  }

  /**
   * The graduated length of the rule: one decade of C and D.
   *
   * This is a property of the instrument, not of the current face, and is what
   * the camera clamps against so a window can never show graduations past the
   * end of the stock. It is kept separate from the drawn width, which also
   * includes the legend column, the end column and the caps.
   */
  function width() { return AXIS_W; }

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
   * an opinion. The button appeared inert, and appeared to work only for
   * `sin`, where the two answers happened to agree.
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
    // Nothing can show every scale. Fall back to the first scale that exists
    // anywhere, so trigonometry still turns the rule over rather than narrating
    // an S scale that is not on the face being shown. Which of the two is the
    // better face to show is recorded as an open question in plans/ISSUES.md.
    const first = scales.find((name) => facesFor(name).length);
    return first ? facesFor(first)[0] : current;
  }

  return {
    FRONT, BACK, FACES, SLIDE_SCALES, SLIDE_MIDLINE,
    LL_MARKS, LL_ENDS, LL_REGIONS,
    ROW_H, IVORY_H, AXIS_W, LEGEND_COL, LEGEND_GAP, END_COL, CAP_L, CAP_R, SEAM,
    layout, slideBand, slideMidline, height, width,
    faceFor, facesFor, faceCanShow, resolveFace,
    GRADES, TALLEST_GRADUATION,
  };
});
