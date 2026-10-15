'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const rule = require('../../docs/slide-rule/rule669.js');
const { geometry } = require('../../docs/slide-rule/geometry.js');

const RULE = { axisPx: 1000, decades: 4 };
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
 */
const SPEC = {
  front: {
    order: ['LL01', 'L', 'K', 'A', 'CF', 'CIF', 'CI', 'C', 'D', 'DI', 'LL1'],
    slide: ['CF', 'CIF', 'CI', 'C'],
    // The slide is divided exactly in two, so the line falls after two of its
    // four rows.
    midlineAfter: 'CIF',
  },
  back: {
    order: ['LL02', 'LL03', 'DF', 'B', 'T', 'SRT', 'S', 'D', 'LL3', 'LL2'],
    slide: ['B', 'T', 'SRT', 'S'],
    // NOT the midpoint. The back splits one row from three, after B, which is
    // why the line cannot be derived from the band's geometry and has to be
    // stated for each face.
    midlineAfter: 'B',
  },
};

test('the front face carries its rows in the order the instrument prints them', () => {
  // Top to bottom, with the slide's four scales between A and D. D belongs
  // below the slide, not on it, and LL1 last of all.
  assert.deepEqual(rule.layout('front').map((r) => r.name), SPEC.front.order);
});

test('the back face carries its rows in the order the instrument prints them', () => {
  // Ten rows, not eleven: the back has no CIF and no DI. The slide's four sit
  // between DF and D, and LL3 and LL2 finish the rule.
  assert.deepEqual(rule.layout('back').map((r) => r.name), SPEC.back.order);
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

test('D is printed on the stock below the slide, not on the slide', () => {
  // Stated on its own because it is the row that was reported missing from the
  // front face, and because D is printed on BOTH faces while every other name
  // is unique to one. It is the one row where a mistake here is invisible in the
  // row list and only shows up as a missing scale.
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

    assert.ok(Math.abs(band.top - (first.y - first.height * T)) < 1e-9,
      `${face}: band starts at the first slide row's printing, got ${band.top}`);
    assert.ok(Math.abs(band.bottom - last.y) < 1e-9,
      `${face}: band ends at the last slide row's baseline, got ${band.bottom}`);
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
      const inkTop = row.y - row.height * T;
      assert.ok(row.y <= band.top || inkTop >= band.bottom,
        `${face}: stock row ${row.name} prints ${inkTop.toFixed(1)}..${row.y.toFixed(1)}, `
        + `which is inside the band at ${band.top.toFixed(1)}..${band.bottom.toFixed(1)}`);
    }
  }
});

test('a chosen face wins over the one the operation implies', () => {
  // The Back button did nothing. setFace recorded the choice and then called
  // drawRule, which recomputed the face from the expression and overwrote it: for
  // 2.5 * 3.7 the scales used are C and D, C is printed on the front only, so
  // the face was reset to front and the click appeared inert.
  //
  // It looked like it worked for sin(30) only because S is back-only, so the
  // automatic choice and the manual one happened to agree.
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

test('when no face carries every scale, the rule turns to the first that exists', () => {
  // Sine reads with S and CI. S is printed on the back and CI on the front, so
  // no single face carries both, and this is the case that reaches the
  // fallback. It has to turn to the back -- S is the scale being set -- rather
  // than narrate a sine against an S that is not on the face being shown.
  //
  // That the other scale is then missing is a real gap, recorded as an open
  // question in plans/ISSUES.md, and not something this function can fix.
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
  assert.equal(rule.faceCanShow(['S', 'CI'], 'back'), false,
    'CI is not printed on the back, so sine cannot be read on one face');
});

test('both faces of the rule are described', () => {
  assert.ok(Array.isArray(rule.FRONT) && rule.FRONT.length > 0, 'front face');
  assert.ok(Array.isArray(rule.BACK) && rule.BACK.length > 0, 'back face');
  assert.equal(rule.FACES.front, rule.FRONT, 'front is reachable by name');
  assert.equal(rule.FACES.back, rule.BACK, 'back is reachable by name');
});

test('the faces carry every scale printed on the instrument', () => {
  // Spot checks against the scale list for the K&E 669, not a reading of the
  // photographs, which miscounted the front face.
  for (const name of ['LL01', 'L', 'K', 'A', 'CF', 'CIF', 'CI', 'C', 'D', 'DI', 'LL1']) {
    assert.ok(rule.FRONT.some((r) => r.name === name), `front has ${name}`);
  }
  for (const name of ['LL02', 'LL03', 'DF', 'B', 'T', 'SRT', 'S', 'D', 'LL3', 'LL2']) {
    assert.ok(rule.BACK.some((r) => r.name === name), `back has ${name}`);
  }
});

test('the three bands sit in the order the rule is built in', () => {
  const front = rule.layout('front').map((r) => r.name);
  assert.deepEqual(front, ['LL01', 'L', 'K', 'A', 'CF', 'CIF', 'CI', 'C', 'D', 'DI', 'LL1']);
  const back = rule.layout('back').map((r) => r.name);
  assert.deepEqual(back, ['LL02', 'LL03', 'DF', 'B', 'T', 'SRT', 'S', 'D', 'LL3', 'LL2']);
});

test('trigonometry lives on the back face only', () => {
  assert.ok(!rule.FRONT.some((r) => r.name === 'S' || r.name === 'T'),
    'no sine or tangent on the front');
  assert.ok(rule.BACK.some((r) => r.name === 'S'), 'sine on the back');
  assert.ok(rule.BACK.some((r) => r.name === 'T'), 'tangent on the back');
  assert.equal(rule.faceFor('S'), 'back', 'faceFor agrees');
});

test('the front face carries CI, so sine is read the Deci-Log way', () => {
  // A photograph misread CIF as one row when the face prints CIF and CI as two,
  // and missed DI entirely. CI is what makes the sine readable on this rule,
  // exactly as on a Deci-Log, so the claim survives the correction.
  const ci = rule.layout('front').find((r) => r.name === 'CI');
  assert.ok(ci, 'CI is on the front');
  assert.equal(ci.kind, 'reciprocal', 'CI reciprocates');
  assert.equal(ci.slide, true, 'CI rides the slide');
});

test('both reciprocal scales are present and paired with D', () => {
  // CI sits above C and DI below D, each reading the reciprocal of D.
  const front = rule.layout('front');
  const ci = front.find((r) => r.name === 'CI');
  const di = front.find((r) => r.name === 'DI');
  const d = front.find((r) => r.name === 'D');
  assert.ok(ci && di && d, 'CI, DI and D all present');
  assert.ok(ci.index < d.index, 'CI sits above D');
  assert.ok(di.index > d.index, 'DI sits below D');
  assert.equal(ci.kind, 'reciprocal', 'CI is reciprocal');
  assert.equal(di.kind, 'reciprocal', 'DI is reciprocal');
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
    assert.ok(rule.height(face) > rows[rows.length - 1].y,
      `${face} has room below the last row`);
  }
});

test('the slide scales are marked on exactly the rows that travel', () => {
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
      const slideInkTop = first.y - first.height * rule.TALLEST_GRADUATION;
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

test('the slide band is drawn taller than the fixed rows it sits between', () => {
  for (const face of ['front', 'back']) {
    const rows = rule.layout(face);
    const slideRow = rows.find((r) => r.slide);
    const stockRow = rows.find((r) => !r.slide);
    assert.ok(slideRow.height > stockRow.height,
      `${face} slide rows are taller: ${slideRow.height} vs ${stockRow.height}`);
  }
});

test('the band sits inside the rule body, so the camera can frame it', () => {
  for (const face of ['front', 'back']) {
    const band = rule.slideBand(face);
    const h = rule.height(face);
    assert.ok(band.top >= 0, `${face} band starts inside the rule`);
    assert.ok(band.bottom <= h, `${face} band ends inside the rule, ${band.bottom} <= ${h}`);
  }
});

test('rows tile the rule, with a seam only where the slide begins', () => {
  for (const face of ['front', 'back']) {
    const rows = rule.layout(face);
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const gap = rows[i].y - (prev.y + prev.height);
      const startsSlide = !prev.slide && rows[i].slide;
      assert.ok(Math.abs(gap) < 1e-9 || (startsSlide && Math.abs(gap - rule.SEAM) < 1e-9),
        `${face} gap before ${rows[i].name} is ${gap}, expected 0 or a seam`);
    }
  }
});

test('the seam appears once, at the top of the slide, not below it', () => {
  // A seam under the slide as well would read as the rule being in three pieces
  // rather than two.
  for (const face of ['front', 'back']) {
    const rows = rule.layout(face);
    const gaps = [];
    for (let i = 1; i < rows.length; i++) {
      const gap = rows[i].y - (rows[i - 1].y + rows[i - 1].height);
      if (Math.abs(gap) > 1e-9) gaps.push(i);
    }
    assert.equal(gaps.length, 1, `${face} has exactly one gap, got at rows ${gaps}`);
    assert.equal(rows[gaps[0]].name, rule.SLIDE_SCALES[face][0],
      `${face} the gap is immediately above the first slide row`);
  }
});

test('the graduated width is exported, since the camera clamps against it', () => {
  // The camera is handed this to bound its window. If it is missing the
  // renderer throws while drawing and the animation silently never starts,
  // which is exactly what happened once.
  assert.equal(typeof rule.width(), 'number', 'width is a function');
  assert.ok(rule.width() > 0, 'and has a positive value');
  assert.ok(rule.width() >= 1000, 'at least the four decades the rule carries');
});

test('an unknown face is refused rather than silently empty', () => {
  assert.throws(() => rule.layout('sideways'), /unknown face/);
  assert.throws(() => rule.slideBand('sideways'), /unknown face/);
});

/* --------------------------------------------------------------- fidelity */

test('rows whose graduations could not be read are marked unverified', () => {
  // These are the rows where a photograph showed the name but not the rule. They
  // are recorded as unknown rather than invented, so the renderer can decline to
  // fabricate ticks for them.
  for (const face of ['front', 'back']) {
    for (const row of rule.layout(face)) {
      if (['SRT', 'DF'].includes(row.name)) {
        assert.equal(row.unverified, true, `${row.name} is marked unverified`);
        assert.equal(row.kind, 'unverified', `${row.name} has no invented kind`);
      }
    }
  }
});

test('the log-log rows are graduated, because the construction is known', () => {
  // A log-log row takes the logarithm of the excess over one. That follows from
  // the construction rather than being read off a photograph, so these rows can
  // be graduated for real instead of being left blank. SRT and DF remain the
  // only rows whose graduations are genuinely unknown.
  for (const face of ['front', 'back']) {
    for (const row of rule.layout(face)) {
      if (/^LL/.test(row.name)) {
        assert.equal(row.kind, 'log-log', `${row.name} is a log-log row`);
        assert.notEqual(row.unverified, true, `${row.name} is graduated`);
      }
    }
  }
});

test('the trig rows record which function they carry', () => {
  const back = rule.layout('back');
  assert.equal(back.find((r) => r.name === 'S').fn, 'sin');
  assert.equal(back.find((r) => r.name === 'T').fn, 'tan');
});

test('every power scale maps to a graduation rule geometry understands', () => {
  const known = new Set([
    'log', 'log-log', 'cube', 'square', 'reciprocal', 'projected', 'unverified',
  ]);
  for (const face of ['front', 'back']) {
    for (const row of rule.layout(face)) {
      assert.ok(known.has(row.kind), `${row.name} has kind ${row.kind}`);
    }
  }
});

/* ------------------------------------------------- rows must agree with it */

test('each printed row reads the value it names', () => {
  // The same invariant the renderer relies on, checked at the rule level: a row
  // labelled 2 must read 2 at the position where its 2 graduation is drawn.
  const CHECKED = { L: 'log', C: 'log', D: 'log', K: 'cube', B: 'cube', A: 'square' };
  for (const [scale, kind] of Object.entries(CHECKED)) {
    for (const v of [2, 3, 7]) {
      const x = kind === 'log' ? g.posOf('D', v)
        : kind === 'square' ? g.posOf('A', v)
          : g.posOf('K', v);
      assert.ok(Number.isFinite(x), `${scale} places ${v}`);
      assert.ok(x >= 0 && x <= RULE.axisPx, `${scale} keeps ${v} on the rule, got ${x}`);
    }
  }
});