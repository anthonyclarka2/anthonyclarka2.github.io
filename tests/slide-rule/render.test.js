'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const render = require('../../docs/slide-rule/render.js');
const rule669 = require('../../docs/slide-rule/rule669.js');
const { geometry } = require('../../docs/slide-rule/geometry.js');

const RULE = { axisPx: rule669.AXIS_W, decades: 1 };
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
      // Absolute, because a mirrored row hangs its ticks downwards.
      const len = Math.abs(Number(tick.getAttribute('y1')) - Number(tick.getAttribute('y2')));
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
  // graduations are the scale. D is the busiest row on the rule -- hundredths
  // from 1 to 2, fiftieths from 2 to 4, twentieths above -- so it is the row to
  // count.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const row = byId(svg, 'row-D')[0];
    const ticks = row.children.filter((c) => c.getAttribute('id') === 'tick');
    // Grades 0 and 1 carry a printed number; grade 2 is the unlabelled
    // subdivision between them.
    const labelled = ticks.filter((c) => c.getAttribute('data-grade') === '0').length;
    assert.ok(ticks.length > 0, 'D is graduated');
    assert.ok(labelled > 0, 'D has labelled graduations');

    // The values D names between 1 and 10 are ten whole numbers and the nine
    // tenths below 2 -- nineteen labels -- and the row must carry far more marks
    // than that, or the numbers float free of a scale.
    assert.ok(labelled >= 19, `D labels ${labelled} values, expected at least 19`);
    assert.ok(ticks.length >= labelled * 5,
      `D has ${ticks.length} graduations for ${labelled} labels, too sparse`);
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
    const row = byId(svg, 'row-D')[0];
    const lens = ['0', '1', '2'].map((grade) => row.children
      .filter((c) => c.getAttribute('id') === 'tick'
        && c.getAttribute('data-grade') === grade)
      .map((t) => Math.abs(Number(t.getAttribute('y1')) - Number(t.getAttribute('y2')))));

    for (const [grade, found] of lens.entries()) {
      assert.ok(found.length > 0, `grade ${grade} exists on D`);
    }
    // Every tick of a grade is the same length, which is what makes the three
    // classes read as three classes rather than as noise.
    for (const found of lens) {
      assert.equal(new Set(found.map((n) => n.toFixed(3))).size, 1,
        'a grade is one length');
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

test('a row legend sits a couple of character widths left of its scale', () => {
  // Measured on the photographs: the legend's right edge clears the start of
  // the scale by a fraction of a row's height, not by the width of the rule. At
  // the size the legends are printed, one character is about six units, so the
  // gap is between two and three of them.
  const charW = 6;
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
  // end of the stock. LL01 is the widest name on either face, and the legend
  // column is the ivory reserved for all of them.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'back' });
    const name = byId(svg, 'row-LL01')[0].children
      .find((c) => c.name === 'text' && c.textContent === 'LL01');
    const gap = -Number(name.getAttribute('x'));
    const width = 'LL01'.length * 6.5;
    assert.ok(gap + width <= rule669.LEGEND_COL + 0.01,
      `LL01 needs ${gap + width} units of margin but the legend column is `
      + `${rule669.LEGEND_COL}`);
  });
});

test('every legend is printed black, including on the rows with red numbers', () => {
  // Read at 1:1 from the photographs, and it corrected an earlier claim: the row
  // NAMES are black on every row of both faces, and only the numbers take the
  // second, red pass. LL02, LL03, CIF and CI all carry a black name above a red
  // number on the front, and T and S do the same on the back.
  const RED_ROWS = new Set(['LL01', 'LL02', 'LL03', 'CIF', 'CI', 'DI', 'T', 'S']);
  withStubDom(() => {
    for (const face of ['front', 'back']) {
      const svg = stubNode('svg');
      render.draw(svg, RULE, { face });
      for (const row of rule669.layout(face)) {
        const name = byId(svg, `row-${row.name}`)[0].children
          .find((c) => c.name === 'text' && c.textContent === row.label);
        const fill = name.getAttribute('fill');
        assert.ok(['var(--rule-ink)', 'var(--slide-ink)'].includes(fill),
          `${row.name} legend on the ${face} face is ${fill}, not black ink`);
      }
      // And the numbers do take the row's own colour.
      for (const row of rule669.layout(face)) {
        const group = byId(svg, `row-${row.name}`)[0];
        const numbers = group.children.filter((c) => c.name === 'text'
          && c.textContent !== row.label && c.textContent !== 'not recovered');
        if (numbers.length === 0) continue;
        const want = RED_ROWS.has(row.name) ? 'var(--red-ink)' : null;
        for (const number of numbers) {
          const fill = number.getAttribute('fill');
          if (want) {
            assert.equal(fill, want, `${row.name}'s numbers are red on the ${face} face`);
          } else {
            assert.notEqual(fill, 'var(--red-ink)',
              `${row.name}'s numbers are not red on the ${face} face`);
          }
        }
      }
    }
  });
});

test("every row's graduations are printed on the piece they belong to", () => {
  // The two plates are drawn as rects behind their rows, and a row's
  // graduations are drawn ABOVE its baseline. The band's edges therefore have to
  // account for that, or the first sliding row's numbers end up printed on the
  // stock above the slide and the first stock row's end up under the slide
  // plate, where they are invisible. Neither throws; one looks like the wrong
  // boundary and the other looks like a missing scale.
  for (const face of ['front', 'back']) {
    withStubDom(() => {
      const svg = stubNode('svg');
      render.draw(svg, RULE, { face });
      const plate = byId(svg, 'slide-plate')[0];
      const top = Number(plate.getAttribute('y'));
      const bottom = top + Number(plate.getAttribute('height'));

      for (const group of byId(svg, 'row-')) {
        const onSlide = group.getAttribute('class').includes('on-slide');
        // Graduations only: a vertical line's extent is y1 to y2.
        const lines = group.children
          .filter((c) => c.getAttribute('id') === 'tick')
          .map((c) => [Number(c.getAttribute('y1')), Number(c.getAttribute('y2'))]);
        assert.ok(lines.length > 0, `${group.getAttribute('id')} is graduated`);
        const inkTop = Math.min(...lines.flat());
        const inkBottom = Math.max(...lines.flat());

        const where = onSlide ? 'the slide' : 'the stock';
        if (onSlide) {
          assert.ok(inkTop >= top && inkBottom <= bottom,
            `${face}: ${group.getAttribute('id')} is on ${where}, but its `
            + `graduations run ${inkTop.toFixed(1)}..${inkBottom.toFixed(1)} `
            + `against a plate at ${top.toFixed(1)}..${bottom.toFixed(1)}`);
        } else {
          assert.ok(inkBottom <= top || inkTop >= bottom,
            `${face}: ${group.getAttribute('id')} is on ${where}, but its `
            + `graduations run ${inkTop.toFixed(1)}..${inkBottom.toFixed(1)}, `
            + `which is inside the slide plate at ${top.toFixed(1)}..${bottom.toFixed(1)}`);
        }
      }
    });
  }
});

/**
 * Every row group in a drawn tree. `byId` matches an exact id, so a prefix has
 * to be walked: an earlier version of this test passed `byId(svg, 'row-')`,
 * which matched nothing, asserted nothing, and reported green.
 */
function rowGroups(node, out = []) {
  if (node.attrs && typeof node.attrs.id === 'string'
      && node.attrs.id.startsWith('row-')) out.push(node);
  for (const child of node.children || []) rowGroups(child, out);
  return out;
}

test("every row's graduations are printed on the piece they belong to", () => {
  // The two plates are drawn as rects behind their rows, and a row's
  // graduations are drawn ABOVE its baseline. The band's edges therefore have to
  // account for that, or the first sliding row's numbers end up printed on the
  // stock above the slide and the first stock row's end up under the slide
  // plate, where they are invisible. Neither throws; one looks like the wrong
  // boundary and the other looks like a missing scale.
  //
  // Graduation coordinates are written rounded to a tenth, so a mark whose edge
  // is mathematically flush with the plate reads as a tenth short. EPS is that
  // resolution: without it the comparison fails on a difference far below a
  // pixel, which is how this test spent one cycle failing for no reason.
  const EPS = 0.1;
  for (const face of ['front', 'back']) {
    withStubDom(() => {
      const svg = stubNode('svg');
      render.draw(svg, RULE, { face });
      const plate = byId(svg, 'slide-plate')[0];
      assert.ok(plate, `${face}: the slide is drawn as a plate`);
      const top = Number(plate.getAttribute('y'));
      const bottom = top + Number(plate.getAttribute('height'));

      const rows = rowGroups(svg);
      assert.ok(rows.length >= 10, `${face}: found every row, got ${rows.length}`);

      // Rows whose graduations are unknown are drawn as a name and nothing
      // else, rather than invented. They have no ink to place, so they are
      // listed here and checked separately: an empty row should only ever be an
      // unverified one, never a graduated scale that silently drew nothing.
      const unverified = rule669.layout(face)
        .filter((r) => r.unverified)
        .map((r) => r.name);

      for (const group of rows) {
        const onSlide = group.getAttribute('class').includes('on-slide');
        // Graduations only: a vertical line's extent is y1 to y2.
        const lines = group.children
          .filter((c) => c.getAttribute('id') === 'tick')
          .map((c) => [Number(c.getAttribute('y1')), Number(c.getAttribute('y2'))]);
        const name = group.getAttribute('id').replace('row-', '');

        if (lines.length === 0) {
          assert.ok(unverified.includes(name),
            `${face}: ${name} is graduated but drew no graduations`);
          continue;
        }

        const inkTop = Math.min(...lines.flat());
        const inkBottom = Math.max(...lines.flat());

        const where = onSlide ? 'the slide' : 'the stock';
        if (onSlide) {
          assert.ok(inkTop >= top - EPS && inkBottom <= bottom + EPS,
            `${face}: ${name} is on ${where}, but its graduations run `
            + `${inkTop.toFixed(1)}..${inkBottom.toFixed(1)} `
            + `against a plate at ${top.toFixed(1)}..${bottom.toFixed(1)}`);
        } else {
          assert.ok(inkBottom <= top + EPS || inkTop >= bottom - EPS,
            `${face}: ${name} is on ${where}, but its graduations run `
            + `${inkTop.toFixed(1)}..${inkBottom.toFixed(1)}, `
            + `which is inside the slide plate at ${top.toFixed(1)}..${bottom.toFixed(1)}`);
        }
      }
    });
  }
});

test('the slide is drawn with the dividing line the instrument carries', () => {
  // Not the same thing as a seam. A seam is a gap between two pieces and is
  // drawn as the edge of the plate; this is a line PRINTED on the bar, so it
  // belongs inside the slide group and travels with it. Drawing it as an edge
  // would make the slide look like two stacked bars.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const slide = byId(svg, 'slide')[0];
    const lines = slide.children
      .filter((c) => c.getAttribute('id') === 'slide-midline');
    assert.equal(lines.length, 1, 'the slide carries one dividing line');
    assert.equal(lines[0].getAttribute('id'), 'slide-midline');
  });
});

test('the dividing line is inside the slide, where it can be seen', () => {
  for (const face of ['front', 'back']) {
    withStubDom(() => {
      const svg = stubNode('svg');
      render.draw(svg, RULE, { face });
      const plate = byId(svg, 'slide-plate')[0];
      const top = Number(plate.getAttribute('y'));
      const bottom = top + Number(plate.getAttribute('height'));
      const mid = Number(byId(svg, 'slide-midline')[0].getAttribute('y1'));

      assert.ok(mid > top && mid < bottom,
        `${face}: the line at ${mid} is outside the slide plate `
        + `${top}..${bottom}, so it would be invisible`);
      assert.ok(Math.abs(mid - rule669.slideMidline(face)) < 0.01,
        `${face}: the line is drawn where the layout says it is`);
    });
  }
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
    // the planner aims the cursor at, and the number printed there must be
    // anchored the way the instrument prints it: its LAST character starting at
    // the graduation, so the tick runs up between that character and the ones
    // before it. Subtracting one character's width from the text's x recovers
    // the graduation the number belongs to.
    const want = g.posOf('D', 2);
    const row = byId(svg, 'row-D')[0];
    const twos = row.children
      .filter((c) => c.name === 'text' && c.textContent === '2')
      .map((c) => Number(c.attrs.x) - 0.62 * Number(c.attrs['font-size']));
    assert.ok(twos.length >= 1, 'D prints a 2');
    const whole = twos.filter((x) => Math.abs(x - want) < 1);
    assert.equal(whole.length, 1,
      `D prints its 2 at geometry's ${want}, got ${twos.join(', ')}`);
    // And the other one is where 1.2 is, which is the convention above.
    assert.ok(twos.some((x) => Math.abs(x - g.posOf('D', 1.2)) < 1),
      'D also prints the tenths digit at 1.2');
  });
});

test('a printed number is anchored so its last character starts at its graduation', () => {
  // Read at 1:1 from the instrument: `.50` comes out `.5` left of the tick and
  // `0` right of it, `45` comes out with the 4 and the 5 either side, and a
  // single digit sits wholly to the right. One rule covers all three -- the
  // string ends one character-width past the tick -- and it is what makes a
  // number read as belonging to its own graduation rather than sitting near it.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    for (const name of ['C', 'D', 'LL02', 'LL3', 'CI']) {
      const row = byId(svg, `row-${name}`)[0];
      for (const text of row.children.filter((c) => c.name === 'text')) {
        if (text.textContent === name || text.textContent === 'not recovered') continue;
        assert.equal(text.getAttribute('text-anchor'), 'end',
          `${name}: a number is anchored by its end`);
        const tickX = Number(text.attrs.x) - 0.62 * Number(text.attrs['font-size']);
        // And the graduation it belongs to is one the row actually marks.
        const xs = row.children
          .filter((c) => c.attrs.id === 'tick')
          .map((c) => Number(c.attrs.x1));
        assert.ok(xs.some((x) => Math.abs(x - tickX) < 0.6),
          `${name}: "${text.textContent}" is anchored to a tick, nearest difference `
          + `${Math.min(...xs.map((x) => Math.abs(x - tickX))).toFixed(2)}`);
      }
    }
  });
});

test('a tenth of the opening interval is printed as its own digit', () => {
  // Read at 1:1 from the front photograph: between the index and the 2, C and D
  // print 1 2 3 4 5 6 7 8 9 for one and a tenth through one and nine tenths.
  // The leading figure is the one the index has already given the reader, which
  // is why the photographs show `1` twice in a row at the start of the scale.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const row = byId(svg, 'row-C')[0];
    const labels = row.children
      .filter((c) => c.name === 'text' && c.textContent !== 'C')
      .map((c) => ({
        x: Number(c.attrs.x) - 0.62 * Number(c.attrs['font-size']),
        s: c.textContent,
      }))
      .sort((a, b) => a.x - b.x);

    const near = (v) => labels.find((l) => Math.abs(l.x - g.posOf('C', v)) < 1);
    assert.equal(near(1).s, '1', 'the index prints 1');
    assert.equal(near(1.1).s, '1', 'a tenth prints 1');
    assert.equal(near(1.2).s, '2', 'two tenths prints 2');
    assert.equal(near(1.9).s, '9', 'nine tenths prints 9');
    assert.equal(near(2).s, '2', 'and the whole number two prints 2 again');
    assert.equal(near(10).s, '10', 'the far end prints 10');
    // Above 2 the tenths are marked but not named: a rule labels the integers
    // and nothing else up there, which is what keeps the row legible.
    for (const v of [3.5, 6.5, 8.5]) {
      assert.equal(labels.filter((l) => Math.abs(l.x - g.posOf('C', v)) < 1).length, 0,
        `nothing is printed at ${v}`);
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
  // wrong, not merely crowded. LL1 is on the back; LL2 is its counterpart on the
  // front, and both are checked because a row drawn with the wrong table is
  // exactly the kind of error that survives one face being looked at.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'back' });
    const ll1 = byId(svg, 'row-LL1')[0].children
      .filter((c) => c.name === 'text').map((c) => c.textContent);
    assert.ok(ll1.includes('1.01'), `LL1 prints 1.01, got ${ll1.join(' ')}`);
    assert.ok(ll1.includes('1.1'), `LL1 prints 1.1, got ${ll1.join(' ')}`);
    assert.ok(!ll1.includes('10'), 'LL1 does not print an ordinary log 10');
    assert.ok(!ll1.includes('1000'), 'LL1 does not run out to 1000');
  });
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const ll3 = byId(svg, 'row-LL3')[0].children
      .filter((c) => c.name === 'text').map((c) => c.textContent);
    assert.ok(ll3.includes('e'), `LL3 names the e it opens on, got ${ll3.join(' ')}`);
    assert.ok(ll3.includes('20000'), `LL3 runs out to 20000, got ${ll3.join(' ')}`);
    assert.ok(ll3.includes('20') && ll3.includes('30'), 'and carries the tens between');
    assert.ok(ll3.includes('500'), 'and the hundreds that a reader aims at');
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

test('each log-log row prints the list of values it carries', () => {
  // These rows are the one kind of scale whose labels are a list rather than a
  // rule, so the list is data. A row drawn from another row's list would look
  // entirely plausible and be wrong at every mark after the first.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const labelsFor = (name) => byId(svg, `row-${name}`)[0].children
      .filter((c) => c.name === 'text' && c.textContent !== name)
      .map((c) => c.textContent);

    const ll2 = labelsFor('LL2');
    assert.ok(ll2.includes('1.11'), `LL2 opens at 1.11, got ${ll2.join(' ')}`);
    assert.ok(ll2.includes('1.15'), 'LL2 carries 1.15');
    assert.ok(ll2.includes('2.5'), 'LL2 carries 2.5');
    assert.ok(ll2.includes('e'), 'and names e at its far end');
    assert.ok(!ll2.includes('1.01'), 'LL2 is not a copy of LL1');

    const ll3 = labelsFor('LL3');
    assert.ok(ll3.includes('3') && ll3.includes('10'),
      `LL3 reads whole numbers, got ${ll3.join(' ')}`);
    assert.ok(ll3.includes('500') && ll3.includes('1000'),
      'and then the hundreds');
    assert.ok(!ll3.includes('2.10'), 'LL3 is not a copy of LL2');

    const ll02 = labelsFor('LL02');
    assert.ok(ll02.includes('.90') && ll02.includes('.88'),
      `LL02 opens .90 .88, got ${ll02.join(' ')}`);
    assert.ok(ll02.includes('.50'), 'and runs down through .50');
    assert.ok(ll02.includes('1/e'), 'closing on the 1/e the instrument prints');
  });
});

test('the rows below one print their numbers falling, as the instrument does', () => {
  // LL02 runs .90 .88 .86 ... 50 45 40 left to right, with the largest value at
  // the index. A row drawn in mirror image is the kind of error that reads as
  // plausible until it is compared with the photograph.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const ll02 = byId(svg, 'row-LL02')[0].children
      .filter((c) => c.name === 'text' && c.textContent !== 'LL02')
      .map((c) => ({ x: Number(c.attrs.x), s: c.textContent }))
      .sort((a, b) => a.x - b.x);
    assert.equal(ll02[0].s, '.90', 'the index carries the largest value');
    assert.equal(ll02[1].s, '.88', 'and the numbers fall from there');
    assert.equal(ll02[ll02.length - 1].s, '1/e', 'to the 1/e at the far end');
  });
});

test('a reciprocal row prints its numbers falling from ten to one', () => {
  // Read at 1:1 from the front photograph: CI's index is 10 in red, and the
  // numbers fall 9 8 7 as the eye runs right, closing on 1 at the far end. It is
  // one decade, like every other row on the rule -- an earlier model gave it two
  // and drew "1 2 3 4" jammed against the margin.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const row = byId(svg, 'row-CI')[0];
    const labels = row.children
      .filter((c) => c.name === 'text' && c.textContent !== 'CI')
      .map((c) => ({
        x: Number(c.attrs.x) - 0.62 * Number(c.attrs['font-size']),
        s: c.textContent,
      }))
      .sort((a, b) => a.x - b.x);

    assert.equal(labels[0].s, '10', 'the index reads 10');
    // Read at the positions geometry puts the whole numbers at, because the
    // tenths of the opening interval print their digit alone and so contribute
    // digits of their own to the row.
    const at = (v) => labels.find((l) => Math.abs(l.x - g.posOf('CI', v)) < 1);
    for (const v of [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]) {
      const found = at(v);
      assert.ok(found, `CI prints its ${v}`);
      assert.equal(found.s, String(v), `CI's ${v} prints as ${v}`);
    }
    // And they fall left to right, which is the whole character of the row.
    for (let i = 1; i < labels.length; i++) {
      assert.ok(labels[i].x > labels[i - 1].x, 'labels run left to right');
    }
    assert.ok(g.posOf('CI', 10) < g.posOf('CI', 1), 'and the values fall as they do');

    const xs = row.children
      .filter((c) => c.name === 'line' && c.attrs.id === 'tick')
      .map((c) => Number(c.attrs.x1));
    assert.ok(Math.min(...xs) >= 0, 'CI does not run off the left edge');
    assert.ok(Math.max(...xs) > RULE.axisPx * 0.9, 'CI runs the length of the rule');
  });
});

test('a reciprocal graduation reads back its own value', () => {
  // The position of a value on a reciprocal row must agree with the value the
  // row is supposed to be showing there, or the row is decorative.
  const gg = geometry(RULE);
  for (const v of [10, 7, 4, 2, 1]) {
    const back = gg.read('CI', gg.posOf('CI', v));
    assert.ok(Math.abs(back - v) < 1e-9, `CI round trip at ${v}: got ${back}`);
  }
});

test('DI is graduated on the same axis as CI', () => {
  // DI is the stock's reciprocal row and CI the slide's. They are the same
  // graduations, which is why a reciprocal can be read directly off D against
  // the one on the slide. Drawn on the back, where DI is printed.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'back' });
    const xs = (name) => byId(svg, `row-${name}`)[0].children
      .filter((c) => c.name === 'line' && c.attrs.id === 'tick')
      .map((c) => Number(c.attrs.x1));
    withStubDom(() => {
      const front = stubNode('svg');
      render.draw(front, RULE, { face: 'front' });
      const ci = byId(front, 'row-CI')[0].children
        .filter((c) => c.name === 'line' && c.attrs.id === 'tick')
        .map((c) => Number(c.attrs.x1));
      assert.deepEqual(xs('DI'), ci, 'DI and CI share one set of graduations');
    });
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

test('LL02 is graduated exactly as the instrument was read', () => {
  // Dictated from the instrument, tick by tick, and the reason the regions model
  // exists. Each of these is a claim about a specific graduation a reader can go
  // and check against the photograph, so a regression here is a row drawn wrong
  // rather than merely a row drawn differently.
  const ll02 = rule669.layout('front').find((r) => r.name === 'LL02');
  assert.ok(ll02.regions, 'LL02 carries its regions');

  const ticks = render.graduations(g, ll02).slice().sort((a, b) => a.x - b.x);
  const at = (label) => ticks.find((t) => t.label === label);
  const between = (a, b) => ticks.filter((t) => t.x > at(a).x && t.x < at(b).x);

  // The row opens on one long tick, then four short ones, and only then the
  // first number. Its left-hand end is at e^-0.1, which the instrument does not
  // name: the first number printed is `.90`, one step in.
  const head = ticks.slice(0, 6);
  assert.deepEqual(head.map((t) => t.grade), [0, 2, 2, 2, 2, 0],
    'one long, four short, then the .90 long');
  assert.equal(head[5].label, '.90', 'and .90 is the first number');
  assert.ok(Math.abs(head[0].x) < 1e-6, 'the bare tick is the row index');

  // Twenty ticks from .90 to .88, with the fives medium and the tens long.
  const a = between('.90', '.88');
  assert.equal(a.length, 19, '19 marks between, so .88 is the twentieth');
  assert.equal(a[4].grade, 1, 'the fifth is medium');
  assert.equal(a[9].grade, 0, 'the tenth is long, as long as .90');
  assert.equal(a[14].grade, 1, 'the fifteenth is medium');
  assert.equal(a.filter((t) => t.grade === 0).length, 1,
    'and the only long mark between them is the ten');

  // The same for .86, .84, .82 and .80.
  for (const [hi, lo] of [['.88', '.86'], ['.86', '.84'], ['.84', '.82'], ['.82', '.80']]) {
    const span = between(hi, lo);
    assert.equal(span.length, 19, `${hi} to ${lo} has 19 marks between`);
    assert.equal(span[4].grade, 1, `${hi} to ${lo}: the fifth is medium`);
    assert.equal(span[9].grade, 0, `${hi} to ${lo}: the tenth is long`);
    assert.equal(span[14].grade, 1, `${hi} to ${lo}: the fifteenth is medium`);
  }

  // Then twenty-five ticks to .75, with every fifth one medium and no long ones
  // between: from .80 down the instrument counts in fives and prints every
  // twenty-fifth.
  const b = between('.80', '.75');
  assert.equal(b.length, 24, '24 marks between, so .75 is the twenty-fifth');
  assert.deepEqual([4, 9, 14, 19].map((i) => b[i].grade), [1, 1, 1, 1],
    'every fifth mark is medium');
  assert.equal(b.filter((t) => t.grade === 0).length, 0,
    'and nothing between two numbers is printed long');

  // The pattern continues to the foot of the row.
  for (const [hi, lo] of [['.75', '.70'], ['.70', '.65'], ['.65', '.60'],
    ['.60', '.55'], ['.55', '.50'], ['.50', '.45'], ['.45', '.40']]) {
    const span = between(hi, lo);
    assert.equal(span.length, 24, `${hi} to ${lo} has 24 marks between`);
    assert.deepEqual([4, 9, 14, 19].map((i) => span[i].grade), [1, 1, 1, 1],
      `${hi} to ${lo}: every fifth mark is medium`);
  }

  // And the numbers are the ones the photographs show, in that order.
  assert.deepEqual(ticks.filter((t) => t.label).map((t) => t.label),
    ['.90', '.88', '.86', '.84', '.82', '.80', '.75', '.70', '.65', '.60',
      '.55', '.50', '.45', '.40', '1/e'],
    'the numbers LL02 prints, left to right');
});

test('LL03 is graduated exactly as the instrument was read', () => {
  // Dictated from the instrument mark by mark. Notable because it is the row
  // where grade and label come apart: `.005`, `.002` and `.001` are printed on
  // MEDIUM ticks while `.0005`, `.0002` and `.0001` are printed on long ones, so
  // a model that graded a mark by whether it carried a number would get half of
  // them wrong.
  const ll03 = rule669.layout('front').find((r) => r.name === 'LL03');
  const ticks = render.graduations(g, ll03).slice().sort((a, b) => a.x - b.x);
  const at = (label) => ticks.find((t) => t.label === label);
  const between = (a, b) => ticks.filter((t) => t.x > at(a).x && t.x < at(b).x);
  const grades = (list) => {
    const out = { 0: 0, 1: 0, 2: 0 };
    for (const t of list) out[t.grade]++;
    return out;
  };

  // The row opens on a MEDIUM tick carrying the printed name -- not a long one,
  // which is what LL02 opens with.
  const head = ticks.slice(0, 10);
  assert.equal(head[0].grade, 1, 'the opening tick is medium');
  assert.equal(head[0].label, '1/e', 'and carries the printed 1/e');
  assert.deepEqual(head.slice(1).map((t) => t.grade), [2, 2, 2, 1, 2, 2, 2, 2, 0],
    'three short, one medium, four short, then .35 long');
  assert.equal(head[9].label, '.35', 'and .35 is the first number below the name');

  // .35 to .30: twenty-five ticks, the fives medium, the twenty-fifth large.
  for (const [hi, lo] of [['.35', '.30'], ['.30', '.25'], ['.25', '.20'], ['.20', '.15'], ['.15', '.10']]) {
    const span = between(hi, lo);
    assert.equal(span.length, 24, `${hi} to ${lo} has 24 marks between`);
    assert.deepEqual([4, 9, 14, 19].map((i) => span[i].grade), [1, 1, 1, 1],
      `${hi} to ${lo}: the 5th, 10th, 15th and 20th are medium`);
    assert.deepEqual(grades(span), { 0: 0, 1: 4, 2: 20 },
      `${hi} to ${lo}: and nothing else is marked longer`);
    assert.equal(at(lo).grade, 0, `${lo} itself is a long tick`);
  }

  // .10 to .05: fifty ticks, every tenth large, the fives medium.
  const tenths = between('.10', '.05');
  assert.equal(tenths.length, 49, '.05 is the fiftieth tick');
  assert.deepEqual(grades(tenths), { 0: 4, 1: 5, 2: 40 },
    'four large, five medium, the rest short');
  assert.deepEqual([4, 14, 24, 34, 44].map((i) => tenths[i].grade), [1, 1, 1, 1, 1],
    'every fifth mark is medium');
  assert.deepEqual([9, 19, 29, 39].map((i) => tenths[i].grade), [0, 0, 0, 0],
    'every tenth mark is large');
  assert.equal(at('.05').grade, 0, 'and .05 is large');

  // .05 to .04: ten ticks with the fifth medium; the same to .03 and .02.
  for (const [hi, lo] of [['.05', '.04'], ['.04', '.03'], ['.03', '.02']]) {
    const span = between(hi, lo);
    assert.equal(span.length, 9, `${hi} to ${lo} has 9 marks between, so ten ticks`);
    assert.deepEqual(grades(span), { 0: 0, 1: 1, 2: 8 }, `${hi} to ${lo}: only the fifth is medium`);
    assert.equal(span[4].grade, 1, `${hi} to ${lo}: and it is the fifth`);
    assert.equal(at(lo).grade, 0, `${lo} is a long tick`);
  }

  // .02 to .01: twenty ticks, alternating, with the tenth and twentieth large.
  const halves = between('.02', '.01');
  assert.equal(halves.length, 19, 'twenty ticks to .01');
  assert.equal(halves[9].grade, 0, 'the tenth is large');
  assert.equal(at('.01').grade, 0, 'and .01, the twentieth, is large');
  assert.equal(halves[0].grade, 2, 'the alternation starts short');
  assert.deepEqual(halves.map((t) => t.grade).filter((gr) => gr === 1).length, 8,
    'eight medium marks run between the two large ones');

  // .01 to .005: twenty-five ticks, every fifth medium -- so .005 is medium.
  const thousands = between('.01', '.005');
  assert.equal(thousands.length, 24, '.005 is the twenty-fifth tick');
  assert.equal(at('.005').grade, 1, '.005 sits on a medium tick');
  assert.equal(grades(thousands)[1], 4, 'and four more are medium');
  // .005 to .002: the same, with .002 also medium.
  const thousands2 = between('.005', '.002');
  assert.equal(thousands2.length, 14, 'fifteen ticks to .002');
  assert.equal(at('.002').grade, 1, '.002 sits on a medium tick');
  // .002 to .001: ten ticks, the fifth medium, .001 medium.
  const lastThousands = between('.002', '.001');
  assert.equal(lastThousands.length, 9, 'ten ticks to .001');
  assert.equal(lastThousands[4].grade, 1, 'the fifth is medium');
  assert.equal(at('.001').grade, 1, '.001 sits on a medium tick');

  // And below a thousandth the printed numbers go on LONG ticks.
  const four = between('.001', '.0005');
  assert.equal(four.length, 4, 'just four marks between');
  assert.deepEqual(grades(four), { 0: 0, 1: 0, 2: 4 }, 'all four short');
  assert.equal(at('.0005').grade, 0, '.0005 sits on a long tick');

  const next = between('.0005', '.0002');
  assert.equal(next.length, 14, 'fifteen ticks to .0002');
  assert.equal(next[4].grade, 1, 'the fifth is medium');
  assert.equal(next[9].grade, 1, 'and the tenth');
  assert.equal(at('.0002').grade, 0, '.0002 sits on a long tick');

  const next2 = between('.0002', '.0001');
  assert.equal(next2.length, 9, 'ten ticks to .0001');
  assert.equal(next2[4].grade, 1, 'the fifth is medium');
  assert.equal(at('.0001').grade, 0, '.0001 sits on a long tick');

  // The foot: four short, one medium, and a bare long tick to end the row. The
  // last number the instrument prints on this row is `.0001`.
  const tail = ticks.filter((t) => t.x > at('.0001').x);
  assert.deepEqual(tail.map((t) => t.grade), [2, 2, 2, 2, 1, 0],
    'four short, one medium, then the long tick at the row foot');
  assert.ok(Math.abs(tail[5].x - g.axisPx) < 1e-6, 'and is the row foot itself');
  assert.deepEqual(tail.map((t) => t.label).filter(Boolean), [],
    'nothing past .0001 is printed');

  assert.deepEqual(ticks.filter((t) => t.label).map((t) => t.label),
    ['1/e', '.35', '.30', '.25', '.20', '.15', '.10', '.05', '.04', '.03', '.02',
      '.01', '.005', '.002', '.001', '.0005', '.0002', '.0001'],
    'the numbers LL03 prints, left to right');
});

/* ------------------------------------------------------ the folded pair */

test('CF and DF are graduated exactly as the instrument was read', () => {
  // Dictated off the instrument, and the pair the walk changed most: they are
  // mirror images, so one description serves both, and their numbers are the
  // instrument's mantissa reading -- 1 for ten, with the small 1 to 9 printed
  // between the major 1 and 2 for eleven through nineteen.
  const df = rule669.layout('front').find((r) => r.name === 'DF');
  const ticks = render.graduations(g, df).slice().sort((a, b) => a.x - b.x);
  const labels = ticks.filter((t) => t.label);
  // The same digit can be printed twice -- a major number and the small one
  // inside the next interval -- so a lookup says which it wants.
  const at = (label, want) => labels.find(
    (t) => t.label === label && (want === undefined || t.small === want),
  );
  const between = (a, b) => ticks.filter(
    (t) => t.x > at(a, false).x && t.x < at(b, false).x,
  );
  const grades = (list) => {
    const out = { 0: 0, 1: 0, 2: 0 };
    for (const t of list) out[t.grade]++;
    return out;
  };

  // The scale opens on pi in black with a long tick under it, then two short and
  // one medium -- 3.20 -- and from there four short and a medium repeat until the
  // long tick at 3.5, which carries no number.
  assert.equal(ticks[0].label, 'π', 'the row opens on pi');
  assert.equal(ticks[0].grade, 0, 'on a long tick');
  assert.ok(Math.abs(ticks[0].x) < 1e-6, 'at the index');
  assert.deepEqual(ticks.slice(1, 5).map((t) => t.grade), [2, 2, 1, 2],
    'two short, one medium, then short again');
  // From pi the marks run in two-hundredths, and the run up to the long 3.5 is
  // dictated exactly: two short, a medium, then four short and a medium twice
  // more, then four short and the long tick that carries no number.
  const threeFiveAt = g.posOf('DF', 3.5);
  const toThreeFive = ticks.filter((t) => t.x <= threeFiveAt + 0.6);
  assert.equal(toThreeFive.length, 19, 'the opening pi and eighteen marks to 3.5');
  assert.equal(toThreeFive[0].label, 'π', 'the first of them is pi');
  assert.deepEqual(toThreeFive.slice(1).map((t) => t.grade),
    [2, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 0],
    'two short, a medium, then four short and a medium, twice, then the long 3.5');
  const threeFive = toThreeFive[toThreeFive.length - 1];
  assert.equal(threeFive.label, '', 'and 3.5 carries no number');
  const toFour = between('π', '4');
  assert.equal(toFour.length, 42, 'the stretch from pi runs to 4 in two-hundredths');

  // 4 to 5 is twenty ticks: short and medium alternating, with the tenth large.
  for (const [hi, lo] of [['4', '5'], ['5', '6'], ['6', '7'], ['7', '8'], ['8', '9'], ['9', '1']]) {
    const span = between(hi, lo);
    assert.equal(span.length, 19, `${hi} to ${lo} is twenty ticks`);
    assert.deepEqual(grades(span), { 0: 1, 1: 8, 2: 10 },
      `${hi} to ${lo}: one large, eight medium, the rest short`);
    assert.equal(span[9].grade, 0, `${hi} to ${lo}: the tenth is the large half`);
  }

  // 1 to 2 -- that is, ten to twenty -- has ten ticks between each number, the
  // 5th medium and the 10th large, and its numbers are printed smaller.
  const tenToTwenty = between('1', '2');
  assert.equal(tenToTwenty.length, 99, 'ten ticks between each of the ten numbers');
  assert.deepEqual(grades(tenToTwenty), { 0: 9, 1: 10, 2: 80 },
    'nine larges, ten mediums, the rest short');
  assert.deepEqual(tenToTwenty.map((t) => t.grade).filter((gr) => gr === 0).length, 9,
    'a large at every whole number from 11 to 19');

  // 2 to 3 has fifty ticks, every fifth medium except 25, which is large.
  const twentyToThirty = between('2', '3');
  assert.equal(twentyToThirty.length, 49, 'fifty ticks from 20 to 30');
  assert.deepEqual(grades(twentyToThirty), { 0: 1, 1: 8, 2: 40 },
    'one large -- the 25 -- eight medium, the rest short');
  const twentyFive = ticks.find((t) => !t.label && Math.abs(t.x - g.posOf('DF', 25)) < 0.6);
  assert.equal(twentyFive.grade, 0, 'and the one large tick is at 25');

  // After 30: four short, one medium, one short, then the long tick at ten pi
  // with the pi symbol on it.
  const thirties = ticks.filter((t) => t.x > labels.filter((l) => l.label === '3').pop().x);
  assert.deepEqual(thirties.map((t) => t.grade), [2, 2, 2, 2, 1, 2, 0],
    'four short, a medium, a short, then the long tick at the row foot');
  assert.equal(thirties[thirties.length - 1].label, 'π', 'which carries the closing pi');
  assert.ok(Math.abs(thirties[thirties.length - 1].x - g.axisPx) < 1e-6, 'at the far end');

  // And the numbers, with the small ones marked as the instrument prints them.
  const shown = labels.map((t) => t.label + (t.small ? '(small)' : ''));
  assert.deepEqual(shown, ['π', '4', '5', '6', '7', '8', '9', '1',
    '1(small)', '2(small)', '3(small)', '4(small)', '5(small)', '6(small)',
    '7(small)', '8(small)', '9(small)', '2', '3', 'π'],
    'the numbers CF and DF print, with the small ones marked');
});

test('CF is the mirror of DF: its ticks hang from the top of its row', () => {
  // The two rows point away from each other across the seam, which is what makes
  // them read as one folded scale. DF hangs its ticks up from its baseline with
  // its numbers above them; CF begins its ticks at the top of the slide and runs
  // them downwards with its numbers below.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    const dfRow = rule669.layout('front').find((r) => r.name === 'DF');
    const cfRow = rule669.layout('front').find((r) => r.name === 'CF');

    const ticksOf = (name) => byId(svg, `row-${name}`)[0].children
      .filter((c) => c.attrs.id === 'tick')
      .map((c) => ({ y1: Number(c.attrs.y1), y2: Number(c.attrs.y2) }));

    for (const t of ticksOf('DF')) {
      assert.ok(t.y2 < t.y1, 'DF hangs its ticks upward from its baseline');
      assert.ok(t.y1 <= dfRow.y + 1e-6, 'from the baseline');
    }
    for (const t of ticksOf('CF')) {
      assert.ok(t.y2 > t.y1, 'CF runs its ticks downward from the top of its row');
      // Tolerated to a tenth, which is the resolution tick coordinates are
      // written at.
      assert.ok(Math.abs(t.y1 - (cfRow.y - cfRow.height)) < 0.1,
        'from the top of the slide, which is the seam');
    }

    // The consequence for the drawing: the two rows' ticks lie on opposite
    // sides of the seam they share. DF's occupy the lower half of its row and
    // CF's the upper half of its own, so the pair point away from each other.
    const midOf = (name) => {
      const ys = ticksOf(name).flatMap((t) => [t.y1, t.y2]);
      return (Math.min(...ys) + Math.max(...ys)) / 2;
    };
    assert.ok(midOf('DF') > dfRow.y - dfRow.height / 2,
      "DF's ticks sit in the lower half of its row");
    assert.ok(midOf('CF') < cfRow.y - cfRow.height / 2,
      "CF's ticks sit in the upper half of its row");
    // Which is to say: both rows' ticks are on the seam's side of their own
    // middle, DF reaching up to it and CF hanging down from it.
    const seam = rule669.slideBand('front').top;
    assert.ok(Math.max(...ticksOf('DF').flatMap((t) => [t.y1, t.y2])) <= seam + 0.1,
      "DF's ticks do not cross the seam");
    assert.ok(Math.min(...ticksOf('CF').flatMap((t) => [t.y1, t.y2])) >= seam - 0.1,
      "and neither do CF's");
  });
});

test('the folded pair centres its numbers over their graduations', () => {
  // Read off the instrument: every number from pi to the major 1 sits over the
  // middle of its long tick. That is a different placement from C, D and the
  // log-log rows, which anchor a number by its end so the tick runs between its
  // last two characters.
  withStubDom(() => {
    const svg = stubNode('svg');
    render.draw(svg, RULE, { face: 'front' });
    for (const name of ['DF', 'CF']) {
      const row = byId(svg, `row-${name}`)[0];
      const ticks = row.children
        .filter((c) => c.attrs.id === 'tick').map((c) => Number(c.attrs.x1));
      const numbers = row.children.filter((c) => c.name === 'text'
        && c.textContent !== name && c.textContent !== 'not recovered');
      assert.ok(numbers.length > 10, `${name} prints its numbers`);
      for (const text of numbers) {
        assert.equal(text.getAttribute('text-anchor'), 'middle',
          `${name}: "${text.textContent}" is centred`);
        const x = Number(text.attrs.x);
        assert.ok(ticks.some((t) => Math.abs(t - x) < 0.05),
          `${name}: "${text.textContent}" sits on a graduation`);
      }
    }
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
    // The marker slides along the bar it sits on, so it moves by position, and
    // the bar starts at the left edge of what is drawn -- the legend column and
    // the end cap, not the index.
    const want = render.drawnExtent(RULE.axisPx).left + 200;
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