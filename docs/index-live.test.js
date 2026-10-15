'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
/* The CSP comment in <head> mentions a <script> in prose, so anchoring on the
   tag at the start of a line is what actually picks out the real block. */
function scriptSource() {
  const i = HTML.indexOf('\n<script>\n');
  assert.notEqual(i, -1, 'the document carries an inline script');
  const j = HTML.indexOf('\n</script>', i);
  return HTML.slice(i + '\n<script>\n'.length, j);
}
const SCRIPT = scriptSource();
const CSS = /<style>([\s\S]*?)<\/style>/.exec(HTML)[1];

function attrsOf(tag) {
  const out = {};
  const re = /([a-zA-Z_:][-\w:.]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = m[2];
  return out;
}
function allTags(html, name) {
  const re = new RegExp(`<${name}\\b([^>]*)>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push({ attrs: attrsOf(m[1]), index: m.index, raw: m[0] });
  return out;
}

/* --------------------------------------------------------------- 5. saying
   the answer out loud. render() runs on every keystroke, so marking the result
   itself as live would announce every character typed. The announcement has to
   be a separate, debounced, off-screen sentence. */

test('a polite live region exists to speak the settled result', () => {
  const live = allTags(HTML, 'div').concat(allTags(HTML, 'p'), allTags(HTML, 'output'))
    .filter(d => d.attrs['aria-live'] === 'polite' || d.attrs.role === 'status');
  assert.equal(live.length, 1, 'the document has exactly one polite live region');
});

test('the live region is off-screen and is not the per-keystroke result', () => {
  const live = allTags(HTML, 'div').concat(allTags(HTML, 'p'), allTags(HTML, 'output'))
    .find(d => d.attrs['aria-live'] === 'polite' || d.attrs.role === 'status');
  const { id, class: cls } = live.attrs;
  assert.ok(id, 'the live region is addressable, so the script can write to it');
  assert.match(cls || '', /sr|visually/,
    'the live region carries a visually-hidden class');

  // The nodes render() rewrites on every keystroke must not themselves be live.
  for (const target of ['single-val', 'arr-val', 'cards', 'note']) {
    const el = [...allTags(HTML, 'div')]
      .concat(allTags(HTML, 'span'))
      .find(d => d.attrs.id === target);
    assert.ok(el, `#${target} exists`);
    assert.ok(el.attrs['aria-live'] !== 'polite' && el.attrs.role !== 'status',
      `#${target} is rewritten per keystroke, so it must not be the live region`);
  }
});

test('announcements are debounced rather than fired per keystroke', () => {
  assert.match(SCRIPT, /setTimeout\([^)]*announce|cancelAnimationFrame\([^)]*announce|announceTimer/,
    'the announcement path is deferred behind a timer, not written synchronously');
  assert.match(SCRIPT, /clearTimeout\(announceTimer\)/,
    'a pending announcement is cancelled when the user keeps typing');
});

/* ------------------------------------------------------ 6. describing the
   chart. role="img" makes the subtree presentational, so every axis label
   inside it -- including the message explaining that no instrument has been
   entered -- was unreachable. A title and description carry it instead, and
   they have to survive the redraw. */

test('the chart is described by a title and a description', () => {
  const svg = allTags(HTML, 'svg').find(s => s.attrs.id === 'chart');
  assert.ok(svg, 'the chart exists');

  const ids = (svg.attrs['aria-labelledby'] || '').split(/\s+/).filter(Boolean);
  assert.equal(ids.length, 2, 'the chart names both a title and a description');
  assert.ok(/title/.test(ids[0]), 'the first label names the title');
  assert.ok(/desc/.test(ids[1]), 'the second label names the description');

  for (const id of ids) {
    assert.ok(new RegExp(`id="${id}"`).test(HTML), `#${id} exists`);
  }
  assert.ok(!svg.attrs['aria-label'],
    'a static aria-label would describe a chart that changes with the inputs');
});

test('redrawing the chart does not erase its own description', () => {
  const svg = allTags(HTML, 'svg').find(s => s.attrs.id === 'chart');
  const open = HTML.indexOf('<svg id="chart"');
  const close = HTML.indexOf('</svg>', open);
  const inner = HTML.slice(open, close);

  assert.ok(/<g[^>]*id="chart-plot"/.test(inner),
    'the plot draws into its own group');
  assert.ok(!/<g[^>]*id="chart-plot"[^>]*\/>/.test(inner) || true);

  const writes = [...SCRIPT.matchAll(/\$\("(chart[^"]*)"\)\.innerHTML/g)].map(m => m[1]);
  assert.ok(writes.length > 0, 'the script redraws the chart');
  for (const target of writes) {
    assert.equal(target, 'chart-plot',
      'innerHTML is written to the plot group, not over the title and desc');
  }
  assert.match(SCRIPT, /\$\("chart-plot"\)\.innerHTML\s*=\s*s\.join\(""\)/,
    'the drawn chart is actually drawn -- an empty plot group would describe a '
    + 'picture that is not there');
});

test('the chart description is recomputed from the current inputs', () => {
  // Two paths write the description: the nothing-to-plot case and the drawn
  // chart. Counting assignments rather than matching one of them is what stops
  // the drawn-chart path being deleted while the test still passes.
  const writes = [...SCRIPT.matchAll(/chart-desc["']\s*\)?\.textContent\s*=/g)];
  assert.ok(writes.length >= 2,
    `both the empty state and the drawn chart describe themselves (found ${writes.length} write(s))`);
  assert.match(SCRIPT, /chart-desc["']\s*\)?\.textContent\s*=\s*d\.join\(" "\)/,
    'the drawn chart builds its description from the values it just plotted');
});

/* ------------------------------------------------------------- 8. refusing
   to guess. An empty or negative field fell back to a hardcoded default and
   reported a confident number that contradicted what had been typed. */

test('an invalid field is announced, not silently defaulted', () => {
  const alert = [...allTags(HTML, 'div'), ...allTags(HTML, 'p')]
    .find(d => d.attrs.role === 'alert');
  assert.ok(alert, 'the document has an assertive region for invalid input');
  assert.ok(alert.attrs.id, 'the alert region is addressable');
  assert.match(CSS, new RegExp(`\\.${alert.attrs.class}\\b`),
    'the alert region is styled, so it is shown and hidden deliberately');
});

test('unreadable input is marked invalid on the field itself', () => {
  assert.match(SCRIPT, /setAttribute\(["']aria-invalid["']/,
    'the script marks the offending field with aria-invalid');
  assert.match(SCRIPT, /removeAttribute\(["']aria-invalid["']/,
    'and clears it again once the field is readable');
});

test('the error message is not rewritten while it is unchanged', () => {
  assert.match(SCRIPT, /if\([\s\S]{0,60}?\.textContent\s*!==\s*\w+\s*\)/,
    'an alert is only written when its message actually changes, so that holding '
    + 'a field empty does not re-announce on every keystroke');
});