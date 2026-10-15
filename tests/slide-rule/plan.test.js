'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { plan } = require('../../docs/slide-rule/plan.js');
const { geometry } = require('../../docs/slide-rule/geometry.js');

const RULE = { axisPx: 1000, decades: 4 };
const g = geometry(RULE);
const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9,
    `${what}: expected ${expected}, got ${actual}`);

const run = (text) => plan(text, RULE);

/* ------------------------------------------------------------ the basics */

test('multiplication reports the true product', () => {
  close(run('2.5 * 3.7').result, 9.25, '2.5 * 3.7');
  close(run('144 * 0.5').result, 72, '144 * 0.5');
  close(run('1e3 * 1e-3').result, 1, '1e3 * 1e-3');
});

test('division reports the true quotient', () => {
  close(run('144 / 12').result, 12, '144 / 12');
  close(run('1 / 8').result, 0.125, '1 / 8');
});

test('powers and roots report the true value', () => {
  close(run('7 ^ 3').result, 343, '7 ^ 3');
  close(run('sqrt(144)').result, 12, 'sqrt(144)');
  close(run('cbrt(27)').result, 3, 'cbrt(27)');
  close(run('4 ^ 0.5').result, 2, '4 ^ 0.5');
  close(run('2 ^ -2').result, 0.25, '2 ^ -2');
});

/* ------------------------------------------------------- the choreography */

test('multiplication sets the slide first, then reads off D', () => {
  const p = run('2.5 * 3.7');
  const slideSteps = p.steps.filter((s) => s.target === 'slide');
  const cursorSteps = p.steps.filter((s) => s.target === 'cursor');
  assert.ok(slideSteps.length >= 1, 'the slide has to move');
  assert.ok(cursorSteps.length >= 1, 'the cursor has to move');

  // The slide lands with C's index against the multiplicand on D.
  close(p.steps.at(-1).to, g.posOf('D', 9.25), 'final cursor position');
});

test('every step carries narration the user could follow on a real rule', () => {
  for (const text of ['2.5 * 3.7', '144 / 12', '7 ^ 3', 'sqrt(144)']) {
    const p = run(text);
    assert.ok(p.steps.length > 0, `${text} has steps`);
    for (const step of p.steps) {
      assert.ok(['slide', 'cursor'].includes(step.target), `${text} step target`);
      assert.equal(typeof step.say, 'string', `${text} step narration`);
      assert.ok(step.say.length > 10, `${text} narration says something`);
    }
  }
});

test('the slide returns home for operations that need no offset', () => {
  // Roots and powers are read directly off a scale with the slide at rest.
  const p = run('sqrt(144)');
  const finalSlide = p.steps.filter((s) => s.target === 'slide').at(-1);
  if (finalSlide) close(finalSlide.to, 0, 'slide ends at home');
});

test('a step log accompanies the steps for the UI', () => {
  const p = run('2.5 * 3.7');
  assert.ok(Array.isArray(p.log) && p.log.length > 0, 'has a log');
  for (const entry of p.log) {
    assert.equal(typeof entry, 'string', 'log entries are sentences');
    assert.ok(entry.length > 5, `log entry says something: ${entry}`);
  }
});

/* --------------------------------------------------- reading and accuracy */

test('a reading is reported as close as the rule could actually resolve', () => {
  const p = run('2.5 * 3.7');
  assert.ok(p.reading !== null, 'has a reading');
  assert.ok(p.error !== undefined, 'has an error figure');
  // The rule interpolates between graduations, so it should land very near the
  // true value rather than snapping to some coarse grid.
  close(p.reading, 9.25, 'reading matches the product');
  assert.ok(Math.abs(p.error) < 0.001, `error is small, got ${p.error}`);
});

/* ------------------------------------------------ decade normalisation */

test('an operand past the left edge is normalised rather than refused', () => {
  // 0.0004 sits four decades left of the rule's index, so the divisor is scaled
  // onto the rule and the shift removed from the answer afterwards.
  const p = run('1 / 0.0004');
  close(p.result, 2500, '1 / 0.0004');
  assert.ok(p.normalised, 'reports that it normalised');
  assert.equal(p.shift, 4, 'shifted by four decades');

  // The quotient can still be read on the overhang, which is where a physical
  // rule's slide sticks out past the stock. So a negative step position is
  // legitimate here, unlike a step past the right edge which nothing can reach.
  for (const step of p.steps) {
    assert.ok(step.to <= RULE.axisPx,
      `no step runs off the right edge, got ${step.to}`);
  }
});

test('normalisation reports the shift so the narration can explain it', () => {
  const p = run('1 / 0.0004');
  assert.ok(p.normalised, 'flagged');
  assert.equal(typeof p.shift, 'number', 'has a decade shift');
  assert.ok(p.shift !== 0, 'shift is non zero');
  assert.ok(p.notes.some((n) => /decade|shift/i.test(n)),
    `explains the shift, got ${JSON.stringify(p.notes)}`);
});

test('a result that overflows the right edge is refused, not silently wrong', () => {
  // 1e4 squared needs eight decades, twice what the rule has.
  const p = run('1e4 ^ 2');
  assert.ok(p.limits.length > 0 || p.notes.length > 0, 'reports a limit');
  const said = [...p.limits, ...p.notes].join(' ');
  assert.match(said, /range|decade|rule|scale|fit/i);
});

test('cosine is read as sine of the complement, not from a C scale', () => {
  // There is no C scale on a slide rule. Asking S for the cosine directly reads
  // sin(cos t) and gives a plausible looking wrong answer.
  const p = run('cos(60)');
  close(p.result, 0.5, 'cos(60)');
  close(p.reading, 0.5, 'reading');
  assert.ok(p.notes.some((n) => /complement/i.test(n)),
    `explains the complement, got ${JSON.stringify(p.notes)}`);
  // The cursor belongs at 30 degrees, not 60.
  close(p.steps[0].to, g.posOf('S', 30), 'cursor sits at the complement');
});

test('a cube is not mistaken for a cube root', () => {
  // pow(343, 1/3) == 7 too, so testing whether the value round trips would
  // label this a root and put the cursor on 343, reading 49.
  const p = run('7 ^ 3');
  assert.equal(p.operation, 'power', 'reported as a power');
  close(p.result, 343, '7 ^ 3');
  close(p.reading, 343, 'reading');
  close(p.steps[0].to, g.posOf('K', 7), 'cursor on the base');
});

test('a normalised division reads the true answer, not the shifted one', () => {
  // The divisor is scaled onto the rule, so the rule reads too large by that
  // factor until the shift is taken back off.
  const p = run('1 / 0.0004');
  close(p.result, 2500, 'true result');
  close(p.reading, 2500, 'reading matches after the shift is undone');
  assert.ok(p.error < 1e-6, `error is negligible, got ${p.error}`);
});

test('an unrepresentable case still reports the true arithmetic', () => {
  // Even when the rule cannot show it, 1e8 is 1e8.
  const p = run('1e4 ^ 2');
  close(p.result, 1e8, 'true value preserved');
});

/* -------------------------------------------------- unsupported for now */

test('inverse trig is refused with an explanation, not guessed at', () => {
  for (const text of ['asin(0.5)', 'acos(0.25)', 'atan(1)']) {
    const p = run(text);
    assert.equal(p.supported, false, `${text} unsupported`);
    assert.ok(p.notes.some((n) => /not (yet )?implemented|coming/i.test(n)),
      `${text} says why, got ${JSON.stringify(p.notes)}`);
    assert.equal(p.steps.length, 0, `${text} has no steps`);
  }
});

test('sine, cosine and tangent are supported', () => {
  close(run('sin(30)').result, 0.5, 'sin(30)');
  close(run('cos(60)').result, 0.5, 'cos(60)');
  close(run('tan(45)').result, 1, 'tan(45)');
  assert.equal(run('sin(30)').supported, true, 'sin supported');
});

/* ---------------------------------------------------------------- errors */

test('a parse failure surfaces as an unsupported plan with the message', () => {
  const p = plan('2 +', RULE);
  assert.equal(p.supported, false);
  assert.ok(/unexpected|end of expression/i.test(p.notes[0]), `carries the message, got ${p.notes[0]}`);
});

test('addition is not quietly treated as multiplication', () => {
  // A slide rule cannot add. Saying so is the honest answer.
  const p = run('2 + 3');
  assert.equal(p.supported, false);
  assert.ok(p.notes.some((n) => /add/i.test(n)), `mentions addition, got ${JSON.stringify(p.notes)}`);
});

test('subtraction is likewise refused', () => {
  const p = run('10 - 3');
  assert.equal(p.supported, false);
  assert.ok(p.notes.some((n) => /subtract|-/i.test(n)), `mentions subtraction, got ${JSON.stringify(p.notes)}`);
});