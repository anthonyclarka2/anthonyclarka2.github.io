/**
 * Geometry of a 10-inch Deci-Log slide rule.
 *
 * Every scale on a slide rule is the same underlying log axis wearing different
 * graduations. Rather than write a position function and a read function per
 * scale, each scale is described once as a small descriptor and both directions
 * are derived from it. Ten scales then cost two public functions instead of
 * twenty, and adding a scale is a table entry rather than new maths.
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

  const SCALES = {
    C: { side: 'slide', kind: 'log' },
    D: { side: 'stock', kind: 'log' },

    // Power scales graduate so that reading `x` on the scale means the D scale
    // underneath is showing x^power. A and C| square (2); B and K cube (3).
    // A and C| are therefore the same graduation printed on opposite halves of
    // the rule, which is why their positions must match exactly.
    A: { side: 'stock', kind: 'power', power: 2 },
    'C|': { side: 'slide', kind: 'power', power: 2 },
    B: { side: 'slide', kind: 'power', power: 3 },
    K: { side: 'slide', kind: 'power', power: 3 },

    // CI runs backwards: its graduations sit where D would show the reciprocal.
    // This is the scale that makes the projected trig scales usable, since at
    // an S graduation D reads cosecant rather than sine.
    CI: { side: 'stock', kind: 'reciprocal' },

    // Ln is a log axis whose graduations are labelled with the log of the
    // underlying value, so a position that D shows as 100 reads ln(100) = 4.6.
    Ln: { side: 'stock', kind: 'natural-log' },

    // Projected trig scales. Their graduations are placed where CI reads the
    // trig value, which is why both run backwards: a smaller angle means a
    // smaller value, so it sits further along a log axis. S puts 90 degrees on
    // its index because sin 90 is 1; T puts 45 there because tan 45 is 1.
    //
    // This is the design finding from planning: T cannot reuse S's origin,
    // because tangent passes through 1 at 45 degrees rather than at 90.
    S: { side: 'slide', kind: 'projected', fn: Math.sin, inverse: Math.asin, maxValue: 1 },
    T: { side: 'slide', kind: 'projected', fn: Math.tan, inverse: Math.atan, maxValue: Infinity },
  };

  function geometry(options) {
    const dpx = options.axisPx / options.decades;

    /**
     * Position of a graduation on a named scale.
     * @param {string} scale scale name, e.g. 'D'
     * @param {number} v graduation value, in that scale's own units
     * @returns {number} x in stock coordinates
     */
    function posOf(scale, v) {
      const def = SCALES[scale];
      if (!def) throw new Error(`unknown scale: ${scale}`);
      switch (def.kind) {
        case 'power':
          return def.power * Math.log10(v) * dpx;
        case 'reciprocal':
          return -Math.log10(v) * dpx;
        case 'natural-log':
          return Math.log10(Math.exp(v)) * dpx;
        case 'projected':
          // Angle in degrees. The graduation belongs where CI shows the trig
          // value, and CI reads the reciprocal of the underlying log axis, so
          // the position is -log10(value). That is what makes these scales run
          // backwards and what places S's 90 and T's 45 on their indices.
          return -Math.log10(def.fn(v * Math.PI / 180)) * dpx;
        default:
          return Math.log10(v) * dpx;
      }
    }

    /**
     * What a scale shows at a position, given where the slide currently sits.
     * @param {string} scale scale name
     * @param {number} x position in stock coordinates
     * @param {number} [slideX] slide offset; only slide scales care
     * @returns {number} the value under the cursor
     */
    function read(scale, x, slideX) {
      const def = SCALES[scale];
      if (!def) throw new Error(`unknown scale: ${scale}`);
      const local = def.side === 'slide' ? x - (slideX || 0) : x;
      const base = Math.pow(10, local / dpx);
      switch (def.kind) {
        case 'power':
          return Math.pow(base, 1 / def.power);
        case 'reciprocal':
          return 1 / base;
        case 'natural-log':
          return Math.log(base);
        case 'projected': {
          // Mirror of posOf: invert the reciprocal the axis is showing. The
          // valid range is a property of the inverse, not of the scale kind:
          // asin stops at 1, atan runs on past it, which is exactly why tangent
          // reads beyond the index.
          const v = 1 / base;
          if (v <= 0 || v > def.maxValue) return NaN;
          return def.inverse(v) * DEG;
        }
        default:
          return base;
      }
    }

    // The rule's dimensions are part of the interface, not just an input.
    // Callers have to reason about what fits on the rule -- a cursor that
    // cannot reach past the right edge, an operand four decades too small --
    // and they cannot do that without being told how long the rule is.
    return {
      posOf,
      read,
      axisPx: options.axisPx,
      decades: options.decades,
      dpx,
    };
  }

  return { geometry, DEG };
});