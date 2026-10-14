/**
 * SVG renderer for the K&E 669.
 *
 * The only module that touches the DOM. It draws from two sources of truth and
 * invents nothing: `geometry` says where each graduation falls, and `rule669`
 * says which rows exist, which piece of material each is printed on, and which
 * of them could not be read off the photographs. That last part matters -- the
 * rows whose graduations are unknown are drawn as a name and left blank, because
 * plausible invented ticks would be worse than an honest gap.
 *
 * The rule is drawn as two pieces. The fixed scale plate carries the rows above
 * and below the band; the sliding plate carries the band's rows and lives inside
 * the `#slide` group so it travels. A seam separates them, sized by `rule669`
 * rather than chosen here, so the renderer cannot quietly draw the rule as one
 * continuous strip.
 *
 * The cursor is drawn as the instrument's glass: a transparent body with a metal
 * surround, four corner screws, and a hairline down the middle. It is the piece
 * of the drawing a viewer reads first, so it gets more geometry than the rest.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./geometry.js'), require('./rule669.js'));
  } else {
    root.SlideRuleRender = factory(root.SlideRuleGeometry, root.SlideRule669);
  }
})(typeof self !== 'undefined' ? self : globalThis, function (geometryLib, rule669) {
  'use strict';

  const { geometry } = geometryLib;
  const NS = 'http://www.w3.org/2000/svg';

  /* How far the slide protrudes left of the stock. Tangent above 45 degrees
     falls off the left of the index, and on the instrument that is the part of
     the slide sticking out beyond the fixed plate. */
  const OVERHANG = 160;

  /* The end caps the photographs show at both ends of the rule. */
  const CAP_W = 46;

  function el(name, attrs) {
    const node = document.createElementNS(NS, name);
    if (attrs) {
      for (const key in attrs) {
        if (attrs[key] !== undefined && attrs[key] !== null) {
          node.setAttribute(key, attrs[key]);
        }
      }
    }
    return node;
  }

  /* ---------------------------------------------------------- graduations */

  /**
   * The values a row prints, as graduations on the rule.
   *
   * Every scale here is a graduation of the one logarithmic stock, so the list
   * is "which values does this row mark" and the position comes from geometry.
   * Writing the positions out again here is how the renderer and the planner
   * came to disagree about where a 2 was.
   */
  function graduations(g, row) {
    if (row.kind === 'unverified') return [];

    const out = [];
    const push = (x, label, major) => {
      if (Number.isFinite(x) && x >= -OVERHANG && x <= g.axisPx) out.push({ x, label, major });
    };

    const scale = scaleFor(row);

    if (row.kind === 'log') {
      for (let dec = 0; dec < g.decades; dec++) {
        for (let m = 1; m < 10; m++) {
          const v = m * Math.pow(10, dec);
          const x = g.posOf(scale, v);
          if (x > g.axisPx) return out;
          push(x, String(Number(v.toPrecision(12))), m === 1);
        }
      }
      return out;
    }

    if (row.kind === 'square') {
      // A runs 0 to 100 and then restarts. One cycle spans two decades, so a
      // four decade rule shows exactly one and the second would begin precisely
      // where the rule ends.
      for (let v = 1; v <= 100; v++) {
        const x = g.posOf(scale, v);
        if (x > g.axisPx) break;
        push(x, v % 10 === 0 ? String(v) : '', v % 10 === 0);
      }
      return out;
    }

    if (row.kind === 'cube' || row.kind === 'reciprocal') {
      for (let dec = 0; dec < g.decades; dec++) {
        for (let m = 1; m < 10; m++) {
          const v = m * Math.pow(10, dec);
          const x = g.posOf(scale, v);
          if (x > g.axisPx) return out;
          push(x, String(Number(v.toPrecision(12))), m === 1);
        }
      }
      return out;
    }

    if (row.kind === 'projected') {
      for (let deg = 1; deg <= 90; deg++) {
        const x = g.posOf(scale, deg);
        if (x > g.axisPx) break;
        push(x, String(deg), deg % 10 === 0);
      }
      return out;
    }

    return out;
  }

  /** Which of geometry's named scales a row's graduations are read from. */
  function scaleFor(row) {
    switch (row.kind) {
      case 'cube': return 'K';
      case 'square': return 'A';
      case 'reciprocal': return 'CI';
      case 'projected': return row.fn === 'tan' ? 'T' : 'S';
      default: return 'D';
    }
  }

  /* ------------------------------------------------------------- drawing */

  function drawRow(parent, row, ticks, g) {
    const group = el('g', { id: `row-${row.name}`, class: `row${row.slide ? ' on-slide' : ''}` });
    const ink = row.slide ? 'var(--slide-ink)' : 'var(--rule-ink)';

    for (const tick of ticks) {
      const h = tick.major ? row.height * 0.44 : row.height * 0.26;
      const line = el('line', {
        id: 'tick',
        x1: tick.x.toFixed(1), x2: tick.x.toFixed(1),
        y1: row.y.toFixed(1), y2: (row.y - h).toFixed(1),
        stroke: tick.major ? ink : 'currentColor',
        'stroke-width': tick.major ? 1 : 0.5,
        opacity: tick.major ? 0.9 : 0.45,
      });
      group.appendChild(line);

      if (tick.label) {
        const text = el('text', {
          x: tick.x.toFixed(1),
          y: (row.y - h - 2).toFixed(1),
          'text-anchor': 'middle',
          fill: row.red ? 'var(--red-ink)' : ink,
          'font-size': tick.major ? 9 : 7.5,
          opacity: tick.major ? 0.95 : 0.6,
        });
        text.textContent = tick.label;
        group.appendChild(text);
      }
    }

    // The scale's name, printed in the margin at the left of the rule the way the
    // instrument prints it, and marking the row even when it has no graduations
    // we can vouch for. It sits outside the graduated area so it never lands on
    // a number the reader is trying to read.
    const name = el('text', {
      x: -OVERHANG + 6,
      y: (row.y - 3).toFixed(1),
      fill: row.red ? 'var(--red-ink)' : ink,
      'font-size': 10,
      'font-weight': 600,
      opacity: 0.9,
    });
    name.textContent = row.label;
    group.appendChild(name);

    if (row.unverified) {
      // A note in the row would sit on top of the scale's own graduations, and
      // the graduations are the part a reader comes for. It goes in the margin
      // beside the row's name instead.
      const note = el('text', {
        x: 60,
        y: (row.y - 4).toFixed(1),
        fill: 'var(--red-ink)',
        'font-size': 8,
        opacity: 0.8,
      });
      note.textContent = '· graduations not recovered from the photographs';
      group.appendChild(note);
    }

    parent.appendChild(group);
    return group;
  }

  /** The aluminium end cap, with its fixing screws. */
  function drawCap(parent, side, axisWidth, ruleHeight) {
    const group = el('g', { id: `cap-${side}` });
    const x = side === 'left' ? -OVERHANG : axisWidth;
    group.appendChild(el('rect', {
      x, y: 0, width: CAP_W, height: ruleHeight,
      fill: 'var(--metal)', stroke: 'var(--metal-edge)', 'stroke-width': 1, rx: 3,
    }));
    for (const t of [0.22, 0.78]) {
      group.appendChild(el('circle', {
        cx: x + CAP_W / 2,
        cy: (ruleHeight * t).toFixed(1),
        r: 4.5, fill: 'var(--metal-edge)', opacity: 0.9,
      }));
    }
    parent.appendChild(group);
    return group;
  }

  /** The glass cursor: body, metal surround, four screws, centre hairline. */
  function drawCursor(parent, band, ruleHeight) {
    const glassW = 132;
    // The glass straddles the sliding band rather than sitting inside it. In
    // the photographs it covers the band and a margin above and below, which is
    // what makes it read as a piece of glass laid over the rule rather than
    // part of the printing.
    const margin = (band.bottom - band.top) * 0.35;
    const top = Math.max(4, band.top - margin);
    const height = Math.min(ruleHeight - top, band.height + margin * 2);

    const group = el('g', { id: 'cursor' });

    // The glass body, set behind the graduations so the scales read through it.
    const glass = el('rect', {
      id: 'cursor-glass',
      x: -glassW / 2, y: top, width: glassW, height,
      rx: 7,
      fill: 'var(--glass)',
      stroke: 'var(--metal-edge)',
      'stroke-width': 2.5,
    });
    group.appendChild(glass);

    // A highlight down one edge: the photographs show the glass catching light,
    // and without it the body reads as a hole rather than a transparent plate.
    group.appendChild(el('rect', {
      x: -glassW / 2 + 3, y: top + 3, width: 7, height: height - 6,
      rx: 3, fill: 'var(--glass-shine)', opacity: 0.5,
    }));

    // Four corner screws, as on the instrument.
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      group.appendChild(el('circle', {
        id: 'cursor-screw',
        cx: (dx * (glassW / 2 - 9)).toFixed(1),
        cy: (top + height / 2 + dy * (height / 2 - 9)).toFixed(1),
        r: 3.6,
        fill: 'var(--metal-edge)',
        stroke: 'var(--metal)',
        'stroke-width': 1,
      }));
    }

    // The hairline, which is the cursor's actual reading edge.
    group.appendChild(el('line', {
      id: 'cursor-centre',
      x1: 0, x2: 0, y1: top - 4, y2: top + height + 4,
      stroke: 'var(--hairline)', 'stroke-width': 1.2,
    }));

    parent.appendChild(group);
    return group;
  }

  /**
   * Draw a face of the rule.
   *
   * @param {SVGSVGElement} svg target, emptied first
   * @param {{axisPx:number,decades:number}} options the rule's geometry
   * @param {{face?:string, highlight?:string, minimap?:boolean}} opts
   */
  function draw(svg, options, opts) {
    const o = opts || {};
    const face = o.face || 'front';
    const rows = rule669.layout(face); // throws on an unknown face
    const band = rule669.slideBand(face);
    const ruleHeight = rule669.height(face);
    const g = geometry(options);

    svg.innerHTML = '';
    const total = options.axisPx + OVERHANG * 2;
    svg.setAttribute('viewBox', `${-OVERHANG} 0 ${total} ${ruleHeight}`);

    const stock = el('g', { id: 'stock' });
    const slide = el('g', { id: 'slide' });
    svg.appendChild(stock);
    svg.appendChild(slide);

    /* The two plates. The stock is one piece above and below the band; the
       slide is a separate bar. The seam between them is the gap, drawn as a
       shadowed edge so the eye reads two materials rather than one strip. */
    stock.appendChild(el('rect', {
      id: 'stock-plate',
      x: -OVERHANG, y: 0, width: total, height: band.top,
      fill: 'var(--stock)', stroke: 'var(--stock-edge)', 'stroke-width': 1,
    }));
    stock.appendChild(el('rect', {
      x: -OVERHANG, y: band.bottom, width: total, height: ruleHeight - band.bottom,
      fill: 'var(--stock)', stroke: 'var(--stock-edge)', 'stroke-width': 1,
    }));

    const plate = el('rect', {
      id: 'slide-plate',
      x: -OVERHANG, y: band.top, width: total, height: band.height,
      fill: 'var(--slide)', stroke: 'var(--slide-edge)', 'stroke-width': 1, rx: 2,
    });
    slide.appendChild(plate);

    // Shadow along the top edge of the sliding bar, so it reads as sitting above
    // the stock rather than printed on it.
    slide.appendChild(el('rect', {
      x: -OVERHANG, y: band.top, width: total, height: 3,
      fill: 'var(--slide-shadow)', opacity: 0.55,
    }));

    /* Rows, each on the piece it is printed on. */
    for (const row of rows) {
      drawRow(row.slide ? slide : stock, row, graduations(g, row), g);
    }

    /* End caps, drawn over the plates so they sit proud of the scales. */
    drawCap(svg, 'left', options.axisPx, ruleHeight);
    drawCap(svg, 'right', options.axisPx, ruleHeight);

    const cursor = drawCursor(svg, band, ruleHeight);

    let minimap = null;
    if (o.minimap) minimap = drawMinimap(svg, band, ruleHeight);

    const parts = { geometry: g, stock, slide, cursor, minimap, band, face };
    return parts;
  }

  /**
   * The minimap's own marks: where the slide currently is, and what the main
   * view is showing. Drawn in rule coordinates on a separate strip, so the
   * renderer needs no idea how wide that strip ends up on screen.
   */
  function drawMinimap(parent, band, ruleHeight) {
    const group = el('g', { id: 'minimap' });

    // A faint bar for the sliding band, so the slide's position has a track to
    // be read against.
    group.appendChild(el('rect', {
      id: 'minimap-track',
      x: -OVERHANG, y: band.top, width: OVERHANG * 2, height: band.height,
      fill: 'var(--slide)', opacity: 0.22,
    }));

    const marker = el('rect', {
      id: 'minimap-slide',
      x: -OVERHANG, y: band.top, width: 8, height: band.height,
      fill: 'var(--slide-edge)', opacity: 0.9,
    });
    group.appendChild(marker);

    const viewport = el('rect', {
      id: 'minimap-viewport',
      x: 0, y: 0, width: 40, height: ruleHeight,
      fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, rx: 2,
    });
    group.appendChild(viewport);

    parent.appendChild(group);
    return { group, viewport, marker };
  }

  /**
   * Move the slide, the cursor, and the minimap's markers.
   *
   * The only function the animation loop calls per frame. It writes transforms
   * and one width, so nothing here can trigger layout.
   */
  function move(parts, slideX, cursorX, minimapWindow) {
    parts.slide.setAttribute('transform', `translate(${slideX.toFixed(2)},0)`);
    parts.cursor.setAttribute('transform', `translate(${cursorX.toFixed(2)},0)`);

    if (parts.minimap) {
      // The marker sits at the left edge of the sliding bar, so it starts at the
      // rule's index and travels with the slide exactly as the bar does.
      parts.minimap.marker.setAttribute('x', (-OVERHANG + slideX).toFixed(2));
      if (minimapWindow) {
        parts.minimap.viewport.setAttribute('x', String(minimapWindow.x));
        parts.minimap.viewport.setAttribute('width', String(minimapWindow.w));
      }
    }
  }

  return { draw, move, graduations, scaleFor, OVERHANG, CAP_W };
});