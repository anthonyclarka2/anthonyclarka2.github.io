/**
 * Camera geometry for the slide rule animation.
 *
 * There are two views of the same rule. The main view zooms in so a single
 * graduation can be read; the minimap always shows the whole rule with a
 * rectangle over whatever the main view is currently showing. Both are the same
 * arithmetic -- a rectangle over the rule in rule units -- so they are computed
 * here once, as pure numbers, with no DOM. The renderer only ever applies the
 * results to a viewBox and an x attribute; nothing in this module needs a
 * browser, which is what makes the motion checkable without watching it.
 *
 * A camera is immutable. Every method returns a new camera and leaves the one it
 * was called on alone, so an animation can hold a camera per step and compare
 * them without any of them drifting underneath it.
 *
 * Zoom is stated as how many rule units are squeezed into one screen pixel, so
 * zoom 3 means three rule units per screen pixel and one scale factor drives
 * both axes. Pinning the height to the rule instead would render the same
 * viewBox at two different graduation sizes depending on which axis the caller
 * happened to measure.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlideRuleCamera = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /**
   * Cubic ease in and out, clamped to the unit interval.
   *
   * Deliberately separate from the tween module's easing rather than shared:
   * this one is contractually pinned at both ends (exactly 0 and exactly 1) so
   * that a camera driven by it can never be handed a viewBox off the end of the
   * rule. The camera must be safe to evaluate at any progress a rAF loop
   * produces, including the first frame and the overshoot after the last.
   *
   * @param {number} t progress, 0 to 1
   * @returns {number} eased progress, 0 to 1
   */
  function easeInOutCubic(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    if (t < 0.5) return 4 * t * t * t;
    const f = -2 * t + 2;
    return 1 - (f * f * f) / 2;
  }

  /**
   * @param {object} options
   * @param {{width:number,height:number}} options.rule the whole rule, in rule
   *   units. Its bounds are what the window is clamped against, so a rule that
   *   is not measured here cannot be guarded.
   * @param {{width:number,height:number}} options.viewport the main view's
   *   element size, in screen pixels.
   * @param {number} options.zoom rule units per screen pixel
   */
  function camera(options) {
    const rule = options.rule;
    const viewport = options.viewport;
    const zoom = options.zoom;

    // A camera that has not been told where to look opens on the middle of the
    // rule. The middle is where the decades worth of graduations are, and
    // starting hard against the left end would open on the emptiest part of a
    // log axis.
    const defaultFocus = rule.width / 2;

    /**
     * Build a camera without re-deriving anything the caller already decided.
     * Every public method funnels through here, which is what keeps the
     * invariant in one place: one rule, one viewport, one zoom, one focus.
     *
     * @param {number} focus rule x the main view is centred on
     * @param {number} nextZoom rule units per screen pixel
     */
    function make(focus, nextZoom) {
      // The window spans the same fraction of the rule's width as the viewport
      // does of itself, and its HEIGHT is scaled to match, so the graduations
      // keep their true spacing rather than being stretched to fill the element.
      //
      // Deriving the height from the viewport's aspect instead is wrong for an
      // object this shape. The rule is roughly three and a half units wide for
      // every one tall; a viewport of a different ratio would either crop rows
      // off the top and bottom or leave bands of empty space, and both make the
      // rule look like something other than what it is.
      const ruleAspect = rule.width / rule.height;
      // Deliberately NOT clamped to the rule's width. A window wider than the
      // rule when zoomed out is the correct framing: it centres the instrument
      // with empty space either side, which reads as "this is the whole rule"
      // rather than as a mistake.
      const windowWidth = viewport.width / nextZoom;
      const windowHeight = windowWidth / ruleAspect;

      const state = {
        rule,
        viewport,
        zoom: nextZoom,
        focus,
        scale: 1 / nextZoom,
        windowWidth,
        windowHeight,
      };

      return {
        window: () => windowOf(state),
        withFocus: (ruleX, opts) =>
          make(ruleX, opts && opts.zoom !== undefined ? opts.zoom : state.zoom),
        withZoom: (nextZoom) => make(state.focus, nextZoom),
        overview: () => ({ x: 0, y: 0, w: rule.width, h: rule.height }),
        minimapWindow: () => ({ x: 0, y: 0, w: rule.width, h: rule.height }),
        ruleToScreen: (ruleX, screenWidthPx) =>
          ruleX * (screenWidthPx / rule.width),
        screenToRule: (screenX, screenWidthPx) =>
          screenX * (rule.width / screenWidthPx),
        scale: () => state.scale,
      };
    }

    /**
     * The main view's viewBox.
     *
     * The clamp is the whole point of this function. Past the end of a slide
     * rule there is no stock: on a real rule the graduations stop at the end,
     * and anything drawn beyond it would be a printing error, not detail worth
     * zooming into. So a window asked to centre on a graduation at the very end
     * is pulled back to show the end of the rule instead, rather than being
     * allowed to show a third of a rule that does not exist.
     *
     * A window wider than the rule is the one case where clamping is wrong: it
     * would collapse the window to nothing and hide the rule entirely. There the
     * window is centred on the rule and the overflow is kept on both sides.
     */
    function windowOf(state) {
      const { windowWidth: w, windowHeight: h } = state;
      if (w >= rule.width) {
        return { x: rule.width / 2 - w / 2, y: 0, w, h };
      }
      const centred = state.focus - w / 2;
      return {
        x: Math.min(Math.max(centred, 0), rule.width - w),
        y: 0,
        w,
        h,
      };
    }

    return make(defaultFocus, zoom);
  }

  /**
   * The rule's proportions: width for every one of height.
   *
   * A property of the instrument, never of the viewport it happens to be drawn
   * in. Every window this module produces already has this aspect -- that is
   * what `make` guarantees when it derives a window's height from its width --
   * so an element sized to the same aspect matches at every zoom, including
   * zooms nothing has run yet.
   *
   * @param {{width:number,height:number}} rule the whole rule, in rule units
   * @returns {number} width divided by height
   */
  function ruleAspect(rule) {
    return rule.width / rule.height;
  }

  /**
   * The size an element must be drawn at to show the rule undistorted.
   *
   * Both views used to be stretched to whatever box the page handed them, which
   * is where the distortion came from: the overview was 5.4x too wide and the
   * main view 1.1x even when showing the whole rule. Deriving the element from
   * the rule instead of the container means its proportions are correct by
   * construction, and that it can overflow its container rather than being
   * squeezed to fit it -- an element narrower than the rule would have to
   * letterbox or squash to stay inside, and both are wrong.
   *
   * @param {number} pxPerUnit screen pixels for one rule unit
   * @param {{width:number,height:number}} rule the whole rule, in rule units
   * @returns {{width:number,height:number}} the element's size in screen pixels
   */
  function fitBox(pxPerUnit, rule) {
    return { width: rule.width * pxPerUnit, height: rule.height * pxPerUnit };
  }

  return { camera, easeInOutCubic, ruleAspect, fitBox };
});