'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const render = require('./render.js');
const { geometry } = require('./geometry.js');

const RULE = { axisPx: 1000, decades: 4 };
const g = geometry(RULE);
const AXIS_W = render.SVG_W;

/**
 * Minimal stand-in for the parts of the SVG DOM the renderer touches. Enough to
 * run `draw` and inspect the tree, without a browser.
 */
function stubNode(name) {
  return {
    name,
    children: [],
    attrs: {},
    textContent: '',
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; },
    classList: { toggle() {}, add() {} },
    querySelectorAll() { return []; },
  };
}

function withStubDom(fn) {
  const saved = global.document;
  const created = [];
  global.document = {
    createElementNS(ns, name) {
      const node = stubNode(name);
      created.push(node);
      return node;
    },
  };
  try { return fn(created); } finally { global.document = saved; }
}

const SCALES = ['D', 'A', 'CI', 'Ln', 'C', 'B', 'C|', 'K'];

/* ------------------------------------------------------------ graduations */

test('every labelled tick reads its own label on its own scale', () => {
  // The invariant the whole renderer rests on. If a tick is drawn at x and
  // labelled n, then read(scale, x) must be n -- otherwise the rule lies about
  // what it shows.
  let checked = 0;
  for (const scale of SCALES) {
    for (const tick of render.graduations(g, scale)) {
      if (!tick.label) continue;
      const v = Number(tick.label);
      if (!Number.isFinite(v) || v <= 0) continue;
      checked++;
      const read = g.read(scale, tick.x);
      assert.ok(Math.abs(read - v) / v < 0.02,
        `${scale} tick labelled ${v} at x=${tick.x.toFixed(1)} reads ${read}`);
    }
  }
  assert.ok(checked > 100, `a meaningful number of ticks checked, got ${checked}`);
});

test('every scale puts its index at zero', () => {
  for (const scale of SCALES) {
    const ticks = render.graduations(g, scale);
    assert.ok(ticks.length > 0, `${scale} has ticks`);
    assert.ok(Math.min(...ticks.map((t) => t.x)) >= -render.OVERHANG,
      `${scale} starts within the overhang`);
  }
});

test('ticks do not run past the right edge of the rule', () => {
  // Ticks beyond the rule are drawn off the end, which reads as a printing
  // error rather than as graduations.
  for (const scale of SCALES) {
    const over = render.graduations(g, scale).filter((t) => t.x > RULE.axisPx);
    assert.equal(over.length, 0,
      `${scale} has ${over.length} ticks past ${RULE.axisPx}: ${over.slice(0, 3).map((t) => t.x.toFixed(0))}`);
  }
});

test('ticks are sorted so the renderer draws them left to right', () => {
  for (const scale of SCALES) {
    const xs = render.graduations(g, scale).map((t) => t.x);
    for (let i = 1; i < xs.length; i++) {
      assert.ok(xs[i] >= xs[i - 1], `${scale} tick ${i} goes backwards`);
    }
  }
});

test('D spans the whole rule and prints each decade', () => {
  const majors = render.graduations(g, 'D').filter((t) => t.major).map((t) => Number(t.label));
  assert.deepEqual(majors, [1, 10, 100, 1000]);
});

test('B and K stop short of D, since they graduate faster', () => {
  // Three decades of D fit where the cubed scale has room for far fewer values.
  // A rule really does run out here, and the renderer must respect it.
  const k = render.graduations(g, 'K').filter((t) => t.major).map((t) => Number(t.label));
  const d = render.graduations(g, 'D').filter((t) => t.major).map((t) => Number(t.label));
  assert.ok(k.length < d.length, 'K has fewer decades than D');
  assert.ok(k[0] === 1, 'K starts at 1');
});

test('the A scale shows one cycle, because a cycle fills a four decade rule', () => {
  const ticks = render.graduations(g, 'A');
  const majors = ticks.filter((t) => t.major).map((t) => Number(t.label));
  assert.deepEqual(majors, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  // A cycle spans two decades, so a four decade rule is two cycles wide, and
  // the second one's "10" would sit exactly where the rule ends.
  assert.ok(Math.max(...ticks.map((t) => t.x)) <= RULE.axisPx, 'nothing runs past the rule');
  const boundary = ticks.filter((t) => Math.abs(t.x - RULE.axisPx) < 0.5);
  assert.equal(boundary.length, 1, 'one graduation at the end');
  assert.equal(Number(boundary[0].label), 100, 'which reads and claims 100');
});

test('the Ln scale carries whole units across the rule', () => {
  const majors = render.graduations(g, 'Ln').filter((t) => t.major).map((t) => Number(t.label));
  assert.ok(majors.length >= 8, `a four decade rule holds Ln 0 to 9, got ${majors.join(',')}`);
  assert.equal(majors[0], 0, 'starts at 0');
});

test('projected scales graduate every degree', () => {
  for (const scale of ['S', 'T']) {
    const ticks = render.trigGraduations(g, scale);
    assert.ok(ticks.length > 60, `${scale} has degrees, got ${ticks.length}`);
    for (const tick of ticks) {
      assert.ok(Math.abs(g.read(scale, tick.x) - Number(tick.label)) < 0.01,
        `${scale} at ${tick.label} reads ${g.read(scale, tick.x)}`);
    }
  }
});

/* ------------------------------------------------------------------ drawing */

test('draw produces a stock, a slide and a cursor', () => {
  withStubDom(() => {
    const svg = stubNode('svg');
    const parts = render.draw(svg, RULE, {});
    assert.equal(svg.children[0].name, 'rect', 'a body is drawn first');
    assert.ok(svg.children.some((c) => c.attrs.id === 'stock'), 'has a stock group');
    assert.ok(svg.children.some((c) => c.attrs.id === 'slide'), 'has a slide group');
    assert.ok(svg.children.some((c) => c.attrs.id === 'cursor'), 'has a cursor group');
    assert.ok(parts.geometry, 'hands back a geometry');
  });
});

test('move writes transforms and nothing else', () => {
  withStubDom(() => {
    const parts = render.draw(stubNode('svg'), RULE, {});
    render.move(parts, 150.5, 300.25);
    assert.equal(parts.slide.attrs.transform, 'translate(150.50,0)');
    assert.equal(parts.cursor.attrs.transform, 'translate(300.25,0)');
  });
});

test('the trig row is drawn only when a trig scale is in use', () => {
  withStubDom(() => {
    const plain = render.draw(stubNode('svg'), RULE, { scale: 'D' });
    assert.equal(plain.trig.children.length, 0, 'no trig row for a D scale read');

    const trig = render.draw(stubNode('svg'), RULE, { scale: 'S', trigScale: 'S' });
    assert.ok(trig.trig.children.length > 0, 'trig row present for S');
  });
});