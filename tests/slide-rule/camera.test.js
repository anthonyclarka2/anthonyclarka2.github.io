'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { camera, easeInOutCubic } = require('../../docs/slide-rule/camera.js');

// Expected values are worked examples with independently known answers (the
// arithmetic itself), never the clamp expressions the module implements. A test
// that recomputes Math.min(Math.max(focus - w / 2, 0), rule.width - w) to check
// that same expression passes by construction and can never disagree with the
// code, so every expectation below is a literal worked by hand.
const RULE = { width: 1240, height: 430 };
const VIEWPORT = { width: 1200, height: 430 };
const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9,
    `${what}: expected ${expected}, got ${actual}`);

// Zoom 3 means three rule units are squeezed into each screen pixel, so the
// window is 1200/3 = 400 rule units across and 430/3 = 143.33 down. Both are
// worked by hand below rather than written as a division, so a change to the
// zoom arithmetic has to be argued for here and not absorbed silently.
const ZOOM_3 = 3;
const WIDTH_AT_ZOOM_3 = 400;

const cam = (over) => camera(Object.assign(
  { rule: RULE, viewport: VIEWPORT, zoom: ZOOM_3 }, over));

test('a zoomed window shows a fraction of the rule, centred on the focus', () => {
  const c = cam();
  const win = c.window();
  close(win.w, WIDTH_AT_ZOOM_3, 'window width at zoom 3');
  // The zoom has to actually narrow the window. A viewBox that still spanned the
  // whole rule while claiming to be zoomed would render identically unzoomed.
  assert.ok(win.w < c.overview().w, 'zoomed window is narrower than the overview');
  assert.ok(win.w < RULE.width, 'zoomed window is narrower than the rule');
  // No focus was given, so the camera opens on the middle of the rule: that is
  // where the decades worth of graduations are, not hard against the left end.
  close(win.x + win.w / 2, 620, 'unfocused window sits on the rule midpoint');
});

test('the window keeps the RULE aspect ratio, so the rows are not cropped', () => {
  const win = cam().window();
  close(win.y, 0, 'window starts at the top of the rule');
  // The height follows the RULE's proportions, not the viewport's. The rule is
  // about 3.3 units wide for every one tall; a viewport of another ratio would
  // crop rows off the top and bottom or leave empty bands, and either makes the
  // rule look unlike itself.
  close(win.w / win.h, RULE.width / RULE.height, 'aspect follows the rule');
  close(win.h, WIDTH_AT_ZOOM_3 / (RULE.width / RULE.height),
    'window height at zoom 3');
});

test('the window never leaves the rule, at any focus, including both ends', () => {
  const c = cam();
  const positions = [0, 1, 199, 200, 400, 620, 839, 1040, 1041, 1239, RULE.width];
  for (const focus of positions) {
    const win = c.withFocus(focus).window();
    assert.ok(win.x >= 0, `x stays on the rule at focus ${focus}, got ${win.x}`);
    assert.ok(win.x + win.w <= RULE.width,
      `right edge stays on the rule at focus ${focus}, got ${win.x + win.w}`);
    close(win.w, WIDTH_AT_ZOOM_3, `window width is unchanged at focus ${focus}`);
  }
});

test('focusing on the left end pins the window to x = 0 exactly', () => {
  // Not a hair off: a window at x = -1e-14 still renders as a sliver of blank
  // beside the rule, and that sliver is visible.
  assert.equal(cam().withFocus(0).window().x, 0);
  assert.equal(cam().withFocus(150).window().x, 0);
});

test('focusing on the right end pins the window to the rule width exactly', () => {
  // 1240 - 400 = 840: the window's right edge lands on the end of the rule.
  const win = cam().withFocus(RULE.width).window();
  assert.equal(win.x, 840);
  assert.equal(win.x + win.w, RULE.width);
});

test('focusing inside the rule centres the window on the focus exactly', () => {
  close(cam().withFocus(400).window().x, 200, 'window at focus 400');
  close(cam().withFocus(400).window().x + 200, 400, 'midpoint is the focus at 400');
  // 620 is the middle of 1240, so the window needs no clamping at all.
  close(cam().withFocus(620).window().x, 420, 'window at the rule midpoint');
  close(cam().withFocus(620).window().x + 200, 620, 'midpoint is the focus at 620');
});

test('a window wider than the rule is centred and allowed to overflow', () => {
  // Zoom 0.5 stretches each screen pixel over two rule units, so the viewport
  // wants 2400 of the 1240 available. Clamping would collapse the window to
  // nothing and hide the rule entirely, so the overflow is kept symmetric.
  const win = cam({ zoom: 0.5 }).window();
  close(win.w, 2400, 'window width at zoom 0.5');
  close(win.x, -580, 'window centred on the rule, overflowing both ends');
  assert.ok(win.x < 0 && win.x + win.w > RULE.width, 'overflow is deliberate');
});

test('a window wider than the rule still keeps the rule aspect', () => {
  // The overflow case must not quietly reintroduce the viewport's aspect, or a
  // zoomed-out view would letterbox the rule instead of framing it.
  const win = cam({ zoom: 0.5 }).window();
  close(win.w / win.h, RULE.width / RULE.height, 'aspect still follows the rule');
});

test('withFocus can change the zoom in the same call', () => {
  const win = cam().withFocus(400, { zoom: 6 }).window();
  // Zoom 6 halves the window to 200 units, still centred on 400.
  close(win.w, 200, 'window width after zooming in place');
  close(win.x, 300, 'window still centred on the focus');
  close(win.x + win.w / 2, 400, 'focus survived the zoom change');
});

test('withZoom holds the centre point still', () => {
  // Zooming must not let the thing being looked at slide out from under the
  // reader: the graduation under the cursor stays under the cursor.
  for (const zoom of [1.5, 2, 6, 12]) {
    const before = cam().withFocus(400).window();
    const after = cam().withFocus(400).withZoom(zoom).window();
    close(before.x + before.w / 2, 400, `centre at zoom ${ZOOM_3}`);
    close(after.x + after.w / 2, 400, `centre at zoom ${zoom}`);
  }
});

test('withZoom yields a window whose width tracks the new zoom', () => {
  const c = cam().withFocus(400);
  close(c.withZoom(6).window().w, 200, 'zoom 6');
  close(c.withZoom(12).window().w, 100, 'zoom 12');
  close(c.withZoom(1.5).window().w, 800, 'zoom 1.5');
});

test('the overview covers the whole rule whatever the camera is doing', () => {
  const whole = { x: 0, y: 0, w: RULE.width, h: RULE.height };
  const cameras = [
    cam(),
    cam({ zoom: 0.5 }),
    cam({ zoom: 12 }),
    cam().withFocus(0),
    cam().withFocus(RULE.width).withZoom(40),
  ];
  for (const c of cameras) {
    assert.deepEqual(c.overview(), whole, 'overview is the whole rule');
  }
});

test('the minimap window is the overview, as its own named seam', () => {
  // They are equal today. They are separate methods so the minimap can later
  // diverge (padding, a fitted aspect) without the main view moving.
  assert.deepEqual(cam().minimapWindow(), cam().overview());
  assert.deepEqual(cam({ zoom: 7 }).withFocus(900).minimapWindow(),
    { x: 0, y: 0, w: RULE.width, h: RULE.height });
});

test('the scale is rule units per screen pixel', () => {
  close(cam().scale(), 1 / 3, 'scale at zoom 3');
  close(cam({ zoom: 4 }).scale(), 0.25, 'scale at zoom 4');
  // Scale runs from screen pixels to rule units, so 400 rule units across a
  // third-of-a-rule-unit pixel is 1200 screen pixels: the window fills the
  // viewport exactly, which is what makes it a zoom rather than a letterbox.
  close(cam().window().w / cam().scale(), VIEWPORT.width, 'window fits the viewport');
});

test('ruleToScreen and screenToRule are inverses', () => {
  const c = cam();
  for (const width of [1, 310, 620, 1240]) {
    for (const ruleX of [0, 1, 400, 620, 1239.5, RULE.width]) {
      close(c.screenToRule(c.ruleToScreen(ruleX, width), width), ruleX,
        `round trip at rule ${ruleX} across ${width}px`);
    }
  }
});

test('ruleToScreen places the ends of the rule at the ends of the minimap', () => {
  // The minimap is 310px wide and the rule is 1240 units, so each rule unit is
  // a quarter of a pixel. A quarter of the way along the rule is 310 units,
  // which lands at a quarter of 310px: 77.5.
  close(cam().ruleToScreen(0, 310), 0, 'left end of the rule');
  close(cam().ruleToScreen(310, 310), 77.5, 'one quarter along');
  close(cam().ruleToScreen(RULE.width, 310), 310, 'right end of the rule');
});

test('cameras are immutable: withFocus returns a new one and changes nothing', () => {
  const original = cam();
  const before = { ...original.window() };
  const moved = original.withFocus(400);
  assert.notEqual(moved, original, 'a new object, not the same camera');
  assert.deepEqual(original.window(), before, 'the original window is untouched');
  close(original.window().x, 420, 'the original keeps its own position');
  // The original is still usable, not consumed by being moved.
  assert.equal(original.scale(), 1 / 3);
  assert.deepEqual(moved.overview(), original.overview());
});

test('withZoom is immutable too, and the window cannot be corrupted from outside', () => {
  const original = cam().withFocus(400);
  const before = { ...original.window() };
  const zoomed = original.withZoom(12);
  assert.notEqual(zoomed, original);
  assert.deepEqual(original.window(), before, 'the original window is untouched');

  // The returned window is a fresh object. A caller that scribbles on it must
  // not be able to drag the camera's own state with it.
  const scribbled = original.window();
  scribbled.x = 9999;
  assert.notEqual(original.window().x, 9999, 'window() hands back a fresh object');
});

test('easing starts at zero, ends at one, and clamps outside the interval', () => {
  // A camera easing past its endpoints would slide off the rule; the ends have
  // to be exact, not nearly exact.
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  assert.equal(easeInOutCubic(-1), 0, 'before the start');
  assert.equal(easeInOutCubic(2), 1, 'past the end');
  assert.equal(easeInOutCubic(0.5), 0.5, 'halfway is halfway');
});

test('easing works the curve on the way in and on the way out', () => {
  // First half: 4 * 0.25^3 = 0.0625. Second half: 1 - 0.5^3/2 = 0.9375.
  close(easeInOutCubic(0.25), 0.0625, 'quarter of the way');
  close(easeInOutCubic(0.75), 0.9375, 'three quarters of the way');
});

test('easing never runs backwards and never leaves the unit interval', () => {
  let previous = -Infinity;
  for (let i = 0; i <= 1000; i++) {
    const t = i / 1000;
    const value = easeInOutCubic(t);
    assert.ok(value >= 0 && value <= 1, `within [0,1] at t=${t}, got ${value}`);
    // Monotonic non-decreasing: the camera must never double back on itself.
    assert.ok(value >= previous, `not going backwards at t=${t}`);
    previous = value;
  }
  // Beyond the ends it is pinned, not merely bounded by luck.
  assert.ok(easeInOutCubic(-5) <= 0, 'clamped below');
  assert.ok(easeInOutCubic(5) >= 1, 'clamped above');
});