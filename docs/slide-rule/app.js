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
  const render = window.SlideRuleRender;
  const { ParseError } = window.SlideRuleParser;

  const RULE = { axisPx: 1000, decades: 4 };

  const $ = (id) => document.getElementById(id);
  const svg = $('rule');
  const expr = $('expr');

  let parts = null;
  let current = null;      // the plan being shown
  let tween = null;
  let raf = 0;
  let startedAt = 0;
  let playing = false;

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

  function drawRule(p) {
    parts = render.draw(svg, RULE, {
      scale: (scalesUsed(p) || [])[0],
      trigScale: trigScaleFor(p),
    });
    render.setHighlight(parts, scalesUsed(p));
    if (p.supported) {
      const end = p.steps.length ? p.steps[p.steps.length - 1] : null;
      render.move(parts, 0, 0);
      if (end) render.move(parts, 0, 0);
    } else {
      render.move(parts, 0, 0);
    }
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

    const step = Math.floor(tween.progressAt(elapsed));
    markStep(step);
    $('scrub').value = String(Math.round((elapsed / tween.totalMs) * 1000));

    if (elapsed >= tween.totalMs) {
      stop();
      return;
    }
    raf = requestAnimationFrame(frame);
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

  update();
})();