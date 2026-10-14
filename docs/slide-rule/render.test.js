'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const render = require('./render.js');
const rule669 = require('./rule669.js');
const { geometry } = require('./geometry.js');

const RULE = { axisPx: 1000, decades: 4 };
const g = geometry(RULE);

/**
 * Minimal stand-in for the parts of the SVG DOM the renderer touches. Enough to
 * run `draw` and inspect the resulting tree without a browser.
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
    classList: { toggle() {}, add() {}, contains() { return false; } },
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

/** Walk a stub tree collecting every node with the given id. */
function byId(node, id, found = []) {
  if (node.attrs && node.attrs.id === id) found.push(node);
  for (const child of node.children || []) byId(child, id, found);
  return found;
}

/** All text content in a stub tree, joined, for label assertions. */
function texts(node, out = []) {
  if (node.textContent) out.push(node.textContent);
  for (const child of node.children || []) texts(child, out);
  return out;
}

/* -------------------------------------------------------------- the layout */

test('the rule is drawn as two pieces with a seam between them', () => {
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });

    const band = rule669.slideBand('front');
    const stock = byId(svg, 'stock-plate');
    const slide = byId(svg, 'slide-plate');
    assert.ok(stock.length, 'the fixed plate is drawn');
    assert.ok(slide.length, 'the sliding plate is drawn');

    // The two plates must not overlap, or the seam would be painted over.
    assert.ok(stock[0].attrs.y + stock[0].attrs.height <= band.top,
      'the stock plate stops at the seam');
    assert.ok(slide[0].attrs.y >= band.top, 'the slide plate starts at the seam');
  });
});

test('the slide plate is drawn inside its own translating group', () => {
  withStubDom(() => {
    const svg = stubNode('svg');
    const parts = render.draw(svg, RULE, { face: 'front' });
    const plate = byId(svg, 'slide-plate')[0];
    assert.ok(plate, 'slide plate exists');

    render.move(parts, 120, 300);
    // Moving the slide must move the plate with it, so the plate has to be
    // inside #slide rather than a sibling of it.
    assert.ok(byId(parts.slide, 'slide-plate').length, 'plate travels with the slide');
    assert.equal(parts.slide.attrs.transform, 'translate(120.00,0)');
  });
});

test('the stock plate does not move when the slide does', () => {
  withStubDom(() => {
    const svg = stubNode('svg');
    const parts = render.draw(svg, RULE, { face: 'front' });
    render.move(parts, 250, 400);
    assert.equal(parts.stock.attrs.transform, undefined,
      'the fixed plate has no slide transform');
  });
});

/* ------------------------------------------------------------- every row */

test('every scale on the face is drawn as its own row', () => {
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    for (const row of rule669.layout('front')) {
      assert.equal(byId(svg, `row-${row.name}`).length, 1, `${row.name} drawn exactly once`);
    }
  });
});

test('a slide scale is drawn inside the moving group and a fixed one is not', () => {
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const slide = byId(svg, 'slide')[0];
    const stock = byId(svg, 'stock')[0];

    assert.ok(byId(slide, 'row-CI').length, 'CI rides the slide');
    assert.equal(byId(stock, 'row-CI').length, 0, 'CI is not on the stock');
    assert.equal(byId(stock, 'row-D').length, 1, 'D is fixed to the stock');
    assert.equal(byId(slide, 'row-D').length, 0, 'D is not on the slide');
  });
});

test('the back face is drawn with its own rows', () => {
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'back' });
    for (const row of rule669.layout('back')) {
      assert.ok(byId(svg, `row-${row.name}`).length >= 1, `${row.name} is drawn on the back`);
    }
  });
});

/* ------------------------------------------------------ graduations */

test('a graduation is placed where geometry says the scale is graduated', () => {
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });

    // The D row's 2 must sit where geometry puts D 2, which is the same number
    // the planner aims the cursor at. Labels are drawn as text at the tick's x;
    // the tick itself is a vertical line at the same position.
    const want = g.posOf('D', 2);
    const row = byId(svg, 'row-D')[0];
    const labels = row.children.filter((c) => c.name === 'text' && c.textContent === '2');
    assert.ok(labels.length >= 1, 'D prints a 2');
    for (const label of labels) {
      assert.ok(Math.abs(Number(label.attrs.x) - want) < 1,
        `D 2 at ${label.attrs.x}, geometry says ${want}`);
    }
  });
});

test('no graduation is drawn past the end of the rule', () => {
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const ticks = [];
    (function walk(node) {
      if (node.name === 'line' && node.attrs.id === 'tick') ticks.push(node);
      for (const c of node.children) walk(c);
    })(svg);
    assert.ok(ticks.length > 100, `a real number of ticks, got ${ticks.length}`);
    for (const tick of ticks) {
      // A tick is a vertical line, so its position is x1, not x. Reciprocal
      // scales run backwards, so their graduations legitimately sit at negative
      // x on the overhang where the slide protrudes past the fixed plate.
      const x = Number(tick.attrs.x1);
      assert.ok(Number.isFinite(x), `tick has a position, got ${tick.attrs.x1}`);
      assert.ok(x >= -render.OVERHANG - 1 && x <= RULE.axisPx + 1,
        `tick at ${x} is outside the rule and its overhang`);
    }
  });
});

test('reciprocal rows graduate onto the overhang, as the instrument does', () => {
  // CI reads 1 at the index and larger values to its left, which is the part of
  // the rule that sticks out beyond the fixed plate. Refusing those would break
  // the reciprocals the whole rule is built around.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const ci = byId(svg, 'row-CI')[0];
    const xs = ci.children
      .filter((c) => c.name === 'line' && c.attrs.id === 'tick')
      .map((c) => Number(c.attrs.x1));
    assert.ok(xs.length > 0, 'CI has graduations');
    assert.ok(Math.min(...xs) < 0, 'CI reaches left of the index');
    assert.ok(Math.max(...xs) <= 1, 'CI runs backwards from its 1');
  });
});

test('a row whose graduations are unknown is drawn as a name and nothing else', () => {
  // SRT and DF could not be read off the photographs. Drawing plausible ticks
  // for them would be inventing graduations the instrument may not have.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'back' });
    const srt = byId(svg, 'row-SRT')[0];
    assert.ok(srt, 'SRT is still drawn');
    const ticks = srt.children.filter((c) => c.attrs.id === 'tick');
    assert.equal(ticks.length, 0, 'but with no invented graduations');
    assert.ok(texts(srt).includes('SRT'), 'its name is printed');
  });
});

/* ---------------------------------------------------------- the cursor */

test('the cursor glass is drawn with a surround, screws and a centre line', () => {
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });

    const glass = byId(svg, 'cursor-glass');
    const screws = byId(svg, 'cursor-screw');
    const centre = byId(svg, 'cursor-centre');
    assert.ok(glass.length, 'the glass body exists');
    assert.equal(screws.length, 4, 'four corner screws, as on the instrument');
    assert.ok(centre.length, 'a hairline down the centre of the glass');
  });
});

test('the glass straddles the slide band, the way the photographs show', () => {
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const glass = byId(svg, 'cursor-glass')[0];
    const band = rule669.slideBand('front');
    const top = Number(glass.attrs.y);
    const bottom = top + Number(glass.attrs.height);

    assert.ok(top < band.top, 'the glass starts above the band');
    assert.ok(bottom > band.bottom, 'the glass runs past the band');
    assert.ok(top > 0 && bottom < rule669.height('front'),
      'but the glass is a cursor over part of the rule, not the whole rule');
  });
});

test('the glass moves on its own transform', () => {
  withStubDom(() => {
    const svg = stubNode('svg');
    const parts = render.draw(svg, RULE, { face: 'front' });
    render.move(parts, 120, 375);
    assert.equal(parts.cursor.attrs.transform, 'translate(375.00,0)');
    assert.equal(byId(parts.cursor, 'cursor-glass').length, 1,
      'the glass is inside the moving cursor group');
  });
});

/* ---------------------------------------------------------- the minimap */

test('the minimap draws the whole rule rather than a zoomed window', () => {
  withStubDom(() => {
    const svg = stubNode('svg');
    const parts = render.draw(svg, RULE, { face: 'front', minimap: true });
    assert.ok(byId(svg, 'minimap-viewport').length, 'the viewport marker is drawn');
    assert.ok(byId(svg, 'minimap-slide').length,
      'the slide position is shown on the minimap');
  });
});

test('the minimap slide marker follows the slide', () => {
  withStubDom(() => {
    const svg = stubNode('svg');
    const parts = render.draw(svg, RULE, { face: 'front', minimap: true });
    render.move(parts, 200, 0);
    const marker = byId(svg, 'minimap-slide')[0];
    assert.ok(marker, 'marker exists');
    // The marker slides along the bar it sits on, so it moves by position.
    const want = -render.OVERHANG + 200;
    assert.ok(Math.abs(Number(marker.attrs.x) - want) < 0.01,
      `marker at ${marker.attrs.x}, expected ${want}`);
  });
});

/* ------------------------------------------------------------ faces */

test('an unknown face is refused rather than drawn blank', () => {
  withStubDom(() => {
    assert.throws(() => render.draw(stubNode('svg'), RULE, { face: 'sideways' }),
      /unknown face/);
  });
});