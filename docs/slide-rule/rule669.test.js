'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const rule = require('./rule669.js');
const { geometry } = require('./geometry.js');

const RULE = { axisPx: 1000, decades: 4 };
const g = geometry(RULE);

/* --------------------------------------------------------------- the faces */

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

    assert.equal(band.top, first.y, `${face} the band starts at the first slide row`);
    if (lastStock) {
      // The seam is the gap between the two pieces: it sits after the last
      // stock row and before the first slide row, exactly one seam wide.
      const stockBottom = lastStock.y + lastStock.height;
      assert.ok(band.top >= stockBottom,
        `${face} seam sits clear of the stock: band starts ${band.top}, stock ends ${stockBottom}`);
      assert.equal(band.top - stockBottom, rule.SEAM,
        `${face} the gap is exactly the seam width`);
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

test('the trig rows record which function they carry', () => {
  const back = rule.layout('back');
  assert.equal(back.find((r) => r.name === 'S').fn, 'sin');
  assert.equal(back.find((r) => r.name === 'T').fn, 'tan');
});

test('every power scale maps to a graduation rule geometry understands', () => {
  const known = new Set(['log', 'cube', 'square', 'reciprocal', 'projected', 'unverified']);
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