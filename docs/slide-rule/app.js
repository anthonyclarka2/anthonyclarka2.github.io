/**
 * Wiring: read the input, plan the calculation, render the rule, play it.
 *
 * The only module that knows about events. Everything it does is translate
 * between the DOM and the four modules below, which own all the logic:
 * parse and evaluate (parser), positions (geometry), choreography (plan),
 * and motion (tween).
 */
(function () {
  'use strict';

  const { plan } = window.SlideRulePlan;
  const { createTween } = window.SlideRuleTween;
  const { camera, easeInOutCubic } = window.SlideRuleCamera;
  const render = window.SlideRuleRender;
  const rule669 = window.SlideRule669;
  const { ParseError } = window.SlideRuleParser;

  const RULE = { axisPx: 1000, decades: 4 };

  const $ = (id) => document.getElementById(id);
  const svg = $('rule');
  const expr = $('expr');

  let parts = null;
  let miniParts = null;
  let current = null;      // the plan being shown
  let tween = null;
  let cam = null;
  let face = 'front';
  let raf = 0;
  let startedAt = 0;
  let playing = false;

  /**
   * Zoom, as the camera takes it: the camera computes `window.width =
   * viewport.width / zoom`, so to frame a rule `span` units wide across the
   * whole viewport the zoom is `viewport.width / span`. A LARGER zoom shows
   * less of the rule and so zooms in.
   *
   * That ratio is the thing to get right. Its reciprocal -- span over viewport
   * width -- produces a window a seventh of the rule's length, which is the
   * mistake this comment exists to prevent.
   *
   * `overview` frames the whole rule. `close` multiplies by CLOSE_FACTOR,
   * showing roughly a third of it, which is where the fine graduations between
   * the labelled ones become readable -- the reason the view zooms at all.
   */
  const CLOSE_FACTOR = 3;

  function zoomFor(which, viewport) {
    // Framed against what is DRAWN, not the graduated axis: the caps and the
    // overhang are part of the picture and the view has to include them.
    const extent = render.drawnExtent(RULE.axisPx);
    const framing = Math.max(viewport.width, 1) / extent.width;
    return which === 'close' ? framing * CLOSE_FACTOR : framing;
  }

  /* Reduced motion is a request, not a preference to be argued with: the
     animation is the explanation, so it jumps straight to the settled state
     rather than removing the explanation with it. */
  const reduced = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STEP_MS = reduced ? 0 : 900;

  /* ------------------------------------------------------------------ chips */
  const CHIPS = [
    { t: '2.5 * 3.7', v: '2.5 * 3.7' },
    { t: '144 / 12', v: '144 / 12' },
    { t: '7 ^ 3', v: '7 ^ 3' },
    { t: 'sqrt(144)', v: 'sqrt(144)' },
    { t: 'cbrt(250)', v: 'cbrt(250)' },
    { t: 'sin(30)', v: 'sin(30)' },
    { t: 'cos(60)', v: 'cos(60)' },
    { t: 'tan(45)', v: 'tan(45)' },
    { t: 'ln(20)', v: 'ln(20)' },
    { t: '1 / 0.0004', v: '1 / 0.0004' },
    { t: '2 ^ -2', v: '2 ^ -2' },
    { t: '2 + 3', v: '2 + 3' },
    { t: 'asin(0.5)', v: 'asin(0.5)' },
  ];

  for (const chip of CHIPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = chip.t;
    b.addEventListener('click', () => {
      expr.value = chip.v;
      update();
    });
    $('chips').appendChild(b);
  }

  /* ---------------------------------------------------------------- drawing */

  /** Which scales the plan actually reads, for the highlight. */
  function scalesUsed(p) {
    switch (p.operation) {
      case 'multiply': return ['C', 'D'];
      case 'divide': return ['C', 'D'];
      case 'power': return ['K', 'D'];
      case 'root': return ['A', 'D'];
      case 'sin': case 'cos': return ['S', 'CI'];
      case 'tan': return ['T', 'CI'];
      case 'ln': return ['Ln', 'D'];
      case 'log10': case 'log': return ['C', 'D'];
      default: return [];
    }
  }

  /** Projected scale in use, drawn in its own row on the slide. */
  function trigScaleFor(p) {
    if (p.operation === 'tan') return 'T';
    if (p.operation === 'sin' || p.operation === 'cos') return 'S';
    return null;
  }

  /**
   * The viewport the camera works in.
   *
   * Read from the element's own box rather than assumed, because the camera
   * divides by it and a zero-width box would make every viewBox NaN. The rule
   * is laid out by CSS, so on the very first draw the box may not exist yet;
   * falling back to the rule's own proportions keeps the first frame sane and
   * the resize handler corrects it once layout has happened.
   */
  function viewportSize() {
    const w = svg.clientWidth;
    const h = svg.clientHeight;
    if (w > 0 && h > 0) return { width: w, height: h };
    const total = RULE.axisPx + render.OVERHANG * 2;
    return { width: total, height: rule669.height(face) };
  }

  function buildCamera(which, focus) {
    const viewport = viewportSize();
    // The camera clamps and centres against the span it is given, and the zoom
    // is derived from that same span. They must describe the same thing, or the
    // window clamps against one width while being sized by another.
    const extent = render.drawnExtent(RULE.axisPx);
    // The camera assumes rule coordinates run from 0, but the drawing starts at
    // a negative x so the left overhang and cap are visible. Shifting the
    // origin here keeps the camera's arithmetic intact while the viewBox still
    // matches what the renderer drew.
    cam = camera({
      rule: { width: extent.width, height: rule669.height(face) },
      viewport,
      zoom: zoomFor(which || 'overview', viewport),
    });
    // The rule's own x is offset by the drawing's left edge.
    cam = shifted(cam, -extent.left);
    if (focus !== undefined) cam = cam.withFocus(focus);
    return cam;
  }

  function drawRule(p) {
    // An operation is only visible on the face that prints the scales it needs.
    // Trig lives on the back, so the rule turns over rather than the animation
    // pretending a scale exists on the front.
    const needed = scalesUsed(p) || [];
    const wanted = needed.find((n) => rule669.faceFor(n));
    if (wanted && rule669.faceFor(wanted) !== face) {
      face = rule669.faceFor(wanted);
      for (const chip of document.querySelectorAll('[data-face]')) {
        chip.classList.toggle('on', chip.dataset.face === face);
      }
    }

    parts = render.draw(svg, RULE, { face });
    miniParts = render.draw($('minimap'), RULE, { face, minimap: true });

    buildCamera('overview', RULE.axisPx / 2);
    applyViewBox();

    render.move(parts, 0, 0);
    render.move(miniParts, 0, 0, cam.overview());
  }

  function setFace(next) {
    face = next;
    for (const chip of document.querySelectorAll('[data-face]')) {
      chip.classList.toggle('on', chip.dataset.face === face);
    }
    if (current) drawRule(current);
  }

  /* ------------------------------------------------------------- text panels */

  function fmtNum(n) {
    if (!Number.isFinite(n)) return '—';
    if (Number.isInteger(n)) return String(n);
    const abs = Math.abs(n);
    if (abs >= 1e6 || abs < 1e-4) return n.toExponential(6).replace(/e([+-])(\d)$/, 'e$10$2');
    return String(Number(n.toPrecision(10)));
  }

  function showError(err) {
    const box = $('err');
    if (!err) { box.hidden = true; box.textContent = ''; return; }
    box.hidden = false;
    const idx = typeof err.index === 'number' ? err.index : -1;
    if (idx >= 0 && idx <= expr.value.length) {
      // A caret under the offending character, since an input cannot show one.
      box.textContent = `${err.message}\n${expr.value.slice(0, idx)}[0m^`;
      const parts2 = box.textContent.split('\n');
      parts2[1] = expr.value.slice(0, idx).replace(/ /g, ' ') +
        '[0m' + '^';
      box.textContent = parts2.join('\n');
    } else {
      box.textContent = err.message;
    }
  }

  function showPlan(p) {
    const card = $('result-card');
    const val = $('result-val');
    const sub = $('result-sub');
    const label = $('result-label');
    const tag = $('result-tag');

    card.classList.toggle('bad', !p.supported);
    card.classList.toggle('limit', p.supported && p.limits.length > 0);

    if (p.supported) {
      label.textContent = 'Result';
      val.textContent = fmtNum(p.result);
      if (p.reading !== null && p.error !== null && p.error > 1e-9) {
        tag.textContent = `rule reads ${fmtNum(p.reading)}`;
        sub.textContent = `${p.error.toExponential(2)}% off`;
      } else {
        tag.textContent = '';
        sub.textContent = p.operation
          ? `read by sliding the ${(scalesUsed(p) || []).join(' and ') || 'rule'}`
          : '';
      }
    } else {
      label.textContent = 'Not on a slide rule';
      val.textContent = '—';
      tag.textContent = '';
      sub.textContent = p.result !== null && p.result !== undefined
        ? `the arithmetic gives ${fmtNum(p.result)}`
        : '';
    }

    const notes = $('notes');
    notes.innerHTML = '';
    for (const note of p.notes || []) {
      const d = document.createElement('div');
      d.className = 'note' + (p.supported ? ' warn' : '');
      d.textContent = note;
      notes.appendChild(d);
    }

    const limits = $('limits');
    limits.innerHTML = '';
    for (const limit of p.limits || []) {
      const d = document.createElement('div');
      d.className = 'note warn';
      d.textContent = `Limit: ${limit}`;
      limits.appendChild(d);
    }
  }

  function showLog(p) {
    const list = $('log');
    list.innerHTML = '';
    const entries = p.log && p.log.length ? p.log : (p.notes || []);
    entries.forEach((text, i) => {
      const li = document.createElement('li');
      li.textContent = text;
      li.dataset.index = String(i);
      list.appendChild(li);
    });
  }

  function markStep(n) {
    const items = Array.prototype.slice.call($('log').children);
    items.forEach((li, i) => {
      li.classList.toggle('done', i < n);
      li.classList.toggle('current', i === n - 1);
    });
    const total = current && current.steps ? current.steps.length : 0;
    $('stepno').textContent = total ? `${Math.min(n, total)}/${total}` : '—';
  }

  /* --------------------------------------------------------------- playback */

  function stop() {
    playing = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    $('play').textContent = 'Play';
  }

  function frame(now) {
    if (!playing || !tween) return;
    const elapsed = now - startedAt;
    const state = tween.stateAt(elapsed);
    render.move(parts, state.slide, state.cursor);

    // The main view follows the reading. While the slide is moving the camera
    // eases in so the graduations being set are legible; once it settles the
    // view pulls back to show the answer in context. Both are driven from the
    // same clock as the rule itself, so the zoom cannot lag or race the motion.
    const t = tween.totalMs > 0 ? Math.min(elapsed / tween.totalMs, 1) : 1;
    const vp = viewportSize();
    const far = zoomFor('overview', vp);
    const near = zoomFor('close', vp);
    const zoom = far + (near - far) * easeInOutCubic(Math.min(t / 0.7, 1));
    cam = cam.withFocus(state.cursor, { zoom });
    applyViewBox();

    render.move(miniParts, state.slide, state.cursor, cam.window());

    const step = Math.floor(tween.progressAt(elapsed));
    markStep(step);
    $('scrub').value = String(Math.round(t * 1000));

    if (elapsed >= tween.totalMs) {
      stop();
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  /** Push the camera's window onto the main viewBox. */
  function applyViewBox() {
    if (!cam) return;
    const w = cam.window();
    svg.setAttribute('viewBox',
      `${(w.x - originShift).toFixed(1)} ${w.y.toFixed(1)} ${w.w.toFixed(1)} ${w.h.toFixed(1)}`);
  }

  // How far the drawing's origin sits to the left of the camera's 0.
  let originShift = 0;

  function shifted(camera, shift) {
    originShift = shift;
    return camera;
  }

  function play() {
    if (!tween || !tween.steps.length) return;
    stop();
    playing = true;
    $('play').textContent = 'Pause';
    // A zero duration tween (reduced motion) still needs to settle, so jump to
    // the end state rather than starting a loop that ends immediately.
    if (tween.duration <= 0) {
      const end = tween.stateAt(tween.totalMs);
      render.move(parts, end.slide, end.cursor);
      markStep(tween.steps.length);
      $('scrub').value = '1000';
      stop();
      return;
    }
    startedAt = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function goTo(ms) {
    if (!tween) return;
    stop();
    const state = tween.stateAt(ms);
    render.move(parts, state.slide, state.cursor);

    const t = tween.totalMs > 0 ? Math.min(ms / tween.totalMs, 1) : 1;
    const vp = viewportSize();
    const far = zoomFor('overview', vp);
    const near = zoomFor('close', vp);
    const zoom = far + (near - far) * easeInOutCubic(Math.min(t / 0.7, 1));
    if (cam) {
      cam = cam.withFocus(state.cursor, { zoom });
      applyViewBox();
    }
    if (miniParts) render.move(miniParts, state.slide, state.cursor, cam ? cam.window() : null);

    markStep(Math.floor(tween.progressAt(ms)));
  }

  function stepBy(n) {
    if (!tween || !tween.steps.length) return;
    const currentMs = (Number($('scrub').value) / 1000) * tween.totalMs;
    const step = Math.floor(tween.progressAt(currentMs));
    const next = Math.max(0, Math.min(tween.steps.length, step + n));
    goTo(next * tween.duration);
    $('scrub').value = String(Math.round((next * tween.duration / tween.totalMs) * 1000));
  }

  /* ------------------------------------------------------------------ update */

  function update() {
    stop();
    const text = expr.value;
    $('parse-note').textContent = '';

    let p;
    try {
      p = plan(text, RULE);
    } catch (err) {
      showError(err);
      return;
    }

    current = p;
    showError(null);
    showPlan(p);
    showLog(p);
    drawRule(p);

    if (p.supported && p.steps.length) {
      tween = createTween({ steps: p.steps, duration: STEP_MS });
      render.move(parts, 0, 0);
      markStep(0);
      $('scrub').value = '0';
      if (reduced) {
        const end = tween.stateAt(tween.totalMs);
        render.move(parts, end.slide, end.cursor);
        markStep(tween.steps.length);
        $('scrub').value = '1000';
      }
    } else {
      tween = null;
      markStep(0);
    }
  }

  /* ------------------------------------------------------------------ events */

  expr.addEventListener('input', update);
  $('play').addEventListener('click', () => {
    if (playing) stop();
    else {
      // Restarting from the end should replay rather than sit still.
      if (tween && Number($('scrub').value) >= 1000) goTo(0);
      play();
    }
  });
  $('replay').addEventListener('click', () => { goTo(0); play(); });
  $('step-fwd').addEventListener('click', () => stepBy(1));
  $('step-back').addEventListener('click', () => stepBy(-1));
  $('scrub').addEventListener('input', () => {
    if (!tween) return;
    const ms = (Number($('scrub').value) / 1000) * tween.totalMs;
    goTo(ms);
  });

  document.addEventListener('keydown', (e) => {
    if (e.target === expr) return;
    if (e.key === 'ArrowRight') { stepBy(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { stepBy(-1); e.preventDefault(); }
    else if (e.key === ' ') { $('play').click(); e.preventDefault(); }
  });

  for (const chip of document.querySelectorAll('[data-face]')) {
    chip.addEventListener('click', () => setFace(chip.dataset.face));
  }

  /* The mobile drawer. Dragging the handle down opens the entry panel, and a
     tap works too, because a gesture-only affordance is unreachable by keyboard
     and unhelpful to anyone who does not discover the drag. */
  const handle = $('drawer-handle');
  function setDrawer(open) {
    document.body.classList.toggle('drawer-open', open);
    handle.setAttribute('aria-expanded', String(open));
  }
  handle.addEventListener('click', () => setDrawer(!document.body.classList.contains('drawer-open')));
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { setDrawer(true); e.preventDefault(); }
  });

  let dragY = null;
  handle.addEventListener('pointerdown', (e) => { dragY = e.clientY; });
  handle.addEventListener('pointerup', (e) => {
    if (dragY === null) return;
    if (e.clientY - dragY > 18) setDrawer(true);
    else if (e.clientY - dragY < -18) setDrawer(false);
    dragY = null;
  });

  // A resize changes the viewport the camera works in, so the window has to be
  // recomputed or the rule would stay framed for the old width.
  window.addEventListener('resize', () => {
    if (!cam) return;
    const focus = tween ? tween.stateAt(currentMs()).cursor : RULE.axisPx / 2;
    const wasClose = cam.zoom > zoomFor('overview', viewportSize()) * 1.5;
    buildCamera(wasClose ? 'close' : 'overview', focus);
    applyViewBox();
    if (miniParts) render.move(miniParts, parts.slide ? 0 : 0, 0, cam.window());
  });

  function currentMs() {
    return (Number($('scrub').value) / 1000) * (tween ? tween.totalMs : 0);
  }

  update();
})();