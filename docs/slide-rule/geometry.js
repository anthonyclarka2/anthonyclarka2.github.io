/**
 * Geometry of the K&E 4181-3, a 10-inch Log Log Duplex Decitrig rule.
 *
 * Every scale on a slide rule is the same underlying log axis wearing different
 * graduations. Rather than write a position function and a read function per
 * scale, each scale is described once as a small descriptor and both directions
 * are derived from it. Twenty scales then cost two functions instead of forty,
 * and adding a scale is a table entry rather than new maths.
 *
 * THE RULE IS ONE LOG DECADE LONG, AND EVERY ROW FILLS IT.
 *
 * That is the fact the whole model turns on. C and D are one decade of log10(v)
 * drawn across the entire graduated length, and every other row is laid over the
 * same length, compressed by however many of its own cycles it has to carry: A
 * and B by two, K by three, L not at all because it is linear. A row carrying
 * one cycle spans the rule exactly once; a row carrying three spends a third of
 * its length on each pass.
 *
 * This replaced a model that treated the whole stock as a single four-decade
 * axis, under which C and D occupied only a quarter of the rule and L filled all
 * of it. That is not what a slide rule is: the graduated length is one decade,
 * and the four decades the old model saw were L's, which is a linear scale from
 * 0 to 1 and only looks like four decades of value because log10 of a 1-to-10
 * reading spans exactly 0 to 1.
 *
 * EVERY SCALE IS A MONOTONE MAP FROM A ONE-DECADE RANGE ONTO THE RULE.
 *
 * Each descriptor carries the value range it covers, and its position function
 * sends that range onto 0..1 of the graduated length. Nothing wraps: a folded
 * scale is not a scale with its tail hanging off the end, it is a scale whose
 * range runs from pi to ten pi, which is why DF prints its labels in the order
 * 4 5 6 7 8 9 then 1 2 3 with a pi mark at each end, exactly as the photographs
 * show. Reciprocals do not need a wrap either -- CI's range is 1 to 10 and it
 * runs the other way, which is what a descending scale is.
 *
 * Positions are always in the stock's coordinate system: the fixed frame the
 * cursor lives in. A graduation belonging to the slide sits at its local
 * position plus the slide's current offset, so slide scales subtract that
 * offset before reading.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlideRuleGeometry = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const DEG = 180 / Math.PI;

  /* Where the folded scales fold, and how far along the rule their mid-boundary
     sits. CF and DF are C and D slid along by a factor of pi, so their range
     starts at pi: the mark for pi is at the index, and the mark for ten pi is at
     the far end, which is why the photographs show a pi at each end of the row. */
  const FOLD = Math.log10(Math.PI);
  const AFTER_FOLD = Math.log10(10 / Math.PI);

  const SCALES = {
    // One decade each, across the whole graduated length.
    C: { side: 'slide', kind: 'log', range: [1, 10] },
    D: { side: 'stock', kind: 'log', range: [1, 10] },

    /* Two decades: the square scales. The rule is one decade long, so A's 1 to
       100 passes over it twice, and the D reading under an A graduation of v is
       sqrt(v) rather than v. That compression IS what makes A the square scale,
       so it is expressed as a cycle count rather than as a separate kind of
       maths. */
    A: { side: 'stock', kind: 'log', cycles: 2, range: [1, 100] },
    B: { side: 'slide', kind: 'log', cycles: 2, range: [1, 100] },

    // Three decades: the cube scale, for the same reason.
    K: { side: 'stock', kind: 'log', cycles: 3, range: [1, 1000] },

    /* The logarithm itself, as a scale you can read: linear from 0 to 1,
       because log10 of a 1-to-10 reading spans exactly that. */
    L: { side: 'stock', kind: 'linear', range: [0, 1] },

    // Folded at pi: C and D slid along by log10(pi).
    CF: { side: 'slide', kind: 'folded', range: [Math.PI, Math.PI * 10] },
    DF: { side: 'stock', kind: 'folded', range: [Math.PI, Math.PI * 10] },

    /* Reciprocal, drawn DESCENDING: 10 at the index, down to 1 at the far end.
       CI's graduation for v sits where C reads 1/v, so increasing v walks left
       to right against the rule. */
    CI: { side: 'slide', kind: 'reciprocal', range: [1, 10] },
    DI: { side: 'stock', kind: 'reciprocal', range: [1, 10] },

    /* The folded reciprocal: where CF reads 1/v. Its range is 10/pi down to
       1/pi -- exactly one decade, as every row of the rule is -- so it opens at
       about 3.18, runs down through 2 and 1, then back out through 9 8 7 6 5 4
       and closes at about 3.18 again. That the range is one decade exactly is
       worth checking whenever this table is edited: a folded scale that spans
       more or less than a decade cannot be read against the row below it. */
    CIF: { side: 'slide', kind: 'folded-reciprocal', range: [1 / Math.PI, 10 / Math.PI] },

    /* Log-log rows. Each is exactly ONE decade of log10(|ln v|), and the range
       endpoints are the natural-logarithm range the row covers, listed in the
       order they are printed across the row -- LEFT first. For the rows below
       one that means the larger value first, because those rows run DOWNHILL:
       LL01 opens on .99 and closes on .90, LL02 on .90 and closes on 50 40 30,
       and the photographs show the numbers falling as the eye runs right. The
       rows above one run uphill, and are listed the same way.

       NOTE on how this differs from what this file used to say. The rows were
       graduated on the excess over one -- log10(v-1) above, log10(1-v) below --
       which is a good approximation near 1 and provably wrong far from it. LL3
       covers e to e^10, and its labels run to 20000; an excess graduation cannot
       place 20000 anywhere on a one-decade row, while log10(ln v) puts it at
       99.6% along, which is where the photograph shows it. */
    LL01: { side: 'stock', kind: 'log-log', of: 'below', range: [Math.exp(-0.01), Math.exp(-0.1)] },
    LL02: { side: 'slide', kind: 'log-log', of: 'below', range: [Math.exp(-0.1), Math.exp(-1)] },
    LL03: { side: 'slide', kind: 'log-log', of: 'below', range: [Math.exp(-1), Math.exp(-10)] },
    LL1: { side: 'stock', kind: 'log-log', of: 'above', range: [Math.exp(0.01), Math.exp(0.1)] },
    LL2: { side: 'stock', kind: 'log-log', of: 'above', range: [Math.exp(0.1), Math.E] },
    LL3: { side: 'stock', kind: 'log-log', of: 'above', range: [Math.E, Math.exp(10)] },

    /* Projected trig scales. A graduation belongs where D reads ten times the
       trig value, which is why both rows span sin (or tan) 0.1 to 1 across the
       rule: 0.1 at the index, 1 at the far end.

       S therefore runs from about 5.74 degrees at its index to 90 at its far
       end, so the small angles crowd together on the left -- which is where the
       photographs show the `84|6` complement pairs -- and the fine subdivision
       is at the right where sin flattens out. T runs 5.71 to 45 degrees.

       Read on D, as ten times the trig value. That is also what settles the old
       open issue about sine needing two scales from different faces: S is read
       against D, and D is printed on both faces. */
    S: { side: 'slide', kind: 'projected', fn: Math.sin, inverse: Math.asin, range: [5.7392, 90] },
    T: { side: 'slide', kind: 'projected', fn: Math.tan, inverse: Math.atan, range: [5.7106, 45] },
  };

  function geometry(options) {
    const axisPx = options.axisPx;
    /* How many decades the ordinary scales carry over that length. One, on this
       instrument: C and D are a single decade, which is the whole point. Kept as
       a named quantity because callers have to say how far off the rule an
       operand has fallen, and that is measured in decades. */
    const decades = options.decades || 1;
    const dpx = axisPx / decades;

    function defOf(scale) {
      const def = SCALES[scale];
      if (!def) throw new Error(`unknown scale: ${scale}`);
      return def;
    }

    /**
     * A scale's own fraction of the graduated length, 0 at its index.
     *
     * Private: callers want positions in stock coordinates, and the only reason
     * this exists separately is that the read direction needs the same mapping
     * rather than a second copy of it.
     *
     * The logarithm of a log-log row is taken of the DISTANCE from one, because
     * that is the quantity the instrument graduates on. `of` says which side of
     * one the row lives on, and so which way the distance runs.
     */
    function fracOf(scale, v) {
      const def = defOf(scale);
      switch (def.kind) {
        case 'log':
          // `cycles` decades over one rule length. C and D carry one, A and B
          // two, K three. Dividing rather than multiplying is the whole
          // difference between a scale that fills the rule and one that runs off
          // the end of it.
          return Math.log10(v) / (def.cycles || 1);
        case 'linear':
          return v;
        case 'reciprocal':
          return 1 - Math.log10(v);
        case 'folded':
          return Math.log10(v) - FOLD;
        case 'folded-reciprocal':
          return AFTER_FOLD - Math.log10(v);
        case 'log-log': {
          // The row is graduated on the logarithm of the distance from one, and
          // which side of one it lives on is part of the row's identity. A value
          // on the other side has no place on the row: LL1 asked for 0.95 would
          // otherwise land at a perfectly plausible position, drawn from the
          // distance of a value it does not carry.
          const distance = Math.log(v);
          if (def.of === 'below' ? distance >= 0 : distance <= 0) return NaN;
          return (Math.log10(Math.abs(distance)) - logLogLo(def)) / logLogSpan(def);
        }
        case 'projected':
          // sin and tan both run 0.1 to 1 across the rule, which is exactly one
          // decade, so the +1 is what puts the index at 0.1.
          return Math.log10(def.fn(v / DEG)) + 1;
        default:
          throw new Error(`no position rule for ${def.kind}`);
      }
    }

    function logLogLo(def) {
      return Math.log10(Math.abs(Math.log(def.range[0])));
    }

    function logLogSpan(def) {
      return Math.log10(Math.abs(Math.log(def.range[1]))) - logLogLo(def);
    }

    /**
     * Position of a graduation on a named scale.
     * @param {string} scale scale name, e.g. 'D'
     * @param {number} v value in that scale's own units
     * @returns {number} x in stock coordinates
     */
    function posOf(scale, v) {
      return fracOf(scale, v) * axisPx;
    }

    /**
     * What a scale shows at a position, given where the slide currently sits.
     *
     * The exact inverse of `posOf` for every kind. A scale whose two directions
     * disagree is a rule that reads a different number than it prints, which is
     * the one failure a slide rule may not have.
     *
     * @param {string} scale scale name
     * @param {number} x position in stock coordinates
     * @param {number} [slideX] slide offset; only slide scales care
     * @returns {number} the value under the cursor
     */
    function read(scale, x, slideX) {
      const def = defOf(scale);
      const local = def.side === 'slide' ? x - (slideX || 0) : x;
      const f = local / axisPx;
      switch (def.kind) {
        case 'log':
          return Math.pow(10, f * (def.cycles || 1));
        case 'linear':
          return f;
        case 'reciprocal':
          return Math.pow(10, 1 - f);
        case 'folded':
          return Math.pow(10, f + FOLD);
        case 'folded-reciprocal':
          return Math.pow(10, AFTER_FOLD - f);
        case 'log-log': {
          const distance = Math.pow(10, logLogLo(def) + f * logLogSpan(def));
          return def.of === 'below' ? Math.exp(-distance) : Math.exp(distance);
        }
        case 'projected': {
          const value = Math.pow(10, f - 1);
          if (value <= 0 || value > 1) return NaN;
          return def.inverse(value) * DEG;
        }
        default:
          throw new Error(`no reading rule for ${def.kind}`);
      }
    }

    // The rule's dimensions are part of the interface, not just an input.
    // Callers have to reason about what fits on the rule -- a cursor that cannot
    // reach past the right edge, an operand too many decades to the left -- and
    // they cannot do that without being told how long the rule is.
    return {
      posOf,
      read,
      /* A scale's own description, so the renderer can graduate a row from what
         the scale says about itself rather than from a table of names kept
         beside it. Two tables of names is how a row ends up reading one scale
         and printing another's graduations. */
      describe: (scale) => {
        const def = defOf(scale);
        return Object.assign({ name: scale }, def);
      },
      has: (scale) => Object.prototype.hasOwnProperty.call(SCALES, scale),
      axisPx,
      decades,
      dpx,
    };
  }

  return { geometry, DEG, FOLD };
});
