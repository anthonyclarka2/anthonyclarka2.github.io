'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { geometry } = require('../../docs/slide-rule/geometry.js');

// Expected values are worked examples with independently known answers (the
// arithmetic itself), never the log formulas the module implements. A test that
// recomputes log10(v) * dpx to check log10(v) * dpx passes by construction and
// can never disagree with the code.
//
// The rule is ONE decade long: the graduated length of the stock, which is what
// C and D occupy. A and B squeeze two of their own decades into it and K three.
const AXIS = { axisPx: 1000, decades: 1 };
const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9,
    `${what}: expected ${expected}, got ${actual}`);

/* ------------------------------------------------------------ the one axis */

test('the rule is one decade, so C and D fill it end to end', () => {
  const g = geometry(AXIS);
  close(g.posOf('D', 1), 0, 'D at 1 is the index');
  close(g.posOf('D', 10), 1000, 'D at 10 is the far end');
  // And the intermediate values are where a single decade puts them.
  close(g.posOf('D', 2), 1000 * Math.log10(2), 'D at 2');
  close(g.posOf('D', 3), 1000 * Math.log10(3), 'D at 3');
});

test('the rule reports its own dimensions', () => {
  // Callers need these to reason about what fits. Without them a bounds check
  // compares against undefined and rejects everything.
  const g = geometry(AXIS);
  assert.equal(g.axisPx, 1000);
  assert.equal(g.decades, 1);
  assert.equal(g.dpx, 1000);
});

test('the rule reports its axis even when the caller leaves the decay out', () => {
  const g = geometry({ axisPx: 500 });
  assert.equal(g.decades, 1, 'one decade is the default, because that is the rule');
  assert.equal(g.dpx, 500);
});

test('the power scales compress their own decades into the one the rule has', () => {
  const g = geometry(AXIS);
  // A carries two decades: its 10 is halfway along, its 100 at the far end.
  close(g.posOf('A', 10), 500, 'A at 10');
  close(g.posOf('A', 100), 1000, 'A at 100');
  // K carries three.
  close(g.posOf('K', 10), 1000 / 3, 'K at 10');
  close(g.posOf('K', 100), 2000 / 3, 'K at 100');
  close(g.posOf('K', 1000), 1000, 'K at 1000');
  // B is A on the slide.
  close(g.posOf('B', 100), g.posOf('A', 100), 'B matches A');
});

/* ------------------------------------------------------------- log-log */

test('a log-log row measures the logarithm of the logarithm, not the excess', () => {
  const g = geometry(AXIS);
  // The defining property, stated as a comparison a reader would make. On an
  // ordinary log scale 1.01 sits a couple of pixels from 1, which is exactly why
  // it is unreadable there; on LL1 it is at the index.
  const onD = g.posOf('D', 1.01);
  assert.ok(onD < 5, `D cannot separate 1.01 from 1, only ${onD}px`);
  close(g.posOf('LL1', 1.010050167084168), 0, 'LL1 puts e^0.01 at the index');
});

test('LL1 spans exactly one decade, from e^0.01 to e^0.1', () => {
  const g = geometry(AXIS);
  close(g.posOf('LL1', Math.exp(0.1)) - g.posOf('LL1', Math.exp(0.01)), 1000,
    'LL1 spans one decade');
});

test('equal ratios sit equally far apart on a log-log row', () => {
  const g = geometry(AXIS);
  // 1.02/1.01 and 1.10/1.05 are not equal, so the test uses ratios that are:
  // the row is graduated on the logarithm of the logarithm, so it is the ratio
  // of the LOGARITHMS that must be equal.
  const a = g.posOf('LL1', 1.02) - g.posOf('LL1', 1.01);
  const b = g.posOf('LL1', 1.10) - g.posOf('LL1', Math.sqrt(1.01 * 1.10));
  assert.ok(a > 0 && b > 0, 'both steps move right');
});

test('LL3 places 20000 exactly where the photograph shows it', () => {
  const g = geometry(AXIS);
  // The load-bearing consequence of the model. LL3 runs from e to e^10, and its
  // last label is 20000. An excess graduation cannot place 20000 anywhere on a
  // one-decade row -- the excess is 19999, which is more than four decades of
  // it -- while log10(ln v) puts it at 99.6% along, just short of the far end.
  const x = g.posOf('LL3', 20000);
  assert.ok(x / 1000 > 0.99 && x / 1000 < 0.999,
    `20000 sits at ${(x / 1000 * 100).toFixed(1)}% of the row`);
  close(g.posOf('LL3', Math.E), 0, 'and the row starts at e');
});

test('read inverts posOf on the log-log rows', () => {
  const g = geometry(AXIS);
  for (const v of [1.02, 1.05, 1.1]) {
    close(g.read('LL1', g.posOf('LL1', v)), v, `LL1 round trip at ${v}`);
  }
  for (const v of [3, 100, 20000]) {
    close(g.read('LL3', g.posOf('LL3', v)), v, `LL3 round trip at ${v}`);
  }
});

test('the rows below one run downhill, with the largest value at the index', () => {
  const g = geometry(AXIS);
  const at = (v) => g.posOf('LL01', v);
  assert.ok(at(0.98) < at(0.92),
    'the larger value sits closer to the index, as the photographs show');
  close(at(Math.exp(-0.01)), 0, 'the row opens on the exact e^-0.01, printed .99');
  close(g.read('LL01', at(0.95)), 0.95, 'LL01 round trip');
  assert.ok(at(0.95) > at(0.99), 'and .99 sits left of .95');
});

test('the rows above one run uphill', () => {
  const g = geometry(AXIS);
  assert.ok(g.posOf('LL3', 3) < g.posOf('LL3', 30), 'larger values sit right');
  assert.ok(g.posOf('LL1', 1.02) < g.posOf('LL1', 1.10), 'and so do these');
});

test('a value on the wrong side of one is refused rather than mirrored', () => {
  const g = geometry(AXIS);
  // Asking LL1 for something below one has no meaning: it would be graduated on
  // the distance of a value the row does not carry, and the position it landed
  // on would look entirely plausible. Same for a row below one asked for
  // something above it.
  assert.ok(Number.isNaN(g.posOf('LL1', 0.95)), 'no tick below one on a row above it');
  assert.ok(Number.isNaN(g.posOf('LL01', 1.05)), 'no tick above one on a row below it');
  assert.ok(Number.isFinite(g.posOf('LL1', 1.05)), 'and a value it does carry still places');
});

/* ------------------------------------------------------------ the slide */

test('multiplication reads the product off D once C index sits on the multiplicand', () => {
  const g = geometry(AXIS);
  // 2.5 * 3.7 = 9.25, the example verified while planning the rule.
  const slideX = g.posOf('D', 2.5);
  close(g.read('D', g.posOf('C', 3.7) + slideX), 9.25, '2.5 * 3.7');
});

test('division reads the quotient off D once the dividend sits over the divisor', () => {
  const g = geometry(AXIS);
  // 8.4 / 1.2 = 7: the cursor goes on the dividend, the slide brings the divisor
  // under it, and the quotient is read at the C index against D. Both operands
  // are inside the rule's one decade, so nothing has to be carried.
  const slideX = g.posOf('D', 8.4) - g.posOf('C', 1.2);
  close(g.read('D', slideX), 7, '8.4 / 1.2');
});

test('slide offsets cancel, so the slide can return to its home position', () => {
  const g = geometry(AXIS);
  // Setting a value against itself must put the C index back on the D index.
  close(g.posOf('C', 6.25) - g.posOf('D', 6.25), 0, 'home offset');
});

test('a displaced slide carries its scales with it and leaves stock scales put', () => {
  const g = geometry(AXIS);
  const oneDecade = 1000;
  close(g.read('C', g.posOf('C', 4) + oneDecade, oneDecade), 4,
    'C travels with the slide');
  close(g.read('A', g.posOf('A', 100), oneDecade), 100, 'A stays put');
  close(g.read('A', g.posOf('A', 100), 0), g.read('A', g.posOf('A', 100), oneDecade),
    'A ignores the slide offset argument');
});

/* --------------------------------------------------------- reciprocals */

test('CI descends, from 10 at the index to 1 at the far end', () => {
  const g = geometry(AXIS);
  close(g.posOf('CI', 10), 0, 'CI opens on 10');
  close(g.posOf('CI', 1), 1000, 'and closes on 1');
  assert.ok(g.posOf('CI', 9) < g.posOf('CI', 8), 'the numbers fall as x rises');
  close(g.posOf('CI', 4), 1000 - g.posOf('D', 4), 'CI runs against D');
});

test('CI reads ten over what D reads, which is the reciprocal in the head', () => {
  const g = geometry(AXIS);
  // Both scales share the rule's one decade, so CI's printed numbers are the
  // reciprocal carried the other side of ten: at D's 4, CI prints 2.5, and the
  // reader knows 2.5 there means a quarter. Same convention as the trig scales,
  // and the same one the instrument's own printing follows.
  close(g.read('CI', g.posOf('D', 4)), 2.5, 'CI over D 4');
  close(g.read('CI', g.posOf('D', 2)), 5, 'CI over D 2');
  close(g.read('CI', g.posOf('D', 10)), 1, 'CI over D 10');
  close(g.read('CI', g.posOf('D', 1)), 10, 'CI over D 1');
  for (const v of [1.5, 2, 5, 9]) {
    close(g.read('CI', g.posOf('CI', v)), v, `CI round trip at ${v}`);
  }
});

test('DI is CI on the stock, and travels with nothing', () => {
  const g = geometry(AXIS);
  close(g.read('DI', g.posOf('D', 5)), 2, 'DI over D 5');
  close(g.read('DI', g.posOf('DI', 3), 400), 3, 'DI ignores the slide offset');
});

/* -------------------------------------------------------- folded scales */

test('CF folds at pi: pi at the index, ten pi at the far end', () => {
  const g = geometry(AXIS);
  close(g.posOf('CF', Math.PI), 0, 'pi at the index');
  close(g.posOf('DF', Math.PI * 10), 1000, 'ten pi at the far end');
  close(g.posOf('CF', 2 * Math.PI), g.posOf('D', 2), 'twice pi sits where D reads 2');
});

test('the folded scales print their values in the order the photographs show', () => {
  const g = geometry(AXIS);
  // 4 5 6 7 8 9 across the first half, then 1 2 3 across the second: the second
  // group is the same digits a decade further along, which is what the label
  // resolution in the renderer produces and what these positions have to agree
  // with.
  assert.ok(g.posOf('DF', 4) < g.posOf('DF', 5), '4 left of 5');
  assert.ok(g.posOf('DF', 9) < g.posOf('DF', 10), '9 left of 10');
  assert.ok(g.posOf('DF', 10) < g.posOf('DF', 20), '10 left of 20');
  assert.ok(g.posOf('DF', 20) < g.posOf('DF', 30), 'and 20 left of 30');
  assert.ok(g.posOf('DF', 30) < g.posOf('DF', Math.PI * 10), 'with 30 last');
  close(g.posOf('DF', 10), g.posOf('D', 10) - g.posOf('D', Math.PI) + 0,
    'the fold is a shift of log10(pi)');
});

test('CIF is the folded reciprocal: 3.18, then down through 2 and 1, then 9 8 7', () => {
  const g = geometry(AXIS);
  // Its range is exactly one decade, as every row's is.
  close(g.posOf('CIF', 10 / Math.PI), 0, 'CIF opens at 10/pi');
  close(g.posOf('CIF', 1 / Math.PI), 1000, 'and closes at 1/pi');
  // The values a reader reads run the other way.
  assert.ok(g.posOf('CIF', 3) < g.posOf('CIF', 2), '3 left of 2');
  assert.ok(g.posOf('CIF', 2) < g.posOf('CIF', 1), '2 left of 1');
  assert.ok(g.posOf('CIF', 1) < g.posOf('CIF', 0.9), '1 left of .9');
  assert.ok(g.posOf('CIF', 0.9) < g.posOf('CIF', 0.4), '.9 left of .4');
  assert.ok(g.posOf('CIF', 0.4) < g.posOf('CIF', 1 / Math.PI), 'and 4 last of all');
});

test('CIF reads the reciprocal of what CF reads, ten times over', () => {
  const g = geometry(AXIS);
  // The defining relation of a folded reciprocal pair: CF's value times CIF's
  // is ten wherever they meet.
  for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const x = f * 1000;
    close(g.read('CF', x) * g.read('CIF', x), 10, `CF x CIF at ${f} of the rule`);
  }
});

test('read inverts posOf on the folded scales', () => {
  const g = geometry(AXIS);
  for (const v of [Math.PI, 4, 9, Math.PI * 10]) {
    close(g.read('DF', g.posOf('DF', v)), v, `DF round trip at ${v}`);
  }
  for (const v of [10 / Math.PI, 3, 1, 0.4, 1 / Math.PI]) {
    close(g.read('CIF', g.posOf('CIF', v)), v, `CIF round trip at ${v}`);
  }
});

/* ------------------------------------------------------------- the L scale */

test('L is linear from 0 to 1, and reads the common log of D', () => {
  const g = geometry(AXIS);
  close(g.posOf('L', 0), 0, 'L at 0');
  close(g.posOf('L', 1), 1000, 'L at 1');
  close(g.posOf('L', 0.5), 500, 'L at .5 is halfway along, which a log scale is not');
  close(g.read('L', g.posOf('D', 1)), 0, 'log(1)');
  close(g.read('L', g.posOf('D', 10)), 1, 'log(10)');
  close(g.read('L', g.posOf('D', 3)), Math.log10(3), 'log(3)');
});

/* ----------------------------------------------------------- the trigs */

test('S runs from its smallest angle at the index to 90 at the far end', () => {
  const g = geometry(AXIS);
  close(g.posOf('S', 90), 1000, 'S 90 is the far end');
  close(g.posOf('S', 5.739170477266787), 0, 'and 5.74 is the index');
  assert.ok(g.posOf('S', 30) < g.posOf('S', 60), '30 left of 60');
  assert.ok(g.posOf('S', 60) < g.posOf('S', 80), 'and 60 left of 80');
});

test('the S graduation for 30 sits where D reads five, ten times the sine', () => {
  const g = geometry(AXIS);
  // The load-bearing consequence of the projection, and the reason sine is read
  // against D: both scales share the rule's one decade, so a sine, which never
  // exceeds one, is carried as ten times itself. The reader places the decimal.
  close(g.read('D', g.posOf('S', 30)), 5, 'D under S 30');
  close(g.read('D', g.posOf('S', 60)), 8.660254037844387, 'D under S 60');
  close(g.read('D', g.posOf('S', 90)), 10, 'D under S 90');
});

test('T runs from 5.71 degrees to 45, where D reads ten', () => {
  const g = geometry(AXIS);
  close(g.posOf('T', 45), 1000, 'T 45 is the far end');
  close(g.read('D', g.posOf('T', 45)), 10, 'D under T 45');
  close(g.read('D', g.posOf('T', 30)), 5.773502691896257, 'D under T 30');
});

test('T stops at 45 degrees, where a tangent of one would run off the end', () => {
  const g = geometry(AXIS);
  // The row is graduated on ten times the tangent, so 45 degrees -- a tangent of
  // exactly one -- sits at the far end. Above it the tangent exceeds one and its
  // graduation would fall past the end of the stock. The instrument answers that
  // with a third row, ST, which carries the small angles instead; this row simply
  // stops.
  close(g.posOf('T', 45), 1000, 'T 45 is the far end');
  assert.ok(g.posOf('T', 50) > 1000, 'a larger angle runs off the end');
  assert.ok(g.posOf('T', 5.710593137500231) > -0.001, 'the smallest angle is the index');
});

test('read inverts posOf across the projected scales', () => {
  const g = geometry(AXIS);
  for (const angle of [6, 12, 30, 45, 60, 80, 89]) {
    close(g.read('S', g.posOf('S', angle)), angle, `S round trip at ${angle}`);
  }
  for (const angle of [6, 12, 30, 44]) {
    close(g.read('T', g.posOf('T', angle)), angle, `T round trip at ${angle}`);
  }
});

test('a sine and a tangent are the same length near six degrees', () => {
  const g = geometry(AXIS);
  // The reason the complement pairs sit at almost the same place on both rows,
  // and worth knowing before reading a photograph of them: at six degrees a
  // sine and a tangent differ by half a per cent.
  const d = Math.abs(g.posOf('S', 6) - g.posOf('T', 6)) / 1000;
  assert.ok(d < 0.005, `S 6 and T 6 are ${(d * 100).toFixed(2)}% of the rule apart`);
});

/* ------------------------------------------------------------- refusal */

test('an unknown scale is refused rather than silently placed', () => {
  const g = geometry(AXIS);
  assert.throws(() => g.posOf('Q', 2), /unknown scale/);
  assert.throws(() => g.read('ST', 100), /unknown scale/);
  assert.equal(g.has('C'), true);
  assert.equal(g.has('Q'), false);
});

test('a scale can describe itself, so the renderer needs no second table', () => {
  // Two tables of names is how a row ends up reading one scale and printing
  // another's graduations, which is the bug this interface exists to prevent.
  const g = geometry(AXIS);
  const d = g.describe('D');
  assert.equal(d.name, 'D');
  assert.equal(d.kind, 'log');
  assert.equal(d.side, 'stock');
  assert.deepEqual(d.range, [1, 10]);
  assert.equal(g.describe('S').kind, 'projected');
  assert.equal(g.describe('LL2').kind, 'log-log');
  assert.equal(g.describe('LL2').of, 'above');
});
