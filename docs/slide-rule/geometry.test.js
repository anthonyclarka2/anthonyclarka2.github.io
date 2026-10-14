'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { geometry } = require('./geometry.js');

// Expected values are worked examples with independently known answers (the
// arithmetic itself), never the log formulas the module implements. A test that
// recomputes log10(v) * dpx to check log10(v) * dpx passes by construction and
// can never disagree with the code.
const AXIS = { axisPx: 1000, decades: 4 };
const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9,
    `${what}: expected ${expected}, got ${actual}`);

test('the rule reports its own dimensions', () => {
  // Callers need these to reason about what fits. Without them a bounds check
  // compares against undefined and rejects everything.
  const g = geometry(AXIS);
  assert.equal(g.axisPx, 1000);
  assert.equal(g.decades, 4);
  assert.equal(g.dpx, 250);
});

test('a decade occupies exactly a quarter of a four decade rule', () => {
  const g = geometry(AXIS);
  close(g.posOf('D', 1), 0, 'D at 1');
  close(g.posOf('D', 10), 250, 'D at 10');
  close(g.posOf('D', 100), 500, 'D at 100');
  close(g.posOf('D', 1000), 750, 'D at 1000');
});

test('multiplication reads the product off D once C index sits on the multiplicand', () => {
  const g = geometry(AXIS);
  // 2.5 * 3.7 = 9.25, the example verified while planning the rule.
  const slideX = g.posOf('D', 2.5);
  close(g.read('D', g.posOf('C', 3.7) + slideX), 9.25, '2.5 * 3.7');
});

test('division reads the quotient off D once the dividend sits over the divisor', () => {
  const g = geometry(AXIS);
  // 144 / 12 = 12
  const slideX = g.posOf('C', 144) - g.posOf('D', 12);
  close(g.read('D', g.posOf('C', 1) + slideX), 12, '144 / 12');
});

test('division across a decade boundary still lands on the quotient', () => {
  const g = geometry(AXIS);
  // 0.0025 / 4 = 0.000625, an answer that sits four decades down the scale.
  const slideX = g.posOf('C', 0.0025) - g.posOf('D', 4);
  close(g.read('D', g.posOf('C', 1) + slideX), 0.000625, '0.0025 / 4');
});

test('slide offsets cancel, so the slide can return to its home position', () => {
  const g = geometry(AXIS);
  // Setting a value against itself must put the C index back on the D index.
  close(g.posOf('C', 6.25) - g.posOf('D', 6.25), 0, 'home offset');
});

test('the A scale squares: its 7 graduation sits where D reads 49', () => {
  const g = geometry(AXIS);
  close(g.read('D', g.posOf('A', 7)), 49, 'D under A 7');
  close(g.read('A', g.posOf('D', 49)), 7, 'A over D 49');
});

test('the K and B scales cube: their 7 graduation sits where D reads 343', () => {
  const g = geometry(AXIS);
  close(g.read('D', g.posOf('K', 7)), 343, 'D under K 7');
  close(g.read('D', g.posOf('B', 7)), 343, 'D under B 7');
  close(g.read('K', g.posOf('D', 27)), 3, 'K over D 27');
});

test('C| shares the A graduation exactly, since both take the square root', () => {
  const g = geometry(AXIS);
  close(g.posOf('C|', 7), g.posOf('A', 7), 'C| aligned with A');
  close(g.read('C|', g.posOf('D', 100)), 10, 'C| over D 100');
});

test('a displaced slide carries its scales with it and leaves stock scales put', () => {
  const g = geometry(AXIS);
  const oneDecade = 250;
  // The slide has been pushed right by a decade. C|'s 100 graduation, which
  // lives two decades along its own axis, is now one decade further right,
  // while A's identical graduation has not moved at all.
  close(g.read('C|', g.posOf('C|', 100) + oneDecade, oneDecade), 100,
    'C| travels with the slide');
  close(g.read('A', g.posOf('A', 100), oneDecade), 100,
    'A stays put');
  close(g.read('A', g.posOf('A', 100), 0), g.read('A', g.posOf('A', 100), oneDecade),
    'A ignores the slide offset argument');
});

test('CI reciprocates, which is what puts sine on the rule', () => {
  const g = geometry(AXIS);
  close(g.read('CI', g.posOf('D', 4)), 0.25, 'CI over D 4');
  close(g.posOf('CI', 4), -g.posOf('D', 4), 'CI runs against D');
});

test('the Ln scale reads the natural log of whatever D shows', () => {
  const g = geometry(AXIS);
  close(g.read('Ln', g.posOf('D', 1)), 0, 'ln(1)');
  close(g.read('Ln', g.posOf('D', Math.E)), 1, 'ln(e)');
  close(g.read('Ln', g.posOf('D', 1000)), 6.907755278982137, 'ln(1000)');
});

test('S sits 90 degrees on its index and runs smaller angles to the right', () => {
  const g = geometry(AXIS);
  close(g.posOf('S', 90), 0, 'S 90');
  assert.ok(g.posOf('S', 30) > g.posOf('S', 60), '30 right of 60');
  assert.ok(g.posOf('S', 10) > g.posOf('S', 30), '10 right of 30');
  assert.ok(g.posOf('S', 30) > 0, 'S stays on the rule');
});

test('the S graduation for 30 sits where CI reads a half', () => {
  const g = geometry(AXIS);
  // The load-bearing consequence of the projection: D underneath reads
  // cosecant, not sine, so the sine has to be read off CI instead.
  close(g.read('CI', g.posOf('S', 30)), 0.5, 'CI under S 30');
  close(g.read('D', g.posOf('S', 30)), 2, 'D under S 30');
  close(g.read('CI', g.posOf('S', 60)), 0.8660254037844387, 'CI under S 60');
});

test('T sits 45 degrees on its index, where CI reads one', () => {
  const g = geometry(AXIS);
  close(g.posOf('T', 45), 0, 'T 45');
  close(g.read('CI', g.posOf('T', 45)), 1, 'CI under T 45');
  close(g.read('CI', g.posOf('T', 30)), 0.5773502691896257, 'CI under T 30');
});

test('tangent above 45 degrees runs onto the slide overhang, left of the index', () => {
  const g = geometry(AXIS);
  // Tangent exceeds one above 45 degrees, so those graduations fall below zero.
  // That is not a bug: on a physical rule the slide protrudes to the left and
  // those marks are visible there. The renderer draws the overhang.
  assert.ok(g.posOf('T', 60) < 0, 'T 60 left of index');
  close(g.read('CI', g.posOf('T', 60)), 1.7320508075688772, 'CI under T 60');
});

test('read inverts posOf across the projected scales', () => {
  const g = geometry(AXIS);
  for (const angle of [1, 12, 30, 45, 60, 80, 89]) {
    close(g.read('S', g.posOf('S', angle)), angle, `S round trip at ${angle}`);
    close(g.read('T', g.posOf('T', angle)), angle, `T round trip at ${angle}`);
  }
});