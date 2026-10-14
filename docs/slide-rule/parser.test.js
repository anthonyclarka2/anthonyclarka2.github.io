'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parse, evaluate, ParseError } = require('./parser.js');

// Expected values are worked examples with independently known answers. Where a
// result is irrational the literal is stated in full and compared with a
// tolerance, so the test would fail if precedence or angle units were wrong.
const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9,
    `${what}: expected ${expected}, got ${actual}`);

const run = (text) => evaluate(parse(text));

/* ------------------------------------------------------------------ numbers */

test('plain arithmetic in either operator spelling', () => {
  close(run('2.5 * 3.7'), 9.25, '2.5 * 3.7');
  close(run('144 / 12'), 12, '144 / 12');
  close(run('7 + 8'), 15, '7 + 8');
  close(run('7 - 8'), -1, '7 - 8');
  close(run('2.5×3.7'), 9.25, 'unicode times');
  close(run('144 ÷ 12'), 12, 'unicode divides');
});

test('scientific notation survives parsing', () => {
  close(run('1.2e3'), 1200, '1.2e3');
  close(run('1.2E3'), 1200, '1.2E3');
  close(run('4.5e-2'), 0.045, '4.5e-2');
  close(run('2.5e3 * 4'), 10000, '2.5e3 * 4');
});

/* --------------------------------------------------------------- precedence */

test('multiplication binds tighter than addition', () => {
  close(run('2 + 3 * 4'), 14, '2 + 3 * 4');
  close(run('3 * 4 + 2'), 14, '3 * 4 + 2');
});

test('parentheses override precedence', () => {
  close(run('(2 + 3) * 4'), 20, '(2 + 3) * 4');
  close(run('2 * (3 + 4)'), 14, '2 * (3 + 4)');
  close(run('((2 + 3) * (4 - 1)) / 5'), 3, 'nested');
});

test('exponentiation binds tighter than multiplication and associates right', () => {
  close(run('2 ^ 3 * 4'), 32, '2 ^ 3 * 4');
  close(run('2 ^ 3 ^ 2'), 512, '2 ^ 3 ^ 2');
  close(run('3 * 2 ^ 2'), 12, '3 * 2 ^ 2');
  close(run('2 ** 3 ** 2'), 512, 'double caret');
});

test('unary minus is a sign, not an exponent, so -3^2 is negative nine', () => {
  close(run('-3 ^ 2'), -9, '-3 ^ 2');
  close(run('-(3 ^ 2)'), -9, '-(3 ^ 2)');
  close(run('-3 * 2'), -6, '-3 * 2');
  close(run('3 * -2'), -6, '3 * -2');
});

test('division and subtraction associate left to right', () => {
  close(run('100 / 10 / 2'), 5, '100 / 10 / 2');
  close(run('100 - 10 - 2'), 88, '100 - 10 - 2');
});

/* ---------------------------------------------------------------- functions */

test('root and logarithm functions', () => {
  close(run('sqrt(18)'), 4.242640687119285, 'sqrt(18)');
  close(run('cbrt(250)'), 6.299605249997365, 'cbrt(250)');
  close(run('ln(20)'), 2.995732273553991, 'ln(20)');
  close(run('log10(1250)'), 3.096910013008056, 'log10(1250)');
  close(run('log(1000)'), 3, 'log is base 10');
  // sqrt(18) * cbrt(250) = 4.242640687119285 * 6.299605249997365
  close(run('sqrt(18) * cbrt(250)'), 26.726961544210177, 'combined');
});

test('trigonometry takes degrees, not radians', () => {
  close(run('sin(30)'), 0.5, 'sin(30)');
  close(run('sin(90)'), 1, 'sin(90)');
  close(run('cos(60)'), 0.5, 'cos(60)');
  close(run('tan(45)'), 1, 'tan(45)');
  close(run('asin(0.5)'), 30, 'asin(0.5)');
  close(run('acos(0.5)'), 60, 'acos(0.5)');
  close(run('atan(1)'), 45, 'atan(1)');
});

test('a function applies to its whole bracketed argument only', () => {
  close(run('sin(30) * 2'), 1, 'sin(30) * 2');
  close(run('2 * sin(30)'), 1, '2 * sin(30)');
  close(run('sin(30 + 0)'), 0.5, 'sin(30 + 0)');
  close(run('sqrt(4 + 5)'), 3, 'sqrt(4 + 5)');
});

test('functions nest and compose', () => {
  close(run('sqrt(18)'), 4.242640687119285, 'sqrt(18)');
  close(run('ln(ln(20))'), 1.0971887003649488, 'ln(ln(20))');
  close(run('sin(asin(0.5))'), 0.5, 'sin(asin(0.5))');
  close(run('sqrt(4 ^ 2)'), 4, 'sqrt(4 ^ 2)');
});

test('spaces are optional', () => {
  close(run('sqrt(18)'), 4.242640687119285, 'spaced');
  close(run('sqrt( 18 )'), 4.242640687119285, 'padded');
  close(run('  2.5  *  3.7  '), 9.25, 'outer whitespace');
});

/* -------------------------------------------------------------------- AST */

test('parse returns a walkable tree, not just a number', () => {
  const ast = parse('2 * 3');
  assert.equal(ast.kind, 'binary');
  assert.equal(ast.operator, '*');
  assert.equal(ast.left.kind, 'number');
  assert.equal(ast.right.kind, 'number');

  const fn = parse('sqrt(18)');
  assert.equal(fn.kind, 'call');
  assert.equal(fn.name, 'sqrt');
  assert.equal(fn.argument.kind, 'number');
});

test('unary minus is represented as its own node', () => {
  const ast = parse('-3');
  assert.equal(ast.kind, 'unary');
  assert.equal(ast.operator, '-');
  assert.equal(ast.argument.kind, 'number');
});

test('evaluating a parsed tree matches evaluating the source text', () => {
  close(evaluate(parse('2 + 3 * 4')), 14, 'tree evaluation');
});

/* ------------------------------------------------------------------ errors */

/** assert.throws returns undefined, so capture the error to inspect its fields. */
const failure = (text) => {
  try {
    parse(text);
  } catch (err) {
    assert.ok(err instanceof ParseError,
      `expected a ParseError for ${JSON.stringify(text)}, got ${err.name}`);
    return err;
  }
  assert.fail(`expected ${JSON.stringify(text)} to be rejected`);
};

/** Same, but for failures that only surface once the tree is evaluated. */
const failureRun = (text) => {
  try {
    run(text);
  } catch (err) {
    assert.ok(err instanceof ParseError,
      `expected a ParseError for ${JSON.stringify(text)}, got ${err.name}`);
    return err;
  }
  assert.fail(`expected ${JSON.stringify(text)} to be rejected`);
};

test('an unbalanced bracket is reported with its position', () => {
  const err = failure('(2 + 3');
  assert.equal(err.index, 6, 'points past the end of the unclosed bracket');
  assert.match(err.message, /bracket|paren/i);
});

test('an unknown function names itself and gives a position', () => {
  const err = failure('sqr(18)');
  assert.equal(err.index, 0);
  assert.match(err.message, /sqr/);
});

test('an empty or blank input is rejected', () => {
  assert.throws(() => parse(''), ParseError);
  assert.throws(() => parse('   '), ParseError);
});

test('a dangling operator is rejected', () => {
  assert.throws(() => parse('2 +'), ParseError);
  assert.throws(() => parse('2 * * 3'), ParseError);
});

test('trailing junk points at the stray character, not the space before it', () => {
  const err = failure('2 + 3 4');
  assert.equal(err.index, 6, 'index 6 is the 4');
});

test('an unknown character is rejected at its position', () => {
  const err = failure('2 + #');
  assert.equal(err.index, 4);
});

test('a domain error is reported rather than returning NaN', () => {
  assert.throws(() => run('sqrt(-1)'), ParseError);
  assert.throws(() => run('ln(0)'), ParseError);
  assert.throws(() => run('ln(-1)'), ParseError);
  assert.throws(() => run('log10(0)'), ParseError);
  assert.throws(() => run('asin(2)'), ParseError);
});

test('a domain error names the function and echoes the typed argument', () => {
  // The message has to match what the user typed, not the value it became.
  const err = failureRun('ln(-4)');
  assert.match(err.message, /ln is undefined for -4/);
  assert.equal(err.index, 0, 'caret sits on the function name');
  assert.match(failureRun('sqrt(-1)').message, /sqrt is undefined for -1/);
  assert.match(failureRun('asin(5)').message, /asin is undefined for 5/);
});

test('a nested domain error blames the function actually at fault', () => {
  // sqrt fails before ln ever sees a value, so the message and the caret both
  // point at sqrt rather than accusing the outer ln.
  const err = failureRun('ln(sqrt(-1))');
  assert.match(err.message, /sqrt is undefined for -1/);
  assert.equal(err.index, 3, 'index 3 is the inner sqrt');
});

test('division by zero is reported', () => {
  assert.throws(() => run('1 / 0'), ParseError);
});