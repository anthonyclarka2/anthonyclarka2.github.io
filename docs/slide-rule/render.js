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

  /* The margin to the left of the index, and the only place a scale's name is
     printed.

     This used to be 160 units of unused stock. It was justified as the slide's
     overhang -- tangent above 45 degrees falls off the left of the index -- but
     no row ever used it: a reciprocal graduation sits at -log10(v), which for
     every value below 1 is positive, so CI and DI both begin at or right of the
     index and nothing is ever printed out there. On the photographs every scale
     starts at the same vertical line and the legends sit just to its left.

     So it is now sized for the legends and nothing else. */
  const OVERHANG = 40;

  /* How far a legend's right edge clears the start of its scale, measured off
     the photographs at two to three characters. At the size the legends are
     printed one character is about 5.5 units. */
  const LEGEND_GAP = 2.5 * 5.5;

  /* The end caps the photographs show at both ends of the rule, and the clear
     space between the last graduation and the cap. Without the gap the cap sits
     on top of the final numbers on every scale. */
  const CAP_W = 46;
  const GAP = 14;

  /**
   * How far left of the axis the drawing starts, and how wide it is in total.
   * Exported so the camera can frame exactly what is drawn; if the two disagree
   * the view crops a cap or shows empty space.
   */
  function drawnExtent(axisPx) {
    return {
      left: -OVERHANG - CAP_W,
      width: axisPx + OVERHANG + CAP_W + GAP * 2,
    };
  }

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
    // `grade` is 0 for a labelled graduation, 1 for one between the labels and
    // 2 for a fine subdivision. Only the labelled ones print a number.
    const push = (x, label, grade) => {
      // Graduations are clipped to the graduated area, which begins at the index
      // and not before it. A reciprocal scale runs from about -log10(v), so
      // every value under 1 lands at or right of the index and nothing reaches
      // into the margin; the margin belongs to the legends alone.
      if (Number.isFinite(x) && x >= 0 && x <= g.axisPx) out.push({ x, label, grade });
    };

    const scale = scaleFor(row);

    if (row.kind === 'log') {
      for (let dec = 0; dec < g.decades; dec++) {
        for (let m = 1; m < 10; m++) {
          const v = m * Math.pow(10, dec);
          const x = g.posOf(scale, v);
          if (x > g.axisPx) return out;
          push(x, String(Number(v.toPrecision(12))), m === 1 ? 0 : 1);
          // The half between two labels. A reader interpolating between 2 and 3
          // needs a graduation to aim at, and without one the numbers float
          // free of the scale that carries them.
          if (m < 9) push(g.posOf(scale, (m + 0.5) * Math.pow(10, dec)), '', 2);
        }
      }
      return thin(out);
    }

    if (row.kind === 'square') {
      // A runs 0 to 100 and then restarts. One cycle spans two decades, so a
      // four decade rule shows exactly one and the second would begin precisely
      // where the rule ends.
      for (let v = 1; v <= 100; v++) {
        const x = g.posOf(scale, v);
        if (x > g.axisPx) break;
        push(x, v % 10 === 0 ? String(v) : '', v % 10 === 0 ? 0 : 2);
      }
      return thin(out);
    }

    if (row.kind === 'cube') {
      for (let dec = 0; dec < g.decades; dec++) {
        for (let m = 1; m < 10; m++) {
          const v = m * Math.pow(10, dec);
          const x = g.posOf(scale, v);
          if (x > g.axisPx) return out;
          push(x, String(Number(v.toPrecision(12))), m === 1 ? 0 : 1);
          if (m < 9) push(g.posOf(scale, (m + 0.5) * Math.pow(10, dec)), '', 2);
        }
      }
      return out;
    }

    if (row.kind === 'reciprocal') {
      // A reciprocal row is graduated on the reciprocals THEMSELVES, not on the
      // values whose reciprocals they are. Walking 1, 2, 3 and placing each at
      // -log10(v) throws every value above 1 off the left of the index and
      // leaves CI and DI showing "1 2 3 4" jammed against the margin, which is
      // what it used to do.
      //
      // What the instrument prints is 9 8 7 6 5 4 3 2 1 and then 9 8 7 ... again,
      // each group one decade further along: the mantissa, with the 1 marking
      // the decade. So CI runs 0.9 to 0.001 as x increases, across the rule.
      for (let dec = 0; dec < g.decades; dec++) {
        for (let m = 9; m >= 1; m--) {
          const v = m / Math.pow(10, dec + 1);
          const x = g.posOf(scale, v);
          if (x > g.axisPx) return out;
          push(x, String(m), m === 1 ? 0 : 1);
          if (m > 1) {
            const mid = (m - 0.5) / Math.pow(10, dec + 1);
            push(g.posOf(scale, mid), '', 2);
          }
        }
      }
      return out;
    }

    if (row.kind === 'projected') {
      for (let deg = 1; deg <= 90; deg++) {
        const x = g.posOf(scale, deg);
        if (x > g.axisPx) break;
        push(x, String(deg), deg % 10 === 0 ? 0 : (deg % 5 === 0 ? 1 : 2));
      }
      // Thinned on real distances. A trig scale is logarithmic in sin, which
      // goes flat as the angle approaches 90, so the last twenty degrees crowd
      // into a few units. Every graduation keeps its tick; only the labels that
      // cannot fit are dropped, so the scale still shows where each degree is.
      return thinByDistance(out);
    }

    if (row.kind === 'log-log') {
      // The row's own single decade, marked at the round excesses. These are the
      // values a person reads off a log-log row -- 1.01, 1.02 and so on -- and
      // not the mantissas of an ordinary log scale, which is what drew "1 10
      // 100 1000" here and made the row unreadable.
      //
      // The excesses come from the scale's own range rather than being fixed,
      // because LL1, LL2 and LL3 each read a different decade of the excess.
      const range = g.logLogRange(scale);
      const below = row.name === 'LL01';
      // How finely the row subdivides depends on the size of its excess: a row
      // opening at a hundredth marks hundredths, one opening at a tenth marks
      // tenths. Built from the row's own bound, or every row prints the same
      // values and LL2 reads as a copy of LL1.
      // A row opening at 1 has its whole decade in whole numbers, so it marks them
    // all; a row opening at a hundredth has room for hundredths. Derived from
    // the row's own bound so each row prints the values it actually carries.
    const step = range.min < 0.05 ? 0.01 : (range.min < 0.5 ? 0.1 : 1);
      // Starting at the row's own lower bound, not one step above it: the
      // opening value is the one a reader reads first, and skipping it left LL1
      // running 1.02 to 1.10 with nothing at the index.
      for (let n = 0; n * step < range.max - range.min + 1e-9; n++) {
        const excess = range.min + n * step;
        if (excess > range.max) break;
        const v = below ? 1 - excess : 1 + excess;
        const x = g.posOf(scale, v);
        if (!Number.isFinite(x) || x > g.axisPx) break;
        push(x, showLogLog(below, v), 0);
        // A graduation between each pair, for the same reason the log rows carry
        // one: these rows exist to resolve differences finer than the numbers
        // they print, so a scale with only its labels cannot resolve anything.
        if (n * step < range.max - range.min) {
          const mid = below
            ? 1 - (excess + step / 2)
            : 1 + (excess + step / 2);
          push(g.posOf(scale, mid), '', 2);
        }
      }
      // The row's far end, where the next decade begins. Skipped when the loop
      // already printed it: for a row opening at a tenth the last in-decade
      // value IS the far end, and printing both gave "1.7 2 2".
      const end = below ? 1 - range.max : 1 + range.max;
      const endX = g.posOf(scale, end);
      const alreadyDrawn = out.some((t) => Math.abs(t.x - endX) < 0.5);
      if (Number.isFinite(endX) && endX <= g.axisPx && !alreadyDrawn) {
        push(endX, showLogLog(below, end), 0);
      }
      // Not bucketed by decade the way an ordinary log row is: a log-log row IS
      // one decade, so the 100px buckets cut it into three arbitrary groups and
      // dropped 1.04, 1.05 and 1.09 from the middle of it. Thinned on real
      // distances instead, which is what the crowding actually is.
      return thinByDistance(out);
    }

    return out;
  }

  /**
   * Drop labels that would run into their neighbour, judged by real distances.
   *
   * Used on rows that are a single decade, where the buckets in `thin` have no
   * meaning. A log-log row crowds hardest at its high end, where the excess runs
   * 0.07 to 0.1 and the ten labels pack into the last fifth of the row: left
   * alone, LL1 printed "1.09" straight through "1.10".
   *
   * The first and last labels are kept whatever the crowding. They are the ends
   * of the decade, the two values that say which one this is, and a scale that
   * cannot name its own range is not a scale.
   */
  function thinByDistance(ticks) {
    const sorted = [...ticks].sort((a, b) => a.x - b.x);
    let lastKeptX = -Infinity;
    for (const [i, tick] of sorted.entries()) {
      const isEnd = i === 0 || i === sorted.length - 1;
      if (!tick.label) continue;
      const need = 6 + tick.label.length * 3.4;
      if (!isEnd && tick.x - lastKeptX < need) {
        tick.label = '';
        continue;
      }
      lastKeptX = tick.x;
    }
    return ticks;
  }

  /**
   * Drop labels that would run into their neighbours.
   *
   * A logarithmic scale crowds badly at the left of each decade, where 5, 6, 7,
   * 8 and 9 sit within a few units of each other. Printing them all produces
   * "500600700800900" and a graduation nobody can read, which is worse than
   * printing fewer. Every graduation keeps its tick; only the labels thin out,
   * so the scale still shows where each mark is.
   *
   * Labelling by DECADE rather than globally is what a real rule does: the
   * crowded early decades are labelled 1, 2 and 5 only, and the later, more
   * widely spaced decades carry the full set of digits.
   */
  function thin(ticks) {
    const byDecade = new Map();
    for (const tick of ticks) {
      const key = Math.floor(tick.x / 100);
      if (!byDecade.has(key)) byDecade.set(key, []);
      byDecade.get(key).push(tick);
    }

    for (const group of byDecade.values()) {
      if (group.length < 2) continue;
      // How much room each label has, judged by its gap to the one before. A
      // four digit label needs far more than a one digit one.
      //
      // The first and last labels in a group are never dropped, however tight
      // they are. On a log-log row they are the two ends of the decade, which
      // are the values a reader looks for; and the first has no left-hand
      // neighbour, so measuring it against the gap that follows would drop the
      // row's opening value.
      const keep = new Set([0, group.length - 1]);
      for (let i = 1; i < group.length - 1; i++) {
        // A graduation with nothing printed on it has no label to lose, and its
        // neighbour is now an unlabelled subdivision rather than the previous
        // number, so measuring against it would thin labels that fit.
        if (!group[i].label) continue;
        const gap = group[i].x - group[i - 1].x;
        const need = 5 + group[i].label.length * 3.2;
        if (gap >= need) keep.add(i);
      }
      group.forEach((tick, i) => {
        if (!keep.has(i)) tick.label = '';
      });
    }
    return ticks;
  }

  /**
 * How a log-log value is printed. A row above one shows two decimals, which is
 * what makes 1.01 and 1.05 distinguishable at a glance; a row below one drops
 * the leading zero the way the instrument prints ".95" rather than "0.95".
 */
  function showLogLog(below, v) {
    // A row whose excess reaches whole numbers needs no decimals: LL3 runs to 11
    // and printing "11.00" implies a precision the row does not carry.
    const whole = Math.abs(v - Math.round(v)) < 1e-9;
    const s = whole ? String(Math.round(v)) : v.toFixed(2);
    if (!below) return s;
    // Drop the leading zero without substituting a dot for it: replacing /^0/
    // with "." yields "..99", because the decimal separator is already a dot.
    return s.charAt(0) === '0' ? s.slice(1) : s;
  }

/** Which of geometry's named scales a row's graduations are read from. */
  function scaleFor(row) {
    switch (row.kind) {
      case 'cube': return 'K';
      case 'square': return 'A';
      case 'reciprocal': return 'CI';
      case 'projected': return row.fn === 'tan' ? 'T' : 'S';
      case 'log-log': return row.name;
      default: return 'D';
    }
  }

  /* ------------------------------------------------------------- drawing */

  /* How each class of graduation is drawn. These are the instrument's printing
     metrics and live in rule669, because the slide plate sizes itself around
     how far a row's printing reaches above its baseline. */
  const GRADES = rule669.GRADES;

  function drawRow(parent, row, ticks, g) {
    const group = el('g', { id: `row-${row.name}`, class: `row${row.slide ? ' on-slide' : ''}` });
    // Both pieces are printed in their own ink, and every graduation uses it.
    // The minor graduations used to take `currentColor`, which is the page's
    // near-white text colour: on the ivory rule they were invisible, so eight
    // of every nine ticks simply did not appear.
    const ink = row.slide ? 'var(--slide-ink)' : 'var(--rule-ink)';

    for (const tick of ticks) {
      const grade = GRADES[tick.grade];
      const h = row.height * grade.len;
      const line = el('line', {
        id: 'tick',
        'data-grade': tick.grade,
        x1: tick.x.toFixed(1), x2: tick.x.toFixed(1),
        y1: row.y.toFixed(1), y2: (row.y - h).toFixed(1),
        stroke: ink,
        'stroke-width': grade.width,
        opacity: grade.opacity,
      });
      group.appendChild(line);

      if (tick.label) {
        const text = el('text', {
          x: tick.x.toFixed(1),
          y: (row.y - h - 2).toFixed(1),
          'text-anchor': 'middle',
          fill: row.red ? 'var(--red-ink)' : ink,
          'font-size': grade.font,
          opacity: tick.grade === 0 ? 0.95 : 0.7,
        });
        text.textContent = tick.label;
        group.appendChild(text);
      }
    }

    // The scale's name, printed to the left of the graduated area the way the
    // instrument prints it, and marking the row even when it has no graduations
    // we can vouch for. Anchored by its right edge so the gap to the first
    // graduation is the same on every row however long the name is -- which is
    // what makes the legends read as a column down the left of the rule.
    const name = el('text', {
      x: -LEGEND_GAP,
      y: (row.y - 3).toFixed(1),
      'text-anchor': 'end',
      fill: row.red ? 'var(--red-ink)' : ink,
      'font-size': 10,
      'font-weight': 600,
      opacity: 0.9,
    });
    name.textContent = row.label;
    group.appendChild(name);

    if (row.unverified) {
      // The margin is now only wide enough for the legend, so this note has
      // nowhere to sit beside it. It goes under the row's own graduations
      // instead, where the instrument's rows carry no further printing anyway.
      const note = el('text', {
        x: 0,
        y: (row.y + 9).toFixed(1),
        fill: 'var(--red-ink)',
        'font-size': 7,
        opacity: 0.75,
      });
      note.textContent = 'not recovered';
      group.appendChild(note);
    }

    parent.appendChild(group);
    return group;
  }

  /**
   * The aluminium end cap, with its fixing screws.
   *
   * Set just beyond the last graduation rather than on top of it. The axis ends
   * at its final mark, so a cap drawn from there would cover the numbers a
   * reader needs at the end of the scale.
   */
  function drawCap(parent, side, axisWidth, ruleHeight) {
    const group = el('g', { id: `cap-${side}` });
    // Left of the first graduation there is only the overhang; the right end
    // needs the same clearance, so the rule is drawn wider than the axis it is
    // graduated on and the caps sit in the space beyond it.
    const x = side === 'left' ? -OVERHANG - CAP_W : axisWidth + GAP;
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
    const extent = drawnExtent(options.axisPx);
    const total = extent.width;
    svg.setAttribute('viewBox', `${extent.left} 0 ${total} ${ruleHeight}`);

    const stock = el('g', { id: 'stock' });
    const slide = el('g', { id: 'slide' });
    svg.appendChild(stock);
    svg.appendChild(slide);

    /* The two plates. The stock is one piece above and below the band; the
       slide is a separate bar. The seam between them is the gap, drawn as a
       shadowed edge so the eye reads two materials rather than one strip. */
    stock.appendChild(el('rect', {
      id: 'stock-plate',
      x: extent.left, y: 0, width: total, height: band.top,
      fill: 'var(--stock)', stroke: 'var(--stock-edge)', 'stroke-width': 1,
    }));
    stock.appendChild(el('rect', {
      x: extent.left, y: band.bottom, width: total, height: ruleHeight - band.bottom,
      fill: 'var(--stock)', stroke: 'var(--stock-edge)', 'stroke-width': 1,
    }));

    const plate = el('rect', {
      id: 'slide-plate',
      x: extent.left, y: band.top, width: total, height: band.height,
      fill: 'var(--slide)', stroke: 'var(--slide-edge)', 'stroke-width': 1, rx: 2,
    });
    slide.appendChild(plate);

    // A shadow along the top edge of the sliding bar, so it reads as sitting above
    // the stock rather than printed on it. Kept faint: on a pale slide a heavy
    // band draws more attention than the seam it is meant to support.
    slide.appendChild(el('rect', {
      x: extent.left, y: band.top, width: total, height: 2,
      fill: 'var(--slide-shadow)', opacity: 0.35,
    }));

    /* The line the instrument prints across the bar: after CIF on the front
       face, after B on the back. Only the front divides its slide exactly in
       two; the back divides one row from three, so the position is per-face
       data rather than a midpoint. Drawn inside the slide group so it travels
       with the bar, and lighter than either seam, because it is a division
       within one piece of material rather than a join between two. */
    slide.appendChild(el('line', {
      id: 'slide-midline',
      x1: extent.left, x2: extent.left + total,
      y1: rule669.slideMidline(face), y2: rule669.slideMidline(face),
      stroke: 'var(--slide-edge)',
      'stroke-width': 1,
      opacity: 0.7,
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

  return { draw, move, graduations, scaleFor, drawnExtent, OVERHANG, CAP_W, GAP };
});