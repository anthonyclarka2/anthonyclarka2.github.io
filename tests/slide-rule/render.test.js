'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const render = require('../../docs/slide-rule/render.js');
const rule669 = require('../../docs/slide-rule/rule669.js');
const { geometry } = require('../../docs/slide-rule/geometry.js');

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
    // The real DOM stringifies attribute values. The stub did not, which hid a
    // bug for a while: a test comparing getAttribute('data-grade') to '2' never
    // matched the number 2 the renderer had set, and silently asserted nothing.
    setAttribute(k, v) { this.attrs[k] = String(v); },
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

/* ----------------------------------------------------------- the graduations */

test('no graduation relies on the inherited CSS colour', () => {
  // The defect: minor ticks were stroked `currentColor`, which resolves to the
  // page's near-white text colour. On a pale ivory rule that is invisible, so
  // eight of every nine graduations simply did not appear. A graduation must
  // name its own ink, because the rule's surface is the opposite of the page's.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const ticks = byId(svg, 'tick');
    assert.ok(ticks.length > 100, `there are ticks to check, got ${ticks.length}`);
    for (const tick of ticks) {
      assert.notEqual(tick.getAttribute('stroke'), 'currentColor',
        'a graduation must not inherit the page text colour');
    }
  });
});

test('every graduation has a stroke that names one of the rule inks', () => {
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const inks = new Set(['var(--rule-ink)', 'var(--slide-ink)']);
    for (const tick of byId(svg, 'tick')) {
      assert.ok(inks.has(tick.getAttribute('stroke')),
        `unexpected stroke ${tick.getAttribute('stroke')}`);
    }
  });
});

test('a graduation is visible: it has length, weight and contrast', () => {
  // A zero-length line, a hairline at 4% opacity, or a colour close to the
  // stock it is drawn on all amount to the same thing, which is not drawn.
  // The stock is #e6e0d0; anything within a few percent of that cannot be read.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const stock = [0xe6, 0xe0, 0xd0];
    for (const tick of byId(svg, 'tick')) {
      const len = Number(tick.getAttribute('y1')) - Number(tick.getAttribute('y2'));
      assert.ok(len >= 3, `graduation is ${len} long, too short to see`);

      const width = Number(tick.getAttribute('stroke-width'));
      assert.ok(width >= 0.4, `graduation is ${width} wide, too thin to see`);

      const opacity = Number(tick.getAttribute('opacity'));
      assert.ok(opacity >= 0.5, `graduation at ${opacity} opacity is too faint`);

      const stroke = tick.getAttribute('stroke');
      assert.ok(stroke === 'var(--slide-ink)' || stroke === 'var(--rule-ink)',
        'a visible graduation is printed in ink, not in the stock colour');
      // The stock it is printed on is #e6e0d0, so ink of that lightness would be
      // the same colour as the surface it is meant to mark.
      const ink = stroke === 'var(--slide-ink)' ? 0x2a : 0x22;
      assert.ok(ink < stock[0] && ink < stock[1] && ink < stock[2],
        'the ink must be far darker than the stock it is drawn on');
    }
  });
});

test('a log row carries graduations between its labels, as the instrument does', () => {
  // One tick per label makes the rule look like a row of numbers. A log scale is
  // subdivided well past the values it names: the labels are the landmarks, the
  // graduations are the scale. Each decade takes a middle graduation too, so a
  // reader can interpolate between two printed numbers.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const row = byId(svg, 'row-L')[0];
    const ticks = row.children.filter((c) => c.getAttribute('id') === 'tick');
    // Grades 0 and 1 carry a printed number; grade 2 is the unlabelled
    // subdivision between them.
    const labelled = ticks.filter((c) => c.getAttribute('data-grade') !== '2').length;
    assert.ok(ticks.length > 0, 'L is graduated');
    assert.ok(labelled > 0, 'L has labelled graduations');

    // Four decades name 36 values; the row must carry substantially more marks
    // than that, or the numbers float free of a scale.
    assert.ok(ticks.length >= labelled * 1.5,
      `L has ${ticks.length} graduations for ${labelled} labels, too sparse`);
  });
});

test('no two printed labels on a row run into each other', () => {
  // The defect this guards: the trig rows crowd dozens of degrees into the last
  // few units of the rule, because log(sin) goes flat as the angle approaches
  // 90. Printed unthinned they came out as "8075747371706866656059...", which
  // is not a readable scale at any zoom.
  for (const face of ['front', 'back']) {
    withStubDom(() => {
      const svg = stubNode('svg');
      render.draw(svg, RULE, { face });
      for (const group of byId(svg, 'row-T').concat(byId(svg, 'row-S'))) {
        const labels = group.children
          .filter((c) => c.name === 'text' && c.textContent)
          .map((c) => ({ x: Number(c.getAttribute('x')), s: c.textContent }))
          .sort((a, b) => a.x - b.x);
        for (let i = 1; i < labels.length; i++) {
          const gap = labels[i].x - labels[i - 1].x;
          assert.ok(gap >= labels[i].s.length * 3.4,
            `${group.id}: "${labels[i - 1].s}" and "${labels[i].s}" overlap by `
            + `${(labels[i].s.length * 3.4 - gap).toFixed(1)} units`);
        }
      }
    });
  }
});

test('the middle graduation of each decade is shorter than the one it sits between', () => {
  // The distinction that makes a scale readable at a glance: long ticks carry the
  // printed numbers, short ticks fill in between. Without it every graduation is
  // the same and the eye cannot find the landmarks.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const row = byId(svg, 'row-L')[0];
    const lens = ['0', '1', '2'].map((grade) => row.children
      .filter((c) => c.getAttribute('id') === 'tick'
        && c.getAttribute('data-grade') === grade)
      .map((t) => Number(t.getAttribute('y1')) - Number(t.getAttribute('y2'))));

    for (const [grade, found] of lens.entries()) {
      assert.ok(found.length > 0, `grade ${grade} exists on L`);
    }
    assert.ok(Math.min(...lens[0]) > Math.max(...lens[1]),
      `labelled (${Math.min(...lens[0])}) must outrun the middles (${Math.max(...lens[1])})`);
    assert.ok(Math.min(...lens[1]) > Math.max(...lens[2]),
      `middles (${Math.min(...lens[1])}) must outrun the fine (${Math.max(...lens[2])})`);
  });
});

test('the graduated area begins at the index, as the photographs show', () => {
  // Every scale on the instrument starts at the same vertical line: the 1 of L,
  // K, A, C and D all align, and the reciprocal rows' 9s begin there too. The
  // implementation carried a 160 unit margin to the left of the index and no row
  // ever used it, because a reciprocal graduation sits at -log10(v), which for
  // every value under 1 is positive. That empty margin is what pushed the row
  // legends away from their scales.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const ticks = byId(svg, 'tick');
    assert.ok(ticks.length > 100, 'there are graduations to check');
    for (const tick of ticks) {
      assert.ok(Number(tick.getAttribute('x1')) >= -0.01,
        `a graduation sits left of the index at x=${tick.getAttribute('x1')}`);
    }
  });
});

test('a row legend sits two to three character widths left of its scale', () => {
  // Measured on the photographs: the legend's right edge clears the start of
  // the scale by a couple of characters, not by the width of the rule. At the
  // size the legends are printed, one character is about 5.5 units.
  const charW = 5.5;
  withStubDom(() => {
    for (const face of ['front', 'back']) {
      const svg = stubNode('svg');
      render.draw(svg, RULE, { face });
      for (const row of rule669.layout(face)) {
        const group = byId(svg, `row-${row.name}`)[0];
        const name = group.children.find((c) => c.name === 'text'
          && c.textContent === row.label);
        assert.ok(name, `${row.name} prints its legend`);
        // Anchored at its right edge, so the gap to the scale is the x position.
        assert.equal(name.getAttribute('text-anchor'), 'end',
          `${row.name} legend is anchored by its right edge`);
        const gap = -Number(name.getAttribute('x'));
        assert.ok(gap >= 2 * charW && gap <= 3 * charW,
          `${row.name} legend clears the scale by ${gap.toFixed(1)} units, `
          + `which is not two to three characters`);
      }
    }
  });
});

test('every legend is still inside the rule, with room for its own text', () => {
  // Pulling the legend in to two characters must not push its left half off the
  // end of the stock. LL01 is the widest name on either face.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const name = byId(svg, 'row-LL01')[0].children
      .find((c) => c.name === 'text' && c.textContent === 'LL01');
    const gap = -Number(name.getAttribute('x'));
    const width = 'LL01'.length * 6;
    assert.ok(gap + width <= render.OVERHANG + 0.01,
      `LL01 needs ${gap + width} units of margin but the stock gives `
      + `${render.OVERHANG}`);
  });
});

test('a legend is drawn in its row colour, as the instrument prints it', () => {
  // The photographs colour the legends to match their row: LL01, CIF, CI and DI
  // are printed in red on the front face, as are LL02, LL03, T and S on the back.
  const red = new Set(['LL01', 'CIF', 'CI', 'DI']);
  const redBack = new Set(['LL02', 'LL03', 'T', 'S']);
  withStubDom(() => {
    for (const [face, reds] of [['front', red], ['back', redBack]]) {
      const svg = stubNode('svg');
      render.draw(svg, RULE, { face });
      for (const row of rule669.layout(face)) {
        const name = byId(svg, `row-${row.name}`)[0].children
          .find((c) => c.name === 'text' && c.textContent === row.label);
        const fill = name.getAttribute('fill');
        // Red rows are printed in red; everything else in the dark ink of
        // whichever piece of the rule it is printed on.
        const dark = ['var(--rule-ink)', 'var(--slide-ink)'];
        if (reds.has(row.name)) {
          assert.equal(fill, 'var(--red-ink)', `${row.name} legend on the ${face} face`);
        } else {
          assert.ok(dark.includes(fill),
            `${row.name} legend on the ${face} face is ${fill}, not red`);
        }
      }
    }
  });
});

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
      // A tick is a vertical line, so its position is x1, not x. The graduated
      // area runs from the index to the end of the rule; the margin to its left
      // belongs to the legends. This used to allow a 160 unit overhang, on the
      // theory that reciprocal scales run back past the index -- but they do not:
      // a reciprocal graduation sits at -log10(v), which is positive for every
      // value below 1, so nothing was ever drawn out there.
      const x = Number(tick.attrs.x1);
      assert.ok(Number.isFinite(x), `tick has a position, got ${tick.attrs.x1}`);
      assert.ok(x >= -0.01 && x <= RULE.axisPx + 1,
        `tick at ${x} is outside the graduated area`);
    }
  });
});

test('a log-log row prints its own values, not an ordinary log scale\'s', () => {
  // The defect this fixes: LL1 was drawn with the ordinary log graduations, so
  // it read "1 10 100 1000" where it should read 1.01 to 1.1. The numbers were
  // wrong, not merely crowded.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });

    const labels = (name) => {
      const row = byId(svg, `row-${name}`)[0];
      return row.children.filter((c) => c.name === 'text').map((c) => c.textContent);
    };

    const ll1 = labels('LL1');
    assert.ok(ll1.includes('1.01'), `LL1 prints 1.01, got ${ll1.join(' ')}`);
    assert.ok(ll1.includes('1.10'), `LL1 prints 1.10, got ${ll1.join(' ')}`);
    assert.ok(!ll1.includes('10'), 'LL1 does not print an ordinary log 10');
    assert.ok(!ll1.includes('1000'), 'LL1 does not run out to 1000');
  });
});

test('every log-log row is graduated, on both faces', () => {
  // LL02 and LL03 were left out of the geometry table once, which threw while
  // drawing the whole back face. Drawing the faces is the cheapest test that
  // catches a row that is declared but not implemented.
  for (const face of ['front', 'back']) {
    withStubDom(() => {
      const svg = stubNode('svg');
      assert.doesNotThrow(() => render.draw(svg, RULE, { face }),
        `the ${face} face draws without throwing`);
    });
  }
});

test('the log-log rows each read their own decade of excess', () => {
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'back' });
    const labelsFor = (name) => {
      const row = byId(svg, `row-${name}`)[0];
      return row.children.filter((c) => c.name === 'text').map((c) => c.textContent);
    };

    // The rows differ by which decade of the excess each opens at. LL1 and
    // LL01 read hundredths, LL2 and LL02 tenths, LL3 whole numbers.
    const ll2 = labelsFor('LL2');
    assert.ok(ll2.includes('1.10'), `LL2 opens at 1.10, got ${ll2.join(' ')}`);
    assert.ok(!ll2.includes('1.01'), 'LL2 is not a copy of LL1');

    const ll3 = labelsFor('LL3');
    assert.ok(ll3.includes('2') && ll3.includes('11'),
      `LL3 reads whole excesses, got ${ll3.join(' ')}`);
    assert.ok(!ll3.includes('2.10'), 'LL3 is not a copy of LL2');
  });
});

test('reciprocal rows graduate on the reciprocals, as the instrument prints them', () => {
  // CI reads 9 8 7 6 5 4 3 2 1 and then 9 8 7 ... again, each group a decade
  // further along, running across the rule. It used to be graduated on 1..10000
  // and placed at -log10(v), which threw everything above 1 off the left of the
  // index and left the row showing "1 2 3 4" jammed against the margin.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    for (const name of ['CI', 'DI']) {
      const row = byId(svg, `row-${name}`)[0];
      const labels = row.children
        .filter((c) => c.name === 'text' && c.textContent !== name)
        .map((c) => c.textContent);
      assert.deepEqual(labels.slice(0, 9), ['9', '8', '7', '6', '5', '4', '3', '2', '1'],
        `${name} runs backwards from its 9`);
      assert.ok(labels.length >= 18, `${name} carries two decades, got ${labels.length}`);

      const xs = row.children
        .filter((c) => c.name === 'line' && c.attrs.id === 'tick')
        .map((c) => Number(c.attrs.x1));
      assert.ok(Math.min(...xs) >= 0, `${name} does not run off the left edge`);
      assert.ok(Math.max(...xs) > RULE.axisPx * 0.9,
        `${name} runs the length of the rule`);
    }
  });
});

test('a reciprocal graduation reads back its own value', () => {
  // The position of a value on a reciprocal row must agree with the value the
  // row is supposed to be showing there, or the row is decorative.
  const g = geometry(RULE);
  for (const v of [0.9, 0.5, 0.25, 0.1]) {
    const back = g.read('CI', g.posOf('CI', v));
    assert.ok(Math.abs(back - v) < 1e-9, `CI round trip at ${v}: got ${back}`);
  }
});

test('DI is graduated on the same axis as CI', () => {
  // DI is the stock's reciprocal row and CI the slide's. They are the same
  // graduations, which is why a reciprocal can be read directly off D against
  // the one on the slide.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const xs = (name) => byId(svg, `row-${name}`)[0].children
      .filter((c) => c.name === 'line' && c.attrs.id === 'tick')
      .map((c) => Number(c.attrs.x1));
    assert.deepEqual(xs('DI'), xs('CI'), 'DI and CI share one set of graduations');
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