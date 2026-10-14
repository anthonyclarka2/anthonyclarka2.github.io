/**
 * Animation timing for the slide rule.
 *
 * The tween engine is deliberately free of the DOM so it can be tested as plain
 * arithmetic: `positionAt` and `valueAt` are pure functions of a step list and
 * a progress value. The renderer owns a rAF loop and feeds this module a
 * timestamp; nothing here knows a browser exists. That split is what lets the
 * motion be reasoned about without watching it.
 *
 * Positions are in the stock's coordinate system, matching the geometry module,
 * so a step's `to` is the same number the renderer draws at and the same number
 * the planner computed.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlideRuleTween = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /**
   * Cubic ease in and out. A linear slide looks mechanical and a back-eased one
   * overshoots, which on a slide rule would read as the rule moving past its
   * mark rather than settling on it.
   */
  function easeInOut(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    if (t < 0.5) return 4 * t * t * t;
    const f = -2 * t + 2;
    return 1 - (f * f * f) / 2;
  }

  /**
   * Where the slide and cursor sit after `progress` of the given steps.
   *
   * A step only affects the target it names, and a target holds its last
   * position until a later step moves it. That mirrors how a person uses the
   * instrument: setting the slide does not disturb the cursor.
   *
   * @param {Array<{target:string,to:number}>} steps
   * @param {number} progress how many steps have been reached, fractional ok
   * @returns {{slide:number, cursor:number}}
   */
  function positionAt(steps, progress) {
    let slide = 0;
    let cursor = 0;

    const settled = (position) => {
      if (position.target === 'slide') slide = position.to;
      else if (position.target === 'cursor') cursor = position.to;
    };

    // Progress counts steps REACHED, so at an exact whole number n the first n
    // steps have settled and nothing is in flight. Replaying only the settled
    // steps, in order, is the whole rule; the only subtlety is not counting a
    // step as settled until it has actually completed.
    const whole = Math.floor(progress);
    const done = Math.min(whole, steps.length);
    for (let i = 0; i < done; i++) settled(steps[i]);

    // A fractional part means the next step is mid-move, so ease from where it
    // stands toward where it lands.
    const fraction = progress - whole;
    if (fraction > 0 && done < steps.length) {
      const step = steps[done];
      const eased = easeInOut(fraction);
      if (step.target === 'slide') slide += (step.to - slide) * eased;
      else if (step.target === 'cursor') cursor += (step.to - cursor) * eased;
    }

    return { slide, cursor };
  }

  /**
   * A tween over a step list.
   *
   * @param {{steps:Array, duration?:number, easing?:function}} options
   *   `duration` is milliseconds per step. Zero means the whole animation is
   *   instant, which is what reduced motion asks for.
   */
  function createTween(options) {
    // A step that does not move its target would still consume a full step's
    // worth of time, so the animation would pause mid-flight with nothing
    // happening. Those are dropped here rather than timed through. The
    // comparison is against the last KEPT step: a run of no-ops all collapse to
    // the first one, and comparing against the original predecessor would keep
    // every step after a no-op.
    const steps = [];
    for (const step of (options.steps || [])) {
      const last = steps[steps.length - 1];
      if (last && last.target === step.target && last.to === step.to) continue;
      steps.push(step);
    }
    const duration = options.duration === undefined ? 900 : options.duration;
    const easing = options.easing || easeInOut;

    /**
     * Elapsed milliseconds to progress, measured in steps reached so the
     * animation ends at `steps.length`. One step lasts `duration`.
     */
    function progressAt(elapsed) {
      if (steps.length === 0) return 0;
      if (duration <= 0) return steps.length;
      return Math.max(0, Math.min(elapsed, steps.length * duration)) / duration;
    }

    /** Slide and cursor positions at `elapsed` milliseconds. */
    function stateAt(elapsed) {
      if (steps.length === 0) return { slide: 0, cursor: 0 };
      if (duration <= 0) {
        // Every step has effectively zero length, so report the end position
        // for any elapsed time rather than dividing by a zero total.
        return positionAt(steps, steps.length);
      }
      return positionAt(steps, progressAt(elapsed));
    }

    /**
     * How far the slide has travelled in the first step, used by tests and by
     * the renderer's scrub bar to show single-axis progress.
     */
    function valueAt(elapsed) {
      return stateAt(elapsed).slide;
    }

    return {
      steps,
      duration,
      easing,
      progressAt,
      stateAt,
      valueAt,
      get totalMs() { return steps.length * duration; },
    };
  }

  return { easeInOut, positionAt, createTween };
});