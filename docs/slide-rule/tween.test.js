'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createTween, easeInOut, positionAt } = require('./tween.js');

const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9,
    `${what}: expected ${expected}, got ${actual}`);

/* -------------------------------------------------------------- easing */

test('easing starts at zero and ends at one', () => {
  close(easeInOut(0), 0, 'ease at 0');
  close(easeInOut(1), 1, 'ease at 1');
});

test('easing is monotonic, so the slide never reverses mid-move', () => {
  let previous = -Infinity;
  for (let i = 0; i <= 100; i++) {
    const v = easeInOut(i / 100);
    assert.ok(v >= previous, `easing went backwards at ${i / 100}`);
    previous = v;
  }
});

test('easing stays within the unit interval', () => {
  for (let i = 0; i <= 100; i++) {
    const v = easeInOut(i / 100);
    assert.ok(v >= 0 && v <= 1, `easing escaped [0,1] at ${i / 100}: ${v}`);
  }
});

/* ------------------------------------------------------------ positions */

test('position before any step sits at home', () => {
  const steps = [
    { target: 'slide', to: 100 },
    { target: 'cursor', to: 250 },
  ];
  const p = positionAt(steps, 0);
  assert.equal(p.slide, 0, 'slide starts home');
  assert.equal(p.cursor, 0, 'cursor starts home');
});

test('position advances through each step in turn', () => {
  const steps = [
    { target: 'slide', to: 100 },
    { target: 'cursor', to: 250 },
    { target: 'cursor', to: 400 },
  ];
  assert.equal(positionAt(steps, 1).slide, 100, 'slide moved');
  assert.equal(positionAt(steps, 1).cursor, 0, 'cursor not yet moved');
  assert.equal(positionAt(steps, 2).cursor, 250, 'cursor first move');
  assert.equal(positionAt(steps, 3).cursor, 400, 'cursor second move');
});

test('a step only moves the target it names', () => {
  const steps = [
    { target: 'slide', to: 100 },
    { target: 'cursor', to: 250 },
  ];
  const p = positionAt(steps, 2);
  assert.equal(p.slide, 100, 'slide held');
  assert.equal(p.cursor, 250, 'cursor moved');
});

test('an unbounded progress past the end holds the final position', () => {
  const steps = [{ target: 'slide', to: 100 }];
  assert.equal(positionAt(steps, 99).slide, 100, 'clamps at the end');
});

test('the final position survives a target that moves more than once', () => {
  // The cursor moves three times. At and past the end it must sit at the LAST
  // value, not fall back to the first.
  const steps = [
    { target: 'cursor', to: 100 },
    { target: 'slide', to: 50 },
    { target: 'cursor', to: 400 },
    { target: 'cursor', to: 275 },
  ];
  const end = positionAt(steps, steps.length);
  assert.equal(end.cursor, 275, 'holds the last cursor position');
  assert.equal(end.slide, 50, 'holds the last slide position');
  assert.equal(positionAt(steps, 99).cursor, 275, 'clamps there too');
});

test('a tween interpolates smoothly between two steps', () => {
  const steps = [
    { target: 'slide', to: 0 },
    { target: 'slide', to: 400 },
  ];
  const t = createTween({ steps, duration: 1000 });
  // These two steps are genuinely different moves (to 0, then to 400), so
  // nothing collapses and the tween runs for two step durations.
  assert.equal(t.steps.length, 2, 'two real moves');
  close(t.stateAt(0).slide, 0, 'start');
  close(t.stateAt(2000).slide, 400, 'end');
  const mid = t.stateAt(1500).slide;
  assert.ok(mid > 0 && mid < 400, `interpolates, got ${mid}`);
});

test('progress is measured in steps reached, so it ends at the step count', () => {
  const t = createTween({ steps: [{ target: 'slide', to: 100 }], duration: 500 });
  close(t.progressAt(0), 0, 'at the start');
  close(t.progressAt(250), 0.5, 'halfway');
  close(t.progressAt(500), 1, 'at the end, one step');
  close(t.progressAt(9999), 1, 'past the end clamps');
  close(t.progressAt(-50), 0, 'before the start clamps');
});

test('a two step tween reaches both steps by the end of its duration', () => {
  // Scaling elapsed time to a progress of 1 would stop after the first step and
  // leave the rule parked short of where it ends.
  const t = createTween({
    steps: [{ target: 'slide', to: 0 }, { target: 'slide', to: 400 }],
    duration: 1000,
  });
  close(t.progressAt(2000), t.steps.length, 'progress reaches the step count');
  close(t.stateAt(2000).slide, 400, 'ends at the final position');
  // At exactly one step's worth of time, step 0 has settled and step 1 has not
  // begun, so the slide is at 0 rather than mid-travel.
  close(t.stateAt(1000).slide, 0, 'a settled step boundary, not a tween');
  close(t.stateAt(1500).slide, 200, 'midway through the second step');
});

test('a tween agrees with a plain replay of its steps at every boundary', () => {
  // The one invariant the animation depends on. Replaying completed steps in
  // order has no off-by-one ambiguity, so this catches any drift between the
  // interpolation and the plain cases.
  const steps = [
    { target: 'slide', to: 120 },
    { target: 'cursor', to: 300 },
    { target: 'cursor', to: 475 },
    { target: 'slide', to: 60 },
  ];
  const replay = (progress) => {
    let slide = 0;
    let cursor = 0;
    const done = Math.min(Math.floor(progress), steps.length);
    for (let i = 0; i < done; i++) {
      if (steps[i].target === 'slide') slide = steps[i].to;
      else cursor = steps[i].to;
    }
    return { slide, cursor };
  };

  for (let p = 0; p <= steps.length; p++) {
    const got = positionAt(steps, p);
    const want = replay(p);
    assert.deepEqual(got, want, `progress ${p}`);
  }
});

test('a mid-move position lies strictly between where it was and where it lands', () => {
  const steps = [
    { target: 'slide', to: 0 },
    { target: 'slide', to: 400 },
  ];
  let previous = -Infinity;
  for (let p = 1.05; p < 2; p += 0.05) {
    const v = positionAt(steps, p).slide;
    assert.ok(v >= previous, `slide moved backwards at ${p}: ${v} < ${previous}`);
    previous = v;
  }
  assert.ok(previous > 0, 'it actually moved');
});

test('a zero duration tween completes instantly', () => {
  // Reduced motion sets the duration to zero, and a tween that never advances
  // would leave the animation stuck on its first frame forever.
  const t = createTween({ steps: [{ target: 'slide', to: 300 }], duration: 0 });
  close(t.valueAt(0), 300, 'jumps straight to the end');
});

test('an empty step list is handled without dividing by zero', () => {
  const t = createTween({ steps: [], duration: 100 });
  assert.ok(Number.isFinite(t.valueAt(50)), 'produces a finite position');
});