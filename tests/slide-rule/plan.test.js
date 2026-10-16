'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { plan } = require('../../docs/slide-rule/plan.js');
const { geometry } = require('../../docs/slide-rule/geometry.js');
const rule669 = require('../../docs/slide-rule/rule669.js');

const RULE = { axisPx: rule669.AXIS_W, decades: 1 };
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
  assert.equal(p.steps.filter((s) => s.target === 'slide').length, 0,
    'a root moves the cursor and nothing else');
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

test('an operand outside the rule is carried in, rather than refused', () => {
  // The stock carries one decade, so 0.0004 is four decades below anything it
  // can set. It is brought up to its own mantissa -- 4 -- and the decades are
  // put back on the answer, which is how a person uses a rule this short.
  const p = run('1 / 0.0004');
  close(p.result, 2500, '1 / 0.0004');
  close(p.reading, 2500, 'and the rule arrives at it');
  assert.ok(p.notes.some((n) => /decade/i.test(n)),
    `explains the carrying, got ${JSON.stringify(p.notes)}`);

  // Every step lands on the rule, because the operands were brought onto it.
  // Slide offsets may be negative -- the bar travels left of home to divide
  // below one -- but never further than its own length.
  for (const step of p.steps) {
    if (step.target === 'slide') {
      assert.ok(Math.abs(step.to) <= RULE.axisPx + 1e-6,
        `the slide stays within its travel, got ${step.to}`);
    } else {
      assert.ok(step.to >= -1e-6 && step.to <= RULE.axisPx + 1e-6,
        `the cursor stays on the rule, got ${step.to}`);
    }
  }
});

test('an operand above ten is brought down to its mantissa', () => {
  // The whole of what "placing the decimal point" means on this instrument:
  // 144 is set as 1.44, and the hundreds are carried back out of the answer.
  const p = run('144 / 12');
  close(p.result, 12, '144 / 12');
  close(p.reading, 12, 'the rule reads it');
  assert.ok(p.notes.some((n) => /1\.44|mantissa|decade/i.test(n)),
    `explains the carriage, got ${JSON.stringify(p.notes)}`);
  for (const step of p.steps) {
    assert.ok(step.to <= RULE.axisPx + 1e-6 && step.to >= -1e-6,
      `no step runs off the rule, got ${step.to}`);
  }
});

test('multiplication past ten uses the right-hand index, as a reader would', () => {
  // 8 times 9 is 72, which does not fit the stock's decade read against C's
  // left index. A reader sets the same slide and reads against the right index,
  // one place smaller. The instrument carries an index at each end for this.
  const p = run('8 * 9');
  close(p.result, 72, '8 * 9');
  close(p.reading, 72, 'and the rule reads it');
  assert.ok(p.notes.some((n) => /index/i.test(n)),
    `says which index was read, got ${JSON.stringify(p.notes)}`);
  const last = p.steps.at(-1);
  assert.ok(last.to <= RULE.axisPx, 'and the cursor stays on the stock');
});

test('a result that overflows the right edge is refused, not silently wrong', () => {
  // 1e4 squared needs eight decades, far more than the rule has.
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
  // label this a root, put the cursor on the wrong scale and read 1.913.
  const p = run('7 ^ 3');
  assert.equal(p.operation, 'power', 'reported as a power');
  close(p.result, 343, '7 ^ 3');
  close(p.reading, 343, 'reading');
  // The base goes on D and the answer is read on K, which is the direction the
  // rule works in: K is D's graduations compressed three times, so D's 7 sits
  // under K's 343.
  close(p.steps[0].to, g.posOf('D', 7), 'cursor on the base, on D');
});

test('a cube root puts the cursor on the radicand on K and reads D', () => {
  const p = run('cbrt(250)');
  assert.equal(p.operation, 'root', 'reported as a root');
  close(p.result, 6.299605249474365, 'cbrt(250)');
  close(p.reading, 6.299605249474365, 'reading');
  close(p.steps[0].to, g.posOf('K', 250), 'cursor on the radicand, on K');
});

test('a square root carries an even number of decades, so the answer is a decade clear', () => {
  // A carries two decades of value, so half a decade of shift is not a decade
  // anyone could place. sqrt(1500) is therefore set as 15 on A, whose D reading
  // is 3.873, and the reader carries two decades: 38.73.
  const p = run('sqrt(1500)');
  close(p.result, 38.72983346207417, 'sqrt(1500)');
  close(p.reading, 38.72983346207417, 'reading');
  close(p.steps[0].to, g.posOf('A', 15), 'cursor on 15 on A, not 1500');
});

test('a normalised division reads the true answer, not the shifted one', () => {
  // The operands are brought onto the rule, so the rule reads the mantissas'
  // quotient and the decades are carried out of it.
  const p = run('12 / 144');
  close(p.result, 0.08333333333333333, 'true result');
  close(p.reading, 0.08333333333333333, 'reading with the decades carried back');
  assert.ok(p.error < 1e-9, `error is negligible, got ${p.error}`);
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