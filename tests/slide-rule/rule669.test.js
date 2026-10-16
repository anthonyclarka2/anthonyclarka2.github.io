'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const rule = require('../../docs/slide-rule/rule669.js');
const { geometry } = require('../../docs/slide-rule/geometry.js');

// The rule as the app builds it: one decade, the instrument's own axis.
const RULE = { axisPx: rule.AXIS_W, decades: 1 };
const g = geometry(RULE);

/* --------------------------------------------------------------- the faces */

/**
 * The instrument's layout, transcribed from the photographs and recorded in
 * plans/ISSUES.md.
 *
 * These are the expected values, written out by hand from the specification
 * rather than derived from the module. A test that recomputed them the way the
 * code does would agree with it by construction and could never catch a row
 * moved, dropped or put on the wrong piece -- which is exactly the failure this
 * exists to prevent.
 *
 * THE TWO FACES WERE SWAPPED IN AN EARLIER READING. What is written here now
 * comes from reading the two photographs at 1:1: the front carries DF and the
 * log-log pair LL2/LL3 with the C family, and the back carries L, K and A with
 * the trig rows and the other log-log pair. Ten rows on the front, eleven on the
 * back, which is why the back's rows are shorter -- both faces are the same
 * physical height, and they were measured at 10.12 row-heights of ivory.
 */
const SPEC = {
  front: {
    order: ['LL02', 'LL03', 'DF', 'CF', 'CIF', 'CI', 'C', 'D', 'LL3', 'LL2'],
    slide: ['CF', 'CIF', 'CI', 'C'],
    // The slide is divided exactly in two, so the line falls after two of its
    // four rows. On this face that IS the midpoint.
    midlineAfter: 'CIF',
    count: 10,
  },
  back: {
    order: ['LL01', 'L', 'K', 'A', 'B', 'T', 'SRT', 'S', 'D', 'DI', 'LL1'],
    slide: ['B', 'T', 'SRT', 'S'],
    // NOT the midpoint. The back splits one row from three, after B, which is
    // why the line cannot be derived from the band's geometry and has to be
    // stated for each face.
    midlineAfter: 'B',
    count: 11,
  },
};

test('the front face carries its rows in the order the instrument prints them', () => {
  // Top to bottom: the two log-log rows below one and DF above the slide, the
  // C family across it, then D and the two log-log rows above one.
  assert.deepEqual(rule.layout('front').map((r) => r.name), SPEC.front.order);
});

test('the back face carries its rows in the order the instrument prints them', () => {
  // Eleven rows: L, K and A above the slide, the trig three and B on it, then D,
  // DI and LL1. The back has no C family at all and the front has no L, K or A.
  assert.deepEqual(rule.layout('back').map((r) => r.name), SPEC.back.order);
});

test('the two faces carry different numbers of rows', () => {
  // Ten against eleven, both across the same ivory. This is the fact that makes
  // the back's rows shorter, and it is the quickest check that the faces have
  // not been re-swapped.
  assert.equal(rule.layout('front').length, SPEC.front.count);
  assert.equal(rule.layout('back').length, SPEC.back.count);
});

test('exactly the right rows ride the slide', () => {
  // The slide is a separate physical bar, and a row printed on it travels with
  // it. Getting this wrong does not throw: it moves a fixed scale onto the bar
  // and a sliding one onto the stock, which then quietly reads against a piece
  // that never moves.
  for (const face of ['front', 'back']) {
    const onSlide = rule.layout(face)
      .filter((r) => r.slide)
      .map((r) => r.name);
    assert.deepEqual(onSlide, SPEC[face].slide, `${face} face slide rows`);
  }
});

test('D is printed on the stock below the slide, on both faces', () => {
  // Stated on its own because D is the one scale printed on BOTH faces while
  // every other name is unique to one. It is the row where a mistake is
  // invisible in the row list and only shows up as a missing scale. It is also
  // what makes a sine readable without turning the rule over.
  for (const face of ['front', 'back']) {
    const d = rule.layout(face).find((r) => r.name === 'D');
    assert.ok(d, `the ${face} face has a D`);
    assert.equal(d.slide, false, `D is printed on the stock on the ${face} face`);
  }
});

test('the slide band spans the printing of its first and last rows', () => {
  // The band is what tells you which rows move. It has to enclose the rows'
  // graduations, and a row's graduations are drawn ABOVE its baseline, so the
  // band's top is the first sliding row's baseline less its tallest graduation.
  //
  // It used to run from the first sliding row's baseline to the last one's
  // baseline plus its height. That put the first sliding row's numbers on the
  // stock above the bar and the first stock row's under the bar, where they
  // were painted over and simply could not be seen.
  const T = rule.TALLEST_GRADUATION;
  for (const face of ['front', 'back']) {
    const rows = rule.layout(face);
    const onSlide = rows.filter((r) => r.slide);
    const band = rule.slideBand(face);
    const first = onSlide[0];
    const last = onSlide[onSlide.length - 1];

    assert.ok(Math.abs(band.top - first.ink.top) < 1e-9,
      `${face}: band starts at the first slide row's printing, got ${band.top}`);
    assert.ok(Math.abs(band.bottom - last.ink.bottom) < 1e-9,
      `${face}: band ends at the last slide row's printing, got ${band.bottom}`);
    assert.ok(band.height > 0, `${face}: band has height`);
  }
});

test('no stock row is printed inside the slide band', () => {
  // The consequence that matters: a fixed scale overlapping the bar is drawn
  // under the slide plate, because the slide group is appended after the stock.
  // It does not throw and it does not move, it simply disappears.
  const T = rule.TALLEST_GRADUATION;
  for (const face of ['front', 'back']) {
    const band = rule.slideBand(face);
    for (const row of rule.layout(face)) {
      if (row.slide) continue;
      const inkTop = row.ink.top;
      assert.ok(row.ink.bottom <= band.top || inkTop >= band.bottom,
        `${face}: stock row ${row.name} prints ${inkTop.toFixed(1)}..${row.ink.bottom.toFixed(1)}, `
        + `which is inside the band at ${band.top.toFixed(1)}..${band.bottom.toFixed(1)}`);
    }
  }
});

/* ------------------------------------------------------- choosing the face */

test('a chosen face wins over the one the operation implies', () => {
  // The Back button did nothing. setFace recorded the choice and then called
  // drawRule, which recomputed the face from the expression and overwrote it: for
  // 2.5 * 3.7 the scales used are C and D, C is printed on the front only, so
  // the face was reset to front and the click appeared inert.
  assert.equal(
    rule.resolveFace(['C', 'D'], { chosen: 'back', current: 'front' }),
    'back',
    'an explicit choice is not overridden by the expression',
  );
});

test('without a choice the face is derived from the scales the plan reads', () => {
  // The automatic switch is still right: the app must not animate a scale that
  // is not printed on the face being shown.
  assert.equal(rule.resolveFace(['C', 'D'], { current: 'back' }), 'front',
    'C is printed on the front only');
  assert.equal(rule.resolveFace(['T'], { current: 'front' }), 'back',
    'tangent lives on the back, so the rule turns over');
});

test('a trig reading is satisfied on the back, because it reads S against D', () => {
  // S is printed on the back and D on both, so sine and tangent can be performed
  // on one face. This replaces an older claim that sine needed S and CI, which
  // no single face can show -- the reading was wrong, not the faces.
  assert.equal(rule.resolveFace(['S', 'D'], { current: 'front' }), 'back',
    'trig turns the rule over to the face that prints S');
  assert.equal(rule.resolveFace(['T', 'D'], { current: 'front' }), 'back',
    'and the same for tangent');
  assert.equal(rule.faceCanShow(['S', 'D'], 'back'), true,
    'the back carries everything a sine needs');
  assert.equal(rule.faceCanShow(['T', 'D'], 'back'), true,
    'and everything a tangent needs');
});

test('when no face carries every scale, the rule turns to the first that exists', () => {
  // Built by hand rather than taken from the scale list, because no operation
  // reads this pair any more. The fallback still has to work: it turns to the
  // face that prints the first scale it needs rather than narrating an S that is
  // not on the face being shown.
  assert.equal(rule.resolveFace(['S', 'CI'], { current: 'front' }), 'back',
    'trig turns the rule over');
  assert.equal(rule.resolveFace(['S', 'CI'], { current: 'back' }), 'back',
    'and stays there rather than oscillating');
});

test('a scale printed on both faces is satisfied by either', () => {
  // D is on the front AND the back, so an operation reading only D can be shown
  // on whichever face is up.
  assert.equal(rule.resolveFace(['D'], { current: 'front' }), 'front');
  assert.equal(rule.resolveFace(['D'], { current: 'back' }), 'back');
});

test('the face stays put when the operation needs nothing it can show', () => {
  // No scale in the list is on the rule at all. Turning the instrument over for
  // it would be a pointless flash, so it keeps the face it is on.
  assert.equal(rule.resolveFace([], { current: 'back' }), 'back');
  assert.equal(rule.resolveFace(['Ln'], { current: 'front' }), 'front',
    'a scale the rule does not print does not send it to either face');
});

test('a face can be asked whether it can show an operation', () => {
  // Needed so the app can say why it is showing a face it cannot perform on,
  // rather than silently turning the rule back.
  assert.equal(rule.faceCanShow(['C', 'D'], 'front'), true);
  assert.equal(rule.faceCanShow(['C', 'D'], 'back'), false,
    'C is not printed on the back');
  assert.equal(rule.faceCanShow(['D'], 'back'), true,
    'D is printed on both faces, so either will do');
  assert.equal(rule.faceCanShow(['S'], 'back'), true);
  assert.equal(rule.faceCanShow(['A'], 'back'), true, 'A is a back scale');
  assert.equal(rule.faceCanShow(['A'], 'front'), false,
    'and the front does not carry it');
});

test('both faces of the rule are described', () => {
  assert.ok(Array.isArray(rule.FRONT) && rule.FRONT.length > 0, 'front face');
  assert.ok(Array.isArray(rule.BACK) && rule.BACK.length > 0, 'back face');
  assert.equal(rule.FACES.front, rule.FRONT, 'front is reachable by name');
  assert.equal(rule.FACES.back, rule.BACK, 'back is reachable by name');
});

test('the faces carry every scale printed on the instrument', () => {
  // Every row name in the corrected layout, checked against the module. The list
  // is the specification; the module is what has to agree with it.
  for (const name of SPEC.front.order) {
    assert.ok(rule.FRONT.some((r) => r.name === name), `front has ${name}`);
  }
  for (const name of SPEC.back.order) {
    assert.ok(rule.BACK.some((r) => r.name === name), `back has ${name}`);
  }
});

test('the log-log rows are split between the faces', () => {
  // LL2 and LL3 (the rows above one) are printed on the front with DF, and LL01
  // and LL1 on the back. The earlier reading had these the wrong way round,
  // which is the single most consequential of the swap's errors: it put the
  // three power rows of the upper group on one face and the odd one out alone.
  const front = rule.FRONT.map((r) => r.name);
  const back = rule.BACK.map((r) => r.name);
  assert.ok(front.includes('LL2') && front.includes('LL3'), 'front carries LL2 and LL3');
  assert.ok(back.includes('LL1') && back.includes('LL01'), 'back carries LL1 and LL01');
  assert.ok(front.includes('LL02') && front.includes('LL03'), 'front carries the small pair');
  assert.ok(!back.includes('LL3'), 'LL3 is not on the back');
  assert.ok(!front.includes('LL1'), 'LL1 is not on the front');
});

test('trigonometry lives on the back face only', () => {
  assert.ok(!rule.FRONT.some((r) => r.name === 'S' || r.name === 'T'),
    'no sine or tangent on the front');
  assert.ok(rule.BACK.some((r) => r.name === 'S'), 'sine on the back');
  assert.ok(rule.BACK.some((r) => r.name === 'T'), 'tangent on the back');
  assert.equal(rule.faceFor('S'), 'back', 'faceFor agrees');
});

test('the front face carries CI, so multiplication can divide as well as multiply', () => {
  // CI is the slide's reciprocal: it is what lets one setting produce a
  // quotient, and it is read against D rather than standing alone.
  const ci = rule.layout('front').find((r) => r.name === 'CI');
  assert.ok(ci, 'CI is on the front');
  assert.equal(ci.scale, 'CI', 'the row names the CI graduation');
  assert.equal(g.describe(ci.scale).kind, 'reciprocal', 'CI reciprocates');
  assert.equal(ci.slide, true, 'CI rides the slide');
});

test('DI is printed on the back, paired with D', () => {
  // CI and DI are the same graduations on the two faces, each reading against
  // the D that shares its face.
  const back = rule.layout('back');
  const di = back.find((r) => r.name === 'DI');
  const d = back.find((r) => r.name === 'D');
  assert.ok(di && d, 'DI and D both present');
  assert.ok(di.index > d.index, 'DI sits below D');
  assert.equal(g.describe(di.scale).kind, 'reciprocal', 'DI is reciprocal');
  assert.equal(di.slide, false, 'DI is printed on the stock');
});

test('each face has the three bands the rule is built in', () => {
  for (const face of ['front', 'back']) {
    const rows = rule.layout(face);
    const slide = rows.filter((r) => r.slide);
    assert.ok(slide.length > 0, `${face} has rows on the slide`);
    // Everything above the first slide row and below the last is fixed.
    const first = slide[0].index;
    const last = slide[slide.length - 1].index;
    assert.ok(first > 0, `${face} has fixed rows above the slide`);
    assert.ok(last < rows.length - 1, `${face} has fixed rows below the slide`);
    for (const row of rows.slice(0, first)) assert.equal(row.slide, false, `${face} ${row.name} fixed`);
    for (const row of rows.slice(last + 1)) assert.equal(row.slide, false, `${face} ${row.name} fixed`);
    for (const row of slide) assert.equal(row.slide, true, `${face} ${row.name} slides`);
  }
});

/* ------------------------------------------------------------------ layout */

test('rows are laid out top to bottom in the order they are listed', () => {
  for (const face of ['front', 'back']) {
    const rows = rule.layout(face);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i].y > rows[i - 1].y,
        `${face} row ${rows[i].name} sits below row ${rows[i - 1].name}`);
    }
  }
});

test('no two rows on a face overlap', () => {
  for (const face of ['front', 'back']) {
    const rows = rule.layout(face);
    for (const row of rows) {
      assert.ok(row.height > 0 && row.y >= 0, `${face} ${row.name} has a positive box`);
    }
    // The last row's baseline is the bottom edge of the ivory -- the rows tile
    // it exactly, seams included -- so this is >= rather than >.
    assert.ok(rule.height() >= rows[rows.length - 1].y,
      `${face} fits within the body`);
  }
});

test('rows are uniformly pitched within a face', () => {
  // The photographs show an even pitch straight across the body, including
  // across the slide: the bar is the same height as the rows beside it, and the
  // seam is the only thing marking where the two pieces meet.
  for (const face of ['front', 'back']) {
    const heights = new Set(rule.layout(face).map((r) => r.height.toFixed(6)));
    assert.equal(heights.size, 1, `${face} rows share one height, got ${[...heights]}`);
  }
});

test('both faces are the same physical height', () => {
  // The instrument is one piece of ivory: turning it over does not change how
  // tall it is. Eleven rows on the back therefore get shorter rows than ten on
  // the front, and the ratio is measurable on the photographs.
  const front = rule.layout('front');
  const back = rule.layout('back');
  const ratio = front[0].height / back[0].height;
  assert.ok(Math.abs(ratio - 11 / 10) < 0.02,
    `front rows are 11/10 of the back's, got ${ratio.toFixed(4)}`);
  assert.ok(Math.abs(rule.height() - rule.IVORY_H) < 1e-9,
    'the body height is the same on both faces');
});

test('the slide the scales are marked on travels with it', () => {
  const front = rule.layout('front');
  const ci = front.find((r) => r.name === 'CI');
  const d = front.find((r) => r.name === 'D');
  assert.equal(ci.slide, true, 'CI rides the slide');
  assert.equal(d.slide, false, 'D is fixed to the stock');
});

test('the slide band is separated from the stock by a visible seam', () => {
  // The photographs show the seam only faintly, but it is what tells you the
  // middle bar is a separate piece that can move. Without it the three bands
  // read as one continuous strip and the slide looks decorative.
  for (const face of ['front', 'back']) {
    const band = rule.slideBand(face);
    const rows = rule.layout(face);
    const first = rows.find((r) => r.slide);
    const lastStock = rows.slice(0, first.index).pop();

    if (lastStock) {
      // The seam is the blank gap between the two pieces. Measured between their
      // PRINTING rather than their baselines, since a row's graduations stop at
      // its baseline: the gap runs from the bottom of the stock's last
      // graduations to the top of the slide's first, and it has to be wide
      // enough to read as a join.
      const stockInkBottom = lastStock.y;
      const slideInkTop = first.ink.top;
      const gap = slideInkTop - stockInkBottom;
      assert.ok(gap >= rule.SEAM,
        `${face}: only ${gap.toFixed(2)} units between the stock's printing and `
        + `the slide's, which is less than the ${rule.SEAM} unit seam`);
      assert.ok(rule.SEAM > 0, 'a seam width is defined, and it is visible');
    }
    assert.ok(band.bottom > band.top, `${face} band has height`);
  }
});

test('the slide band is contiguous, with no stock rows inside it', () => {
  for (const face of ['front', 'back']) {
    const rows = rule.layout(face);
    const indices = rows.map((r, i) => (r.slide ? i : -1)).filter((i) => i >= 0);
    for (let i = 1; i < indices.length; i++) {
      assert.equal(indices[i], indices[i - 1] + 1,
        `${face} slide rows are adjacent: ${indices.join(',')}`);
    }
  }
});

test('the slide rows are the same height as the stock rows', () => {
  // The bar used to be drawn taller than the rows beside it, which made the
  // rule look like three stacked strips rather than one instrument with a
  // sliding middle. Both faces are of a piece, and the pitch is uniform.
  for (const face of ['front', 'back']) {
    const rows = rule.layout(face);
    const slideRow = rows.find((r) => r.slide);
    const stockRow = rows.find((r) => !r.slide);
    assert.equal(slideRow.height, stockRow.height,
      `${face}: slide and stock rows are pitched alike`);
  }
});

test('the band sits inside the rule body, so the camera can frame it', () => {
  for (const face of ['front', 'back']) {
    const band = rule.slideBand(face);
    const h = rule.height();
    assert.ok(band.top >= 0, `${face} band starts inside the rule`);
    assert.ok(band.bottom <= h, `${face} band ends inside the rule, ${band.bottom} <= ${h}`);
  }
});

test('rows tile the rule, with a seam at each edge of the bar', () => {
  for (const face of ['front', 'back']) {
    const rows = rule.layout(face);
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const gap = rows[i].y - (prev.y + prev.height);
      const startsSlide = !prev.slide && rows[i].slide;
      const endsSlide = prev.slide && !rows[i].slide;
      const seamOk = (startsSlide || endsSlide) && Math.abs(gap - rule.SEAM) < 1e-9;
      assert.ok(Math.abs(gap) < 1e-9 || seamOk,
        `${face} gap before ${rows[i].name} is ${gap}, expected 0 or a seam`);
    }
  }
});

test('a seam is reserved at each edge of the sliding bar', () => {
  // Two joins, not one and not three. The bar sits in a groove, so it meets the
  // stock above it and below it and the printing stops short at both. A missing
  // seam reads as the middle rows being printed on the same strip; an extra one
  // would cut the rule into more pieces than it has.
  for (const face of ['front', 'back']) {
    const rows = rule.layout(face);
    const slideRows = rows.filter((r) => r.slide);
    const firstSlide = slideRows[0].name;
    const afterSlide = rows[slideRows[slideRows.length - 1].index + 1].name;
    const gaps = [];
    for (let i = 1; i < rows.length; i++) {
      const gap = rows[i].y - (rows[i - 1].y + rows[i - 1].height);
      if (Math.abs(gap) > 1e-9) gaps.push(rows[i].name);
    }
    assert.deepEqual(gaps, [firstSlide, afterSlide], `${face} seams fall at the bar's edges`);
  }
});

test('the two seams are the only gaps in the row sequence', () => {
  // Stated as its own check because the count is what the renderer draws: it
  // puts one plate above the bar and one below, and a third gap would leave a
  // strip of body with no plate behind it.
  for (const face of ['front', 'back']) {
    const rows = rule.layout(face);
    let gaps = 0;
    for (let i = 1; i < rows.length; i++) {
      if (Math.abs(rows[i].y - (rows[i - 1].y + rows[i - 1].height)) > 1e-9) gaps++;
    }
    assert.equal(gaps, 2, `${face} has two seams, got ${gaps}`);
  }
});

test('the printed dividing line falls between two slide rows on each face', () => {
  // It is a line printed on the bar, not a seam: it does not reserve space and
  // it travels with the slide. Its position is per-face data because the front
  // divides its four sliding rows two and two and the back one from three.
  for (const face of ['front', 'back']) {
    const rows = rule.layout(face);
    const y = rule.slideMidline(face);
    const above = rows.find((r) => r.name === SPEC[face].midlineAfter);
    const below = rows[above.index + 1];
    assert.ok(y > above.y - above.height && y < below.y,
      `${face}: the line at ${y.toFixed(1)} sits within the bar`);
    assert.ok(y > above.ink.bottom && y < below.ink.top,
      `${face}: and in the gap between the two rows' printing`);
  }
});

test('the midline is not simply the middle of the band', () => {
  // The mistake this guards: taking the band's midpoint puts the back's line
  // between T and SRT, a row too low, because the back divides one row from
  // three rather than two from two.
  const band = rule.slideBand('back');
  const y = rule.slideMidline('back');
  const middle = band.top + band.height / 2;
  assert.ok(Math.abs(y - middle) > 1, 'the back divides its bar off-centre');
});

test('the graduated width is exported, since the camera clamps against it', () => {
  // The camera is handed this to bound its window. If it is missing the
  // renderer throws while drawing and the animation silently never starts,
  // which is exactly what happened once.
  assert.equal(typeof rule.width(), 'number', 'width is a function');
  assert.ok(rule.width() > 0, 'and has a positive value');
  assert.ok(rule.width() > 1000, 'the graduated length is a substantial part of the rule');
});

test('an unknown face is refused rather than silently empty', () => {
  assert.throws(() => rule.layout('sideways'), /unknown face/);
  assert.throws(() => rule.slideBand('sideways'), /unknown face/);
});

test('the rule has the proportions of the instrument', () => {
  // Measured from the photographs: the ivory is 10.12 row-heights tall and the
  // graduated length is 59.4 of them, so the rule is a little under six units
  // wide for every one tall, and with the legend column and the caps it is a
  // little over seven. A stubby rule is the most obvious way for the drawing to
  // read as a diagram rather than as the instrument.
  const body = rule.width() / rule.height();
  assert.ok(Math.abs(body - 59.4 / 10.12) < 0.05, `body aspect ${body.toFixed(3)}`);
  assert.ok(body > 5.5 && body < 6.5, 'the body is between five and six and a half to one');
});

/* --------------------------------------------------------------- fidelity */

test('rows whose graduations could not be read are marked unverified', () => {
  // These are the rows where a photograph showed the name but not the rule. They
  // are recorded as unknown rather than invented, so the renderer can decline to
  // fabricate ticks for them. SRT is the only one left: every other row has been
  // read closely enough to graduate.
  const marked = [];
  for (const face of ['front', 'back']) {
    for (const row of rule.layout(face)) {
      if (row.unverified) marked.push(row.name);
    }
  }
  assert.deepEqual(marked, ['SRT'], 'SRT is the only unverified row');
});

test('DF is graduated, because the folded construction is known', () => {
  // DF was marked unverified in the earlier reading, which had the faces
  // swapped and the folded scales modelled as something other than a fold. It is
  // an ordinary folded scale: C slid along by log10(pi), with a pi at each end.
  const df = rule.layout('front').find((r) => r.name === 'DF');
  assert.ok(df, 'DF is on the front');
  assert.notEqual(df.unverified, true, 'DF is graduated');
  const def = g.describe(df.scale);
  assert.equal(def.kind, 'folded');
  assert.ok(Math.abs(def.range[0] - Math.PI) < 1e-12, 'its index is pi');
  assert.ok(Math.abs(def.range[1] - Math.PI * 10) < 1e-12, 'and its far end is ten pi');
});

test('the log-log rows carry the marks they print, by one of two descriptions', () => {
  // LL02 has been walked mark by mark and carries `regions`: stretches of values
  // with the step they are marked at and the steps printed longer. The rows not
  // yet walked carry `marks`, a list of the values they label. Either way a row
  // with a scale and neither would come out blank, so both are checked.
  for (const face of ['front', 'back']) {
    for (const row of rule.layout(face)) {
      if (!/^LL/.test(row.name)) continue;
      assert.equal(g.describe(row.scale).kind, 'log-log', `${row.name} is a log-log row`);
      const described = (row.regions && row.regions.length)
        || (row.marks && row.marks.length);
      assert.ok(described, `${row.name} describes its marks`);
      for (const region of row.regions || []) {
        assert.ok(Number.isFinite(region.from) && Number.isFinite(region.to)
          && region.step > 0, `${row.name} region ${region.from}..${region.to}`);
      }
      for (const entry of row.marks || []) {
        // Either a bare printed value or a run of them.
        if (typeof entry === 'number') {
          assert.ok(Number.isFinite(entry), `${row.name} prints ${entry}`);
          continue;
        }
        const [from, to, step] = entry.run;
        assert.ok(Number.isFinite(from) && Number.isFinite(to) && step > 0,
          `${row.name} mark run ${entry.run}`);
      }
    }
  }
});

test('every log-log mark lies within its own row', () => {
  // A mark outside the row's range is silently dropped by the renderer, so a
  // mistyped digit shows up as a missing label rather than as an error. Checked
  // against the geometry's own range so the two tables cannot disagree.
  for (const face of ['front', 'back']) {
    for (const row of rule.layout(face)) {
      if (!/^LL/.test(row.name)) continue;
      const [lo, hi] = g.describe(row.scale).range;
      const low = Math.min(lo, hi);
      const high = Math.max(lo, hi);
      const within = (v, what) => assert.ok(
        v >= low * (1 - 1e-9) && v <= high * (1 + 1e-9),
        `${row.name}: ${what} ${v} is outside its row ${low}..${high}`,
      );
      // Both ends of each described stretch, and every value a region names as
      // a step. A stretch that runs past the row's foot would leave marks the
      // renderer drops without saying so.
      for (const region of row.regions || []) {
        within(region.from, 'region start');
        within(region.to, 'region end');
      }
      for (const entry of row.marks || []) {
        if (typeof entry === 'number') {
          within(entry, 'printed value');
          continue;
        }
        const [from, to] = entry.run;
        within(from, 'mark');
        within(to, 'mark');
      }
      for (const [v, text] of row.ends) {
        within(v, 'end mark');
        assert.ok(typeof text === 'string' && text.length > 0,
          `${row.name}: end mark has a printed name`);
      }
    }
  }
});

test('the log-log rows below one run downhill, as the photographs show', () => {
  // The rows below one are printed with their LARGEST value at the index:
  // LL01 opens on .99 and LL02 on .90, and the numbers fall as the eye runs
  // right. Getting this backwards puts the whole row in mirror image, which
  // looks entirely plausible until it is compared with the instrument.
  for (const name of ['LL01', 'LL02', 'LL03']) {
    const def = g.describe(name);
    assert.equal(def.of, 'below', `${name} is a row below one`);
    assert.ok(def.range[0] > def.range[1], `${name}'s left-hand end is the larger value`);
    assert.ok(g.posOf(name, def.range[0]) < 1e-9, `${name}'s first value is at the index`);
    assert.ok(Math.abs(g.posOf(name, def.range[1]) - RULE.axisPx) < 1e-6,
      `${name}'s second value is at the far end`);
  }
});

test('the log-log rows above one run uphill', () => {
  for (const name of ['LL1', 'LL2', 'LL3']) {
    const def = g.describe(name);
    assert.equal(def.of, 'above', `${name} is a row above one`);
    assert.ok(def.range[0] < def.range[1], `${name}'s left-hand end is the smaller value`);
    assert.ok(g.posOf(name, def.range[0]) < 1e-9, `${name}'s first value is at the index`);
  }
});

test('the trig rows name the function they carry', () => {
  const back = rule.layout('back');
  assert.equal(g.describe(back.find((r) => r.name === 'S').scale).fn, Math.sin);
  assert.equal(g.describe(back.find((r) => r.name === 'T').scale).fn, Math.tan);
});

test('every printed row maps to a graduation rule geometry understands', () => {
  const known = new Set([
    'log', 'linear', 'reciprocal', 'folded', 'folded-reciprocal',
    'log-log', 'projected',
  ]);
  for (const face of ['front', 'back']) {
    for (const row of rule.layout(face)) {
      if (row.unverified) {
        assert.equal(row.scale, undefined, `${row.name} claims no scale it cannot draw`);
        continue;
      }
      assert.ok(known.has(g.describe(row.scale).kind),
        `${row.name} has kind ${g.describe(row.scale).kind}`);
    }
  }
});

/* ------------------------------------------------- rows must agree with it */

test('each printed row reads the value it names', () => {
  // The same invariant the renderer relies on, checked at the rule level: a row
  // labelled 2 must read 2 at the position where its 2 graduation is drawn.
  for (const [scale, kind] of [['C', 'log'], ['D', 'log'], ['A', 'log'], ['B', 'log'], ['K', 'log']]) {
    const def = g.describe(scale);
    assert.equal(def.kind, kind, `${scale} is a ${kind} scale`);
    for (const v of def.range) {
      const x = g.posOf(scale, v);
      assert.ok(Number.isFinite(x), `${scale} places ${v}`);
      assert.ok(x >= 0 && x <= RULE.axisPx, `${scale} keeps ${v} on the rule, got ${x}`);
    }
  }
});

test('the power scales span their own decades', () => {
  // A, B and K carry two, two and three decades over the same graduated length
  // as C's one. That compression IS what makes them the square and cube scales,
  // so it is worth stating: A's ten sits halfway along the rule and K's ten a
  // third of the way along, while their twos sit at the log of two, scaled by
  // the number of cycles.
  const expectedA10 = RULE.axisPx / 2;
  const expectedK10 = RULE.axisPx / 3;
  assert.ok(Math.abs(g.posOf('A', 10) - expectedA10) < 1e-6, "A's 10 is at the middle");
  assert.ok(Math.abs(g.posOf('K', 10) - expectedK10) < 1e-6, "K's 10 is a third along");
  assert.ok(Math.abs(g.posOf('A', 2) - (RULE.axisPx * Math.log10(2)) / 2) < 1e-6,
    "A's 2 is at half the position C's 2 would be");
  assert.ok(Math.abs(g.posOf('K', 2) - (RULE.axisPx * Math.log10(2)) / 3) < 1e-6,
    "K's 2 is at a third of it");
  assert.ok(Math.abs(g.posOf('A', 100) - RULE.axisPx) < 1e-6, 'A ends at its 100');
  assert.ok(Math.abs(g.posOf('K', 1000) - RULE.axisPx) < 1e-6, 'K ends at its 1000');
});
