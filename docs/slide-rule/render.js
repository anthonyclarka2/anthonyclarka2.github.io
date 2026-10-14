/**
 * SVG renderer for the slide rule.
 *
 * This is the only module that touches the DOM. Everything it draws comes from
 * the geometry module's positions and the tween module's state, so the maths is
 * testable without a browser and this file is left as a thin adapter: given a
 * rule and a position, draw it.
 *
 * Two groups move independently. `#slide` translates horizontally for the
 * sliding rule; `#cursor` translates for the hairline. Both are plain transform
 * writes, so the rAF loop in app.js never touches layout.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./geometry.js'));
  } else {
    root.SlideRuleRender = factory(root.SlideRuleGeometry);
  }
})(typeof self !== 'undefined' ? self : globalThis, function (geometryLib) {
  'use strict';

  const { geometry } = geometryLib;

  const NS = 'http://www.w3.org/2000/svg';

  /**
   * Scale layout. Ten scales is a lot for one rule, so each is a row with a
   * height, and the rows are laid out in the order a person reads them: the
   * stock's own scales at the top, the slide's below it, the cursor last.
   */
  const STOCK_SCALES = [
    { name: 'D', label: 'D', y: 26 },
    { name: 'A', label: 'A', y: 96 },
    { name: 'CI', label: 'CI', y: 150 },
    { name: 'Ln', label: 'Ln', y: 196 },
  ];
  const SLIDE_SCALES = [
    { name: 'C', label: 'C', y: 246 },
    { name: 'B', label: 'B', y: 296 },
    { name: 'C|', label: 'C|', y: 340 },
    { name: 'K', label: 'K', y: 384 },
  ];
  // S, T and ST are projected and would push the rule past 430 tall, so they
  // share a row: only the one in use is drawn, and the row says which.
  const TRIG_SCALES = [
    { name: 'S', label: 'S', y: 234 },
    { name: 'T', label: 'T', y: 288 },
    { name: 'ST', label: 'ST', y: 342 },
  ];

  const SVG_W = 1400;
  const SVG_H = 430;
  const OVERHANG = 160; // px of slide protruding left of the stock, as on a real rule

  function el(name, attrs) {
    const node = document.createElementNS(NS, name);
    if (attrs) {
      for (const key in attrs) node.setAttribute(key, attrs[key]);
    }
    return node;
  }

  /**
   * Graduations for a scale. Each row is derived from the scale's own
   * position for a value, rather than from an independent loop, so a scale's
   * ticks always land where `read` says that scale is graduated. Computing them
   * separately is how B and K ended up running past the right edge of the rule.
   */
  function graduations(g, scale) {
    const out = [];
    // Clip to the RULE, not to the canvas. The canvas is deliberately wider so
    // the overhang has somewhere to be drawn, but a graduation printed past the
    // end of the rule is a printing error, not a graduation.
    const right = g.axisPx;
    const push = (x, label, major) => {
      if (Number.isFinite(x) && x >= -OVERHANG && x <= right) out.push({ x, label, major });
    };

    // Log and power scales: walk the values a rule actually prints.
    if (scale === 'D' || scale === 'C' || scale === 'B' || scale === 'K' || scale === 'C|') {
      // A rule prints from 1 rightwards. Decades below 1 fall on the overhang
      // and are not printed, so the walk starts at dec 0.
      for (let dec = 0; dec < g.decades; dec++) {
        for (let m = 1; m < 10; m++) {
          const value = m * Math.pow(10, dec);
          const x = g.posOf(scale, value);
          // B and K run out of rule well before D does, which is true of a real
          // rule too: three decades of D fit where the cubed scale has room for
          // only a third as many values. The loop stops when a decade no longer
          // starts on the rule, rather than drawing past the end.
          if (x > right) return out;
          // The label is the value at that tick, not the mantissa: in the
          // second decade the tick at 2x10 reads 20, and a rule prints "20".
          push(x, String(Number(value.toPrecision(12))), m === 1);
        }
      }
      return out;
    }

    if (scale === 'A') {
      // A runs 0 to 100 then restarts, so a cycle spans two decades of the
      // axis. A four decade rule is exactly two cycles wide, and because each
      // cycle covers the whole span the second has nothing left to print --
      // its 10 would sit precisely where the rule ends. So only the cycles
      // that fit are drawn, which for four decades is the first.
      for (let v = 1; v <= 100; v++) {
        for (let cycle = 0; cycle * 2 < g.decades; cycle++) {
          const x = g.posOf('A', v) + cycle * 2 * g.dpx;
          if (x > right) continue;
          // Each cycle is two decades further along the axis, and A's values grow
          // faster than the axis does, so cycle 1 runs 10 to 1000. Labelling it
          // by repeating cycle 0 would put a tick that reads 100 under the
          // label "10" and make the scale unreadable.
          const shown = v * Math.pow(10, cycle * 2) / Math.pow(10, cycle);
          // Cycle 0's 100 and cycle 1's 10 land on the same axis position with
          // the same value. A physical rule prints one graduation there, so
          // merge them and keep whichever carries a label.
          const clash = out.find((t) => Math.abs(t.x - x) < 0.5);
          if (clash) {
            if (v % 10 === 0) { clash.label = String(shown); clash.major = true; }
            continue;
          }
          push(x, v % 10 === 0 ? String(shown) : '', v % 10 === 0);
        }
      }
      out.sort((a, b) => a.x - b.x);
      return out;
    }

    if (scale === 'CI') {
      // CI runs backwards: 1 at the index, larger values to the left on the
      // overhang, which is where they sit on a physical rule.
      for (let dec = 0; dec <= g.decades; dec++) {
        for (let m = 1; m < 10; m++) {
          const x = g.posOf('CI', m * Math.pow(10, dec));
          if (x > right) continue;
          push(x, String(Number((m * Math.pow(10, dec)).toPrecision(12))), m === 1);
        }
      }
      // CI runs backwards, so it comes out right to left.
      out.sort((a, b) => a.x - b.x);
      return out;
    }

    if (scale === 'Ln') {
      // Ln k sits where D reads e^k, and e^k is 10^(k*log10 e) on a log axis.
      // So a whole unit of Ln is log10(e) = 0.434 decades wide, NOT log10(e)
      // inverted or ln(10) decades: using the wrong constant put Ln 1 three
      // decades along, where the scale reads 5.3.
      const unit = (1 / Math.LN10) * g.dpx;
      for (let k = 0; k * unit <= SVG_W; k++) {
        push(k * unit, String(k), true);
      }
      for (let k = 0; k * unit <= SVG_W; k++) {
        for (let f = 1; f < 10; f++) {
          push((k + f / 10) * unit, '', false);
        }
      }
      out.sort((a, b) => a.x - b.x);
      return out;
    }

    return out;
  }

  /** Projected scale graduations, in degrees. */
  function trigGraduations(g, scale) {
    const out = [];
    if (scale === 'ST') return out;
    for (let deg = 1; deg <= 90; deg++) {
      const x = g.posOf(scale, deg);
      if (x > g.axisPx) break;
      out.push({ x, label: String(deg), major: deg % 10 === 0 });
    }
    return out;
  }

  /**
   * Draw one scale row. `ticks` are positions; the caller has already decided
   * which scale and whether it is on the stock or the slide.
   */
  function drawScale(parent, row, ticks, opts) {
    const o = opts || {};
    const g = el('g', { class: 'scale' + (o.dim ? ' dim' : '') });
    const colour = o.dark ? 'var(--slide-ink, #cdd4dd)' : 'var(--rule-ink, #20242b)';

    for (const tick of ticks) {
      const h = tick.major ? 13 : 7;
      g.appendChild(el('line', {
        x1: tick.x.toFixed(1), x2: tick.x.toFixed(1),
        y1: row.y, y2: (row.y - h).toFixed(1),
        stroke: tick.major ? colour : 'currentColor',
        'stroke-width': tick.major ? 1.1 : 0.6,
        opacity: tick.major ? 0.95 : 0.5,
      }));
      if (tick.label && o.labels !== false) {
        const text = el('text', {
          x: tick.x.toFixed(1), y: (row.y - h - 3).toFixed(1),
          'text-anchor': 'middle',
          fill: colour,
          'font-size': tick.major ? 10 : 8.5,
          'font-family': 'var(--mono)',
          opacity: tick.major ? 0.9 : 0.65,
        });
        text.textContent = tick.label;
        g.appendChild(text);
      }
    }

    const name = el('text', {
      x: (o.dark ? SVG_W + 10 : -10).toFixed(0),
      y: (row.y + 4).toFixed(0),
      'text-anchor': o.dark ? 'start' : 'end',
      fill: colour,
      'font-size': 11,
      'font-weight': 700,
      'font-family': 'var(--mono)',
      opacity: 0.8,
    });
    name.textContent = row.label;
    g.appendChild(name);
    parent.appendChild(g);
    return g;
  }

  /**
   * Build the whole rule into an SVG element.
   *
   * @param {SVGSVGElement} svg target, emptied first
   * @param {{axisPx:number, decades:number}} options
   * @param {{trigScale?:string}} highlight which scale is in use, for emphasis
   */
  function draw(svg, options, highlight) {
    const hl = highlight || {};
    const g = geometry(options);

    svg.innerHTML = '';
    svg.setAttribute('viewBox', `${-OVERHANG} 0 ${SVG_W + OVERHANG * 2} ${SVG_H}`);

    /* -------------------------------------------------------------- the rule */
    // Stock: a pale bar behind the stock scales. Drawn first so ticks sit on it.
    svg.appendChild(el('rect', {
      x: -OVERHANG, y: 0, width: SVG_W + OVERHANG * 2, height: 216,
      fill: 'var(--stock)', stroke: 'var(--stock-edge)', 'stroke-width': 1,
      rx: 4,
    }));
    // Slide: a darker bar, offset vertically so both are visible at once. The
    // overhang to the left is real -- it is where tangent above 45 degrees is
    // read, and on a physical rule the slide genuinely sticks out there.
    svg.appendChild(el('rect', {
      x: -OVERHANG, y: 216, width: SVG_W + OVERHANG * 2, height: SVG_H - 216,
      fill: 'var(--slide)', stroke: 'var(--slide-edge)', 'stroke-width': 1,
      rx: 4,
    }));

    const stock = el('g', { id: 'stock' });
    const slide = el('g', { id: 'slide' });
    svg.appendChild(stock);
    svg.appendChild(slide);

    /* --------------------------------------------------------- stock scales */
    for (const row of STOCK_SCALES) {
      const active = hl.scale === row.name;
      const g1 = drawScale(stock, row, graduations(g, row.name), { dark: false });
      g1.classList.toggle('active', active);
      g1.classList.toggle('dim', !!hl.scale && !active);
    }

    /* --------------------------------------------------------- slide scales */
    for (const row of SLIDE_SCALES) {
      const active = hl.scale === row.name;
      const g1 = drawScale(slide, row, graduations(g, row.name), { dark: true });
      g1.classList.toggle('active', active);
      g1.classList.toggle('dim', !!hl.scale && !active);
    }

    // The trig row shares space with the slide's own scales, so it is drawn
    // only when one is actually in use.
    const trigName = hl.trigScale;
    const trigRows = trigName
      ? TRIG_SCALES.map((r) => Object.assign({}, r, { name: trigName, label: trigName }))
      : [];
    const overlay = el('g', { id: 'trig' });
    slide.appendChild(overlay);
    for (const row of trigRows) {
      const g1 = drawScale(overlay, row, trigGraduations(g, trigName), { dark: true });
      g1.classList.add('active');
    }

    /* -------------------------------------------------------------- the hairline */
    const cursor = el('g', { id: 'cursor' });
    cursor.appendChild(el('line', {
      x1: 0, x2: 0, y1: 6, y2: SVG_H - 6,
      stroke: 'var(--accent)', 'stroke-width': 1.4,
    }));
    // A small grip at the top so the cursor reads as a physical thing that
    // slides along the rule rather than a line drawn on it.
    cursor.appendChild(el('path', {
      d: 'M -7 6 L 7 6 L 0 15 Z', fill: 'var(--accent)',
    }));
    svg.appendChild(cursor);

    return { geometry: g, stock, slide, cursor, trig: overlay };
  }

  /**
   * Move the slide and the cursor. This is the only function the animation loop
   * calls per frame, and it writes nothing but two transforms.
   */
  function move(parts, slideX, cursorX) {
    parts.slide.setAttribute('transform', `translate(${slideX.toFixed(2)},0)`);
    parts.cursor.setAttribute('transform', `translate(${cursorX.toFixed(2)},0)`);
  }

  /** Highlight whichever scales the current operation reads. */
  function setHighlight(parts, scaleNames) {
    const set = new Set(Array.isArray(scaleNames) ? scaleNames : [scaleNames]);
    const apply = (parent, name) => {
      const rows = Array.prototype.slice.call(parent.querySelectorAll('.scale'));
      const idx = STOCK_SCALES.concat(SLIDE_SCALES).findIndex((r) => r.name === name);
      rows.forEach((row, i) => {
        const match = i === idx;
        row.classList.toggle('active', match);
        row.classList.toggle('dim', set.size > 0 && !match);
      });
    };
    apply(parts.stock);
    apply(parts.slide);
  }

  return { draw, move, setHighlight, graduations, trigGraduations, SVG_W, SVG_H, OVERHANG };
});