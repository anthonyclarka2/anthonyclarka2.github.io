/**
 * SVG renderer for the K&E 4181-3.
 *
 * The only module that touches the DOM. It draws from two sources of truth and
 * invents nothing: `geometry` says where each graduation falls, and `rule669`
 * says which rows exist, which piece of material each is printed on, what each
 * one prints, and which of them could not be read off the photographs. That last
 * part matters -- the rows whose graduations are unknown are drawn as a name and
 * left blank, because plausible invented ticks would be worse than an honest
 * gap.
 *
 * The rule is drawn as two pieces. The fixed scale plate carries the rows above
 * and below the band; the sliding plate carries the band's rows and lives inside
 * the `#slide` group so it travels. A seam separates them, sized by `rule669`
 * rather than chosen here, so the renderer cannot quietly draw the rule as one
 * continuous strip.
 *
 * HOW A ROW IS PRINTED, from the photographs at 1:1. Each row of the instrument
 * is a band of graduations hanging from a baseline with its numbers printed
 * above them: the label sits at the top of the row and the ticks run down from
 * it to the row's lower edge, so a row reads top-down. The lengths are graded --
 * the marked values are long, the subdivisions shorter -- which is what lets a
 * reader find a value without reading every number. A row's `y` in rule669 is
 * its baseline, and its graduations are drawn UPWARD from there.
 *
 * The row NAMES in the left-hand column are black on every row of both faces.
 * Only the numbers are coloured, and only on the rows the instrument prints in
 * red. The photographs settle this: `LL02`, `LL03`, `CIF` and `CI` all carry
 * their names in black above numbers in red.
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

  /* How far a legend's right edge clears the index. Measured on the instrument
     and kept in rule669 with the other metrics, because the drawn extent has to
     agree with it. */
  const LEGEND_GAP = rule669.LEGEND_GAP;

  /**
   * How far left of the axis the drawing starts, and how wide it is in total.
   *
   * Exported so the camera can frame exactly what is drawn; if the two disagree
   * the view crops a cap or shows empty space. Left of the graduations sits the
   * column the row names are printed in, then the end cap; right of them sits
   * the end column, where the instrument carries each row's range caption, then
   * the other cap. All four widths are measured off the photographs.
   */
  function drawnExtent(axisPx) {
    const left = -(rule669.LEGEND_COL + rule669.CAP_L);
    return {
      left,
      width: rule669.LEGEND_COL + axisPx + rule669.END_COL + rule669.CAP_L + rule669.CAP_R,
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

  /* The finest marking worth drawing, in rule units. Below this two graduations
     are one blur on screen, which is the crowding the instrument's engraver was
     avoiding too. It is a drawing limit, not a claim about the instrument: it
     only ever thins ticks out where they could not be told apart anyway.

     Set from the instrument's own finest marking rather than from taste. On C and
     D the hundredths between 1 and 2 are the tightest graduations on the rule:
     1544 units of axis over one decade puts two of them 6.7 units apart at the
     start of the interval and 3.3 apart at its end, so anything above 3 units
     starts eating graduations the photographs plainly show. */
  const MIN_TICK = 2.5;

  /* How finely a row subdivides between its labels, by the mantissa the mark
     falls on: hundredths from 1 to 2, fiftieths from 2 to 4, twentieths above.
     Read off the front photograph by counting the graduations between two
     labels -- nine of them between 1.1 and 1.2, so hundredths, and twenty
     between 5.0 and 6.0, so fiftieths.
     
     The three steps look arbitrary and are not: each is one per cent of the
     value it sits beside, so the graduations come out the same physical
     distance apart all the way up the scale. That is why a rule can be read at
     a glance anywhere along it. */
  function baseStep(mantissa) {
    if (mantissa < 2) return 0.01;
    if (mantissa < 4) return 0.02;
    return 0.05;
  }

  /* Rounded up to the 1-2-5 series, which is what graduations are actually
     spaced on. A step of 0.03 exists in no engraver's rule. */
  function snap125(x) {
    const decade = Math.pow(10, Math.floor(Math.log10(x) + 1e-9));
    for (const m of [1, 2, 5]) if (m * decade >= x * (1 - 1e-9)) return m * decade;
    return 10 * decade;
  }

  /* The kinds of scale whose values cycle: their labels name a position in a
     cycle rather than the value itself, so 1 on a folded scale means ten. */
  const CYCLIC = { log: true, reciprocal: true, folded: true, 'folded-reciprocal': true };

  /**
   * The value a label names on a given scale.
   *
   * This is the small piece of arithmetic the instrument performs for its
   * reader, and it is what makes the folded scales come out right. A label reads
   * `1`, and on DF that is the mark for ten, because ten is the value the folded
   * scale carries at its middle. Rather than wrapping a scale around on itself
   * -- which puts two graduations at the same place and cannot say which is
   * which -- the label is carried into whichever cycle of the scale already
   * contains it. The result is that DF prints its labels in the order the
   * photographs show, 4 5 6 7 8 9 then 1 2 3, with a pi at each end.
   */
  function resolveLabel(def, label) {
    if (!CYCLIC[def.kind] || !(label > 0)) return label;
    const lo = def.range[0];
    const hi = def.range[1];
    if (!(lo > 0)) return label;
    let v = label;
    // Bounded rather than `while`: a label outside its scale's range entirely
    // -- which the thinning never produces, but a mistaken table might -- would
    // otherwise spin here for ever.
    for (let i = 0; i < 24 && v > hi; i++) v /= 10;
    for (let i = 0; i < 24 && v < lo; i++) v *= 10;
    return v;
  }

  /* A value as the instrument prints it.
   *
   * `minDigits` is how many decimal places the row's subdivision needs, which is
   * what the instrument itself prints: L is marked every tenth, so it reads
   * `.0 .1 .2`, while the log-log rows are marked every hundredth and read
   * `.90 .88`. More places are added only when the value needs them, for `.015`
   * and `.0005`. Above one the trailing zeros come off, so LL2 reads `2.5` and
   * not `2.50`.
   */
  function compact(v, minDigits) {
    const a = Math.abs(v);
    let digits = Math.max(minDigits, a >= 1 ? 1 : 0);
    while (digits < 6 && Math.abs(Number(v.toFixed(digits)) - v) > a * 1e-4) digits++;
    let s = v.toFixed(digits);
    if (a >= 1 && s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  /* A value below one, printed the instrument's way: the zero before the point
     is dropped, so `.90` and `.00005`. Zero itself prints as `.0`, which is what
     the L scale's index carries on the instrument. */
  function belowOne(v, minDigits) {
    if (v === 0) return '.0';
    const s = compact(v, minDigits === undefined ? 2 : minDigits);
    return s.charAt(0) === '0' ? s.slice(1) : s;
  }

  /* The mantissa of a value: the figure a cyclic scale prints. */
  function mantissaText(v) {
    const decade = Math.pow(10, Math.floor(Math.log10(v) + 1e-9));
    return String(Math.round(v / decade));
  }

  /**
   * What a cyclic scale prints at a value, and how long its tick is.
   *
   * Two conventions, both taken from the photographs. Between the first two
   * numbers the instrument prints the tenths digit ALONE -- 1, 1, 2, 3 ... 9 for
   * 1.0, 1.1, 1.2 ... 1.9 -- because the leading figure is the one the index has
   * already given the reader. Above that it prints whole numbers only, so CF and
   * DF run 4 5 6 7 8 9 across their first half and 1 2 3 across their second,
   * each of those being a mantissa of a value a decade further up.
   */
  function cyclicLabel(def, v) {
    const decade = Math.pow(10, Math.floor(Math.log10(v) + 1e-9));
    const t = def.kind === 'reciprocal' ? v : v / decade;
    const whole = Math.abs(t - Math.round(t)) < 1e-9;
    if (whole) return String(Math.round(t));
    if (t < 2 && Math.abs(t * 10 - Math.round(t * 10)) < 1e-9) {
      return String(Math.round(t * 10) - 10);
    }
    return '';
  }

  function cyclicGrade(def, v) {
    if (cyclicLabel(def, v)) return 0;
    const decade = Math.pow(10, Math.floor(Math.log10(v) + 1e-9));
    const t = def.kind === 'reciprocal' ? v : v / decade;
    if (Math.abs(t - Math.round(t)) < 1e-9) return 0;
    return Math.abs(t * 10 - Math.round(t * 10)) < 1e-9 ? 1 : 2;
  }

  /**
   * The values a row prints, as graduations on the rule.
   *
   * Every scale here is a graduation of the one logarithmic stock, so the list
   * is "which values does this row mark" and the position comes from geometry.
   * Writing the positions out again here is how the renderer and the planner
   * came to disagree about where a 2 was.
   */
  function graduations(g, row) {
    if (!row.scale || row.unverified) return [];
    const def = g.describe(row.scale);
    const out = [];
    // `grade` is 0 for a labelled graduation, 1 for one between the labels and
    // 2 for a fine subdivision. Only the labelled ones print a number.
    const push = (x, label, grade) => {
      if (!Number.isFinite(x)) return;
      // Graduations are clipped to the graduated area. The margin left of the
      // index belongs to the legends and to the overhang, where a tangent above
      // 45 degrees would land if the slide could reach that far; nothing is
      // printed out there and a tick that strayed would sit among the names.
      if (x < -1e-6 || x > g.axisPx + 1e-6) return;
      out.push({ x: Math.min(Math.max(x, 0), g.axisPx), label: label || '', grade });
    };

    switch (def.kind) {
      case 'log': logGraduations(g, def, push); break;
      case 'linear': linearGraduations(g, def, push); break;
      case 'reciprocal':
      case 'folded':
      case 'folded-reciprocal': cyclicGraduations(g, def, push); break;
      case 'log-log': logLogGraduations(g, def, row, push); break;
      case 'projected': projectedGraduations(g, def, push); break;
      default: break;
    }
    // Thinned once, over the finished list, so the rule about which labels may
    // survive is applied to the row as printed rather than to one scale's own
    // walk of it.
    return thinByDistance(out);
  }

  /* Where a rule tightens or loosens its subdivision, as mantissas. The
     instrument changes step at two, at four and at ten -- the same three breaks
     on every logarithmic row it prints. */
  const STEP_BREAKS = [1, 2, 4, 10];

  /**
   * C, D, A, B and K: the plain logarithmic scale.
   *
   * Walked one subdivision run at a time rather than as a single sweep, because
   * a step that changes mid-walk lands the marks between the values a reader
   * looks for: the run from four to ten would come out 4.05, 4.15, 4.25 rather
   * than 4.1, 4.2, 4.3, and A and B would print no labels above 4 at all. Each
   * run starts on a round value and steps by an exact multiple, so every mark
   * falls where the instrument's does.
   *
   * The step is the instrument's own break-down, widened by the row's cycle
   * count, because a scale carrying two decades has half the room for each and
   * cannot be graduated as finely as one that carries a single decade.
   */
  function logGraduations(g, def, push) {
    const name = def.name;
    const cycles = def.cycles || 1;
    for (let e = 0; e < cycles; e++) {
      const decade = Math.pow(10, e);
      for (let i = 0; i + 1 < STEP_BREAKS.length; i++) {
        const from = STEP_BREAKS[i] * decade;
        const to = STEP_BREAKS[i + 1] * decade;
        let step = snap125(baseStep(STEP_BREAKS[i]) * cycles * decade);
        // Never finer than the plate can show. Measured at the run's start,
        // which is where a run is at its tightest.
        for (let guard = 0;
          guard < 8 && step < decade * 10
            && g.posOf(name, from + step) - g.posOf(name, from) < MIN_TICK;
          guard++) {
          step = snap125(step * 2.001);
        }
        for (let n = 0; from + n * step < to - step * 1e-9; n++) {
          const v = from + n * step;
          push(g.posOf(name, v), logLabel(v, cycles), logGrade(v, cycles));
        }
      }
    }
    // The row's far end, which the runs stop just short of.
    const top = Math.pow(10, cycles);
    push(g.posOf(name, top), logLabel(top, cycles), 0);
  }

  function logLabel(v, cycles) {
    const decade = Math.pow(10, Math.floor(Math.log10(v) + 1e-9));
    const mantissa = v / decade;
    const whole = Math.abs(mantissa - Math.round(mantissa)) < 1e-9;
    // The tenths of the opening interval print their own digit. On C and D this
    // is why the photographs show `1` twice in a row at the index and just after
    // it: the first is one, the second is one and a tenth.
    if (cycles === 1 && v < 2 && !whole) {
      const tenth = Math.round(mantissa * 10);
      if (Math.abs(mantissa * 10 - tenth) < 1e-9) return String(tenth - 10);
    }
    if (!whole) return '';
    return String(Math.round(v));
  }

  function logGrade(v, cycles) {
    if (logLabel(v, cycles)) return 0;
    const decade = Math.pow(10, Math.floor(Math.log10(v) + 1e-9));
    const mantissa = v / decade;
    if (Math.abs(mantissa - Math.round(mantissa)) < 1e-9) return 0;
    return Math.abs(mantissa * 10 - Math.round(mantissa * 10)) < 1e-9 ? 1 : 2;
  }

  /**
   * L: the logarithm itself, laid out straight.
   *
   * Linear from 0 to 1, because log10 of a 1-to-10 reading spans exactly that.
   * Printed as `.0` through `1`, which is how the instrument prints it.
   */
  function linearGraduations(g, def, push) {
    for (let n = 0; n <= 100; n++) {
      const v = n / 100;
      const major = n % 10 === 0;
      // One decimal place, because that is all the row's own subdivision
      // carries: the instrument prints `.0 .1 .2` here, not `.10 .20`.
      const label = major ? belowOne(v, 1) : '';
      const grade = !major ? 2 : (n % 50 === 0 ? 0 : 1);
      push(g.posOf(def.name, v), label, grade);
    }
  }

  /**
   * CI, DI, CF, DF and CIF: the scales that cycle.
   *
   * CI and DI are C and D read backwards, so their graduations are the same
   * graduations: 10 at the index and 1 at the far end, with the marks between
   * printed as whole numbers. CF and DF are C and D slid along by a factor of pi,
   * so their marks are C's marks carried to where a value a decade further up
   * would sit -- which puts a pi at each end of the row and prints its labels 4 5
   * 6 7 8 9 then 1 2 3. CIF is the same shift applied to the reciprocals, so it
   * opens at about 3.18, runs down through 2 and 1, and comes back out through
   * 9 8 7 6 5 4 to about 3.18 again.
   *
   * All five are graduated by walking the round values in their range, not by
   * walking positions: a rule is engraved at the values a reader looks for, and
   * the crowding falls out of that on its own.
   */
  function cyclicGraduations(g, def, push) {
    const name = def.name;
    const [lo, hi] = def.range;
    const tol = 1e-9;
    const first = Math.floor(Math.log10(lo) + tol);
    const last = Math.floor(Math.log10(hi) - tol);
    for (let e = first; e <= last; e++) {
      const decade = Math.pow(10, e);
      let t = 1;
      for (let guard = 0; t <= 10 + tol && guard < 4000; guard++) {
        const value = t * decade;
        if (value >= lo * (1 - tol) && value <= hi * (1 + tol)) {
          push(g.posOf(name, value), cyclicLabel(def, value), cyclicGrade(def, value));
        }
        t += snap125(baseStep(t));
      }
    }

    // The folded scales carry a printed pi at each end, and the folded
    // reciprocal a printed 3.18: the two values where the scale doubles back on
    // itself, which a reader has to be told about because they are the only
    // places on the rule where one mark stands for two values.
    for (const v of [lo, hi]) {
      const label = def.kind === 'folded' ? 'π'
        : (def.kind === 'folded-reciprocal' ? '3.18' : null);
      if (label) push(g.posOf(name, v), label, 0);
    }
  }

  /**
   * The log-log rows.
   *
   * These are the one kind of scale whose labels are a list rather than a rule:
   * LL3 runs 3 4 5 6 7 8 9 10 20 30 50 100 200 500 1000 2000 5000 10000 20000,
   * changing step four times, and no formula produces that. The list lives on the
   * row in rule669, read off the photographs, so that correcting a misread value
   * is a one-line change in the place the reading was recorded.
   *
   * Between two labels the row is filled with a plain comb. That much is a
   * drawing decision and not a reading: the photographs show these rows finely
   * divided everywhere between the numbers, but which value each of those
   * graduations carries was not recovered, and inventing round values for them
   * would be worse than an honest fill.
   */
  /* True when a value sits on a step, within a tolerance that absorbs the
     floating-point drift of building values as `from + i * step`. */
  function isMultiple(v, step) {
    const n = v / step;
    return Math.abs(n - Math.round(n)) < 1e-6;
  }

  /**
   * The values a log-log row prints, keyed by value.
   *
   * Kept apart from the row's regions on purpose: a stretch says how finely it is
   * marked and which marks are longer, and says nothing about which of them carry
   * a number. On LL03 the printed `.005`, `.002` and `.001` sit on MEDIUM ticks
   * while the printed `.0005`, `.0002` and `.0001` sit on long ones, so grading a
   * mark by whether it is printed would get one of those two groups wrong.
   */
  function printedValues(row) {
    const out = new Map();
    for (const entry of row.marks || []) {
      // A bare number is a value the row prints; `{ run: [from, to, step] }`
      // stands for every value from one to the other at that step.
      if (typeof entry === 'number') {
        out.set(entry.toFixed(9), entry);
        continue;
      }
      const [from, to, step] = entry.run;
      const dir = to >= from ? 1 : -1;
      const n = Math.round(Math.abs(to - from) / step);
      for (let i = 0; i <= n; i++) {
        const v = from + dir * i * step;
        out.set(v.toFixed(9), v);
      }
    }
    return out;
  }

  /**
   * A log-log row's graduations, described the way the instrument is graduated.
   *
   * Walked stretch by stretch at the step the stretch is marked at, with the
   * marks the stretch names as longer printed longer. Written this way because it
   * is how a row reads when it is transcribed: not "here are the numbers" but
   * "thousandths here, with the fives medium, up to .90".
   *
   * The row's own two ends are added separately, at the exact natural logarithms
   * the range carries rather than at a round value near them, which is where the
   * instrument prints them: LL02 opens on a bare long tick at e^-0.1 and its
   * first printed number is `.90`, one step in. Their grade comes from the row's
   * `ends`, because it is not the same on every row: LL03's opening tick is
   * medium while LL02's is long.
   */
  function regionGraduations(g, def, row, push) {
    const marks = new Map();
    // Two stretches meet at a shared value, so keyed by value: a mark is printed
    // once, and the first stretch to name it decides its grade.
    const add = (v, grade) => {
      const key = v.toFixed(9);
      if (!marks.has(key)) marks.set(key, { v, grade });
      return key;
    };

    for (const region of row.regions) {
      const dir = region.to >= region.from ? 1 : -1;
      const n = Math.round(Math.abs(region.to - region.from) / region.step);
      for (let i = 0; i <= n; i++) {
        const v = region.from + dir * (i * region.step);
        const grade = (region.long && isMultiple(v, region.long)) ? 0
          : (region.medium && isMultiple(v, region.medium)) ? 1
            : 2;
        add(v, grade);
      }
    }

    // The row's own ends, at the exact values its range carries.
    for (const value of def.range) add(value, 0);

    const printed = printedValues(row);
    const named = new Map();
    for (const [v, text, grade] of row.ends || []) {
      named.set(v.toFixed(9), text);
      // An end that carries a name also carries a grade, since the two are
      // independent here too.
      const key = v.toFixed(9);
      if (grade !== undefined && marks.has(key)) marks.get(key).grade = grade;
    }

    for (const mark of marks.values()) {
      const key = mark.v.toFixed(9);
      const text = named.has(key) ? named.get(key)
        : (printed.has(key) ? belowOne(mark.v, 2) : '');
      push(g.posOf(def.name, mark.v), text, mark.grade);
    }
  }

  function logLogGraduations(g, def, row, push) {
    if (row.regions) return regionGraduations(g, def, row, push);

    // A row that has not been walked yet: it carries the numbers it prints and
    // nothing else, so the marks between them are filled with a plain comb.
    const labels = [];
    const place = (v, text) => {
      const x = g.posOf(def.name, v);
      if (!Number.isFinite(x) || x < -1e-6 || x > g.axisPx + 1e-6) return;
      // Two marks a fraction of a unit apart are one mark. The ends are exact
      // logarithms and the runs around them are round numbers, so a row's
      // opening `1.01` and its end mark at e^0.01 land on the same graduation.
      if (labels.length && Math.abs(x - labels[labels.length - 1].x) < 1) return;
      labels.push({ x, label: text });
    };

    for (const v of printedValues(row).values()) place(v, belowOne(v, 2));
    for (const [v, text] of row.ends || []) place(v, text);
    labels.sort((a, b) => a.x - b.x);

    for (let i = 0; i < labels.length; i++) {
      push(labels[i].x, labels[i].label, 0);
      const next = labels[i + 1];
      if (!next) break;
      const gap = next.x - labels[i].x;
      const n = Math.floor(gap / (MIN_TICK * 1.5));
      for (let k = 1; k < n; k++) {
        push(labels[i].x + (gap * k) / n, '', 2);
      }
    }
  }

  /**
   * S and T.
   *
   * A graduation belongs where the scale below reads ten times the trig value,
   * so both rows span sin (or tan) 0.1 to 1 across the rule. S therefore runs
   * from about 5.74 degrees at its index to 90 at its far end, with the small
   * angles crowded at the left, and T runs 5.71 to 45. The crowding is real and
   * is why a rule prints a complement beside each of its small angles; the
   * thinning below drops the degree numbers that would run together, and keeps
   * every graduation, so the scale still shows where each degree is.
   */
  function projectedGraduations(g, def, push) {
    const last = Math.floor(def.range[1] + 1e-9);
    for (let deg = 1; deg <= last; deg++) {
      const x = g.posOf(def.name, deg);
      push(x, String(deg), deg % 10 === 0 ? 0 : (deg % 5 === 0 ? 1 : 2));
      const half = deg + 0.5;
      const hx = g.posOf(def.name, half);
      if (half <= def.range[1]) push(hx, '', 2);
    }
  }

  /**
   * Drop labels that would run into their neighbour, judged by real distances.
   *
   * A logarithmic scale crowds at one end or the other: a trig scale goes flat
   * as the angle approaches 90, and a log-log row packs its labels into the last
   * fifth. Printing them all produces a solid bar of digits. Every graduation
   * keeps its tick; only the labels thin out, so the scale still shows where
   * each mark is.
   *
   * The first and last labels are kept whatever the crowding. They are the ends
   * of the scale, the two values that say which one this is, and a scale that
   * cannot name its own range is not a scale. Because that promise can be kept
   * only at the expense of a neighbour, the walk runs once forwards and then
   * back from the far end, so an end label displaces the label beside it rather
   * than printing through it. S's 90 used to come out as "8390".
   */
  function thinByDistance(ticks) {
    const sorted = [...ticks].sort((a, b) => a.x - b.x);
    const marked = sorted.filter((t) => t.label);
    if (marked.length <= 2) return ticks;
    const need = (tick) => 8 + tick.label.length * 3.6;

    // The two ends are kept before anything else is decided, so the rule that a
    // scale must be able to name its own range cannot be lost to a neighbour.
    const last = marked.length - 1;
    marked[0].keep = true;
    marked[last].keep = true;

    // Forwards from the first end. `lastX` only advances on a label that
    // survives, so a crowded run thins to one rather than to alternate ones.
    let lastX = marked[0].x;
    for (let i = 1; i < marked.length; i++) {
      const tick = marked[i];
      if (tick.keep) { lastX = tick.x; continue; }
      if (tick.x - lastX < need(tick)) { tick.label = ''; continue; }
      lastX = tick.x;
    }

    // And backwards from the far end, so a kept end label displaces the label
    // beside it rather than printing through it. S's 90 used to come out as
    // "8390", and then -- once that was fixed the other way round -- as nothing
    // at all.
    let nextX = marked[last].x;
    for (let i = last - 1; i >= 0; i--) {
      const tick = marked[i];
      if (!tick.label) continue;
      if (tick.keep) { nextX = tick.x; continue; }
      if (nextX - tick.x < need(tick)) { tick.label = ''; continue; }
      nextX = tick.x;
    }
    return ticks;
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
    // The numbers take the row's colour; the name never does. On the instrument
    // the red is the printer's second pass over the numbers alone.
    const numberInk = row.red ? 'var(--red-ink)' : ink;

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
        // Centred on its own graduation, with the baseline set just inside the
        // top of the tallest tick. The numbers therefore sit above the ticks
        // rather than among them, which is what keeps a row's subdivisions from
        // running through its own digits.
        //
        // The number is anchored so that its LAST CHARACTER begins at the
        // graduation, which runs up between that character and the ones before
        // it. That is how the instrument prints these rows, read at 1:1: `.50`
        // comes out `.5` left of the tick and `0` right of it, `45` comes out
        // `4` and `5` either side, and a single digit sits wholly to the right.
        const text = el('text', {
          x: (tick.x + grade.font * 0.62).toFixed(1),
          y: (row.y - row.height * rule669.TALLEST_GRADUATION + grade.font * 0.35).toFixed(1),
          'text-anchor': 'end',
          fill: numberInk,
          'font-size': grade.font,
          opacity: tick.grade === 0 ? 0.95 : 0.7,
        });
        text.textContent = tick.label;
        group.appendChild(text);
      }
    }

    // The scale's name, printed in the left-hand column and marking the row even
    // when it has no graduations we can vouch for. Anchored by its right edge so
    // the gap to the index is the same on every row however long the name is,
    // which is what makes the legends read as a column down the rule. Black on
    // every row, including the red ones, which the photographs are clear about.
    const name = el('text', {
      id: 'legend',
      x: -LEGEND_GAP,
      y: (row.y - row.height * 0.5 + 4).toFixed(1),
      'text-anchor': 'end',
      fill: ink,
      'font-size': 12,
      'letter-spacing': 0.5,
      opacity: 0.92,
    });
    name.textContent = row.label;
    group.appendChild(name);

    if (row.unverified) {
      // Left as a bare name with its row empty. An invented graduation would be
      // read as a reading of the instrument, which is the one thing this drawing
      // may not do.
      const note = el('text', {
        id: 'unverified-note',
        x: 4,
        y: (row.y - row.height * 0.35).toFixed(1),
        fill: 'var(--red-ink)',
        'font-size': 7,
        opacity: 0.7,
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
   * Set beyond the ivory rather than on top of it, and sized from the
   * measurements: the cap on the left of the instrument is a little longer than
   * the one on the right, which is one of those asymmetries that reads as wrong
   * the moment it is drawn as a pair.
   */
  function drawCap(parent, side, extent, ruleHeight) {
    const group = el('g', { id: `cap-${side}` });
    const width = side === 'left' ? rule669.CAP_L : rule669.CAP_R;
    const x = side === 'left' ? extent.left : extent.left + extent.width - width;
    group.appendChild(el('rect', {
      x: x.toFixed(1), y: 0, width, height: ruleHeight,
      fill: 'var(--metal)', stroke: 'var(--metal-edge)', 'stroke-width': 1, rx: 3,
    }));
    for (const t of [0.22, 0.78]) {
      group.appendChild(el('circle', {
        id: 'cap-screw',
        cx: (x + width / 2).toFixed(1),
        cy: (ruleHeight * t).toFixed(1),
        r: 4.5, fill: 'var(--metal-edge)', opacity: 0.9,
      }));
    }
    parent.appendChild(group);
    return group;
  }

  /** The glass cursor: body, metal surround, four screws, centre hairline. */
  function drawCursor(parent, band, ruleHeight) {
    /* The glass, measured off the photographs: the cursor's window is 365px wide
       against a 6034px decade, which is 6% of the graduated length -- 94 rule
       units. Sized wider than that it stops reading as the instrument's cursor
       and starts reading as a panel laid over the rule. */
    const glassW = 94;
    // The glass covers most of the body's height, standing proud of the sliding
    // bar above and below. On the instrument it is a sheet of glass held in a
    // metal frame that spans the whole rule, and a cursor confined to the bar
    // alone reads as part of the slide rather than as the reader's marker.
    const margin = (band.bottom - band.top) * 0.75;
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
   * @param {{axisPx:number,decades?:number}} options the rule's geometry
   * @param {{face?:string, minimap?:boolean}} opts
   */
  function draw(svg, options, opts) {
    const o = opts || {};
    const face = o.face || 'front';
    const rows = rule669.layout(face); // throws on an unknown face
    const band = rule669.slideBand(face);
    const ruleHeight = rule669.height();
    const g = geometry(options);

    svg.innerHTML = '';
    const extent = drawnExtent(options.axisPx);
    const total = extent.width;
    svg.setAttribute('viewBox', `${extent.left} 0 ${total} ${ruleHeight}`);

    const stock = el('g', { id: 'stock' });
    const slide = el('g', { id: 'slide' });
    svg.appendChild(stock);
    svg.appendChild(slide);

    /* The slide is clipped to the body of the rule. The bar travels -- by up to
       its own length, which is what dividing by a value below one takes -- and
       without this its ends would hang off the ivory past the end caps, which is
       not something the instrument does. Clipping is also what makes the slide
       read as a bar in a groove: its ends go behind the stock rather than over
       the table. */
    const defs = el('defs');
    const clipId = `stock-clip-${svg.id || 'rule'}`;
    const clip = el('clipPath', { id: clipId });
    clip.appendChild(el('rect', {
      x: extent.left, y: 0, width: total, height: ruleHeight,
    }));
    defs.appendChild(clip);
    svg.appendChild(defs);
    slide.setAttribute('clip-path', `url(#${clipId})`);

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

    // A shadow along the top edge of the sliding bar, so it reads as sitting
    // above the stock rather than printed on it. Kept faint: on a pale slide a
    // heavy band draws more attention than the seam it is meant to support.
    slide.appendChild(el('rect', {
      x: extent.left, y: band.top, width: total, height: 2,
      fill: 'var(--slide-shadow)', opacity: 0.35,
    }));

    /* The line the instrument prints across the bar: after CIF on the front
       face, after B on the back. Only the front divides its slide exactly in
       two; the back divides one row from three, so the position is per-face data
       rather than a midpoint. Drawn inside the slide group so it travels with
       the bar, and lighter than either seam, because it is a division within one
       piece of material rather than a join between two. */
    const midline = rule669.slideMidline(face);
    slide.appendChild(el('line', {
      id: 'slide-midline',
      x1: extent.left, x2: extent.left + total,
      y1: midline, y2: midline,
      stroke: 'var(--slide-edge)',
      'stroke-width': 1,
      opacity: 0.7,
    }));

    /* Rows, each on the piece it is printed on. */
    for (const row of rows) {
      drawRow(row.slide ? slide : stock, row, graduations(g, row), g);
    }

    /* End caps, drawn over the plates so they sit proud of the scales. */
    drawCap(svg, 'left', extent, ruleHeight);
    drawCap(svg, 'right', extent, ruleHeight);

    const cursor = drawCursor(svg, band, ruleHeight);

    let minimap = null;
    if (o.minimap) minimap = drawMinimap(svg, extent, band, ruleHeight);

    const parts = { geometry: g, stock, slide, cursor, minimap, band, face, extent };
    return parts;
  }

  /**
   * The minimap's own marks: where the slide currently is, and what the main
   * view is showing. Drawn in rule coordinates on a separate strip, so the
   * renderer needs no idea how wide that strip ends up on screen.
   */
  function drawMinimap(parent, extent, band, ruleHeight) {
    const group = el('g', { id: 'minimap' });

    // A faint bar for the sliding band, so the slide's position has a track to
    // be read against.
    group.appendChild(el('rect', {
      id: 'minimap-track',
      x: extent.left, y: band.top, width: extent.width, height: band.height,
      fill: 'var(--slide)', opacity: 0.22,
    }));

    const marker = el('rect', {
      id: 'minimap-slide',
      x: extent.left, y: band.top, width: 8, height: band.height,
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
   * and two attributes, so nothing here can trigger layout.
   */
  function move(parts, slideX, cursorX, minimapWindow) {
    parts.slide.setAttribute('transform', `translate(${slideX.toFixed(2)},0)`);
    parts.cursor.setAttribute('transform', `translate(${cursorX.toFixed(2)},0)`);

    if (parts.minimap) {
      // The marker sits at the left edge of the sliding bar, so it starts at the
      // rule's index and travels with the slide exactly as the bar does.
      parts.minimap.marker.setAttribute('x', (parts.extent.left + slideX).toFixed(2));
      if (minimapWindow) {
        parts.minimap.viewport.setAttribute('x', String(minimapWindow.x));
        parts.minimap.viewport.setAttribute('width', String(minimapWindow.w));
      }
    }
  }

  return {
    draw, move, graduations, drawnExtent,
    LEGEND_GAP, MIN_TICK,
    baseStep, snap125, resolveLabel, cyclicLabel, logLabel, belowOne,
  };
});
