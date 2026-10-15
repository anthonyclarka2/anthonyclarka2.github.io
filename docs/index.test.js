'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

/* ---------------------------------------------------------------------------
   The seam is the shipped document, not its behaviour. docs/index.html is a
   single self-contained file whose logic lives in an unexported IIFE, so there
   is nothing to call. What we can hold still is the *accessibility contract*
   the markup promises: an assistive technology reading this file cold must
   find a skip link, must find every control named, and must not have to read a
   stale value out of a label. Those are properties of the bytes, they are what
   regress silently, and they can be checked without a DOM.

   Runtime behaviour -- whether a live region actually announces, whether the
   chart description tracks the inputs -- is not covered here. That needs a
   browser, and this repo has no harness for one.
   ------------------------------------------------------------------------ */

/* A deliberately small reader for the narrow questions we ask below. It knows
   about attributes and about one level of nesting, which is all this file uses.
   It is not an HTML parser and does not pretend to be. */
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
  while ((m = re.exec(html))) out.push({ attrs: attrsOf(m[1]), index: m.index });
  return out;
}
function token(name) {
  const root = /:root\s*\{([\s\S]*?)\}/.exec(HTML);
  assert.ok(root, 'the stylesheet declares a :root block');
  const m = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(root[1]);
  assert.ok(m, `the stylesheet declares ${name}`);
  return m[1];
}
function expand(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
}

/* Relative luminance and contrast ratio, transcribed from WCAG 2.x rather than
   from anything this page computes -- the page computes no colour maths at all,
   so the specification is an independent source of truth here. */
function luminance(hex) {
  const [r, g, b] = expand(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const label = (what, fg, bg) =>
  `${what} (${fg} on ${bg}) is ${contrast(fg, bg).toFixed(2)}:1, needs 4.5:1`;

/* ------------------------------------------------------- 1. a way past the
   controls. There are 39 focusable stops between the top of the page and the
   answer; a skip link is the only thing that makes that proportional. */

test('the first focusable element is a skip link to the results', () => {
  const links = allTags(HTML, 'a').filter(l => (l.attrs.href || '').startsWith('#'));
  assert.ok(links.length > 0, 'the document offers an in-page skip link');

  const skip = links[0];
  assert.match(skip.attrs.class || '', /skip/,
    'the in-page link is identified as the skip link');

  const target = skip.attrs.href.slice(1);
  assert.ok(new RegExp(`id="${target}"`).test(HTML),
    `the skip link target #${target} exists in the document`);

  const focusables = [...HTML.matchAll(/<(?:a|button|input|select|textarea)\b/g)]
    .map(m => m.index);
  assert.equal(Math.min(...focusables), skip.index,
    'the skip link is the first focusable element in the document');
});

/* ------------------------------------- 2. a label names its field, and only
   its field. The unit echo lives in the same box as the label text, so an
   assistive technology reads the current value back as part of the name --
   and the name changes with every keystroke. */

test('no for-label wraps another identified element', () => {
  const ids = [...HTML.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*\bid="[^"]*"[^>]*)>/g)]
    .map(m => ({ id: /id="([^"]*)"/.exec(m[2])[1], index: m.index }));

  const offenders = [];
  for (const lab of allTags(HTML, 'label')) {
    if (!lab.attrs.for) continue; // wrapping labels are a different, valid shape
    const close = HTML.indexOf('</label>', lab.index);
    const end = close === -1 ? HTML.length : close;
    for (const el of ids) {
      if (el.index > lab.index && el.index < end) {
        offenders.push(`<label for="${lab.attrs.for}"> contains #${el.id}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    'a for-label must name the field and nothing else');
});

test('each echoed unit reading is described by, not named to, its field', () => {
  const echoes = ['dist-m', 'wl-m', 'dia-m', 'sep-m', 'ntel-m'];
  for (const id of echoes) {
    assert.ok(new RegExp(`id="${id}"`).test(HTML), `#${id} exists`);
    const field = id.replace(/-m$/, '');
    const control = allTags(HTML, 'input')
      .concat(allTags(HTML, 'select'))
      .find(c => c.attrs.id === field);
    assert.ok(control, `#${field} exists`);
    const described = (control.attrs['aria-describedby'] || '').split(/\s+/);
    assert.ok(described.includes(id),
      `#${field} keeps #${id} as its description rather than its name`);
  }
});

/* ------------------------------------------- 3. every control is named. A
   unit select with no name is announced as a bare "AU, combo box"; nothing in
   the announcement says what it scales. */

test('every input and select has an accessible name', () => {
  const labelled = new Set(
    allTags(HTML, 'label')
      .map(l => l.attrs.for)
      .filter(Boolean)
  );
  // Controls a wrapping label supplies a name for.
  const wrapped = new Set();
  for (const lab of allTags(HTML, 'label')) {
    if (lab.attrs.for) continue;
    const close = HTML.indexOf('</label>', lab.index);
    const inner = HTML.slice(lab.index, close === -1 ? HTML.length : close);
    for (const m of inner.matchAll(/<input\b([^>]*)>/g)) {
      const id = /id="([^"]*)"/.exec(m[1]);
      if (id) wrapped.add(id[1]);
    }
  }

  const unnamed = [];
  for (const control of [...allTags(HTML, 'input'), ...allTags(HTML, 'select')]) {
    const { id } = control.attrs;
    const named = control.attrs['aria-label'] ||
      control.attrs['aria-labelledby'] ||
      (id && labelled.has(id)) ||
      (id && wrapped.has(id));
    if (!named) unnamed.push(id ? `#${id}` : control.attrs.type || 'an unnamed control');
  }
  assert.deepEqual(unnamed, [], 'every control carries an accessible name');
});

/* ------------------------------------ 4. the presets can be seen to be
   focused. The number fields, the selects and the switch all draw a focus
   ring; the 34 preset chips drew none, which is a WCAG 2.4.7 failure on the
   only control family that most invites keyboard use. */

test('chips draw a focus indicator of their own', () => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(HTML)[1];
  const rule = /\.chip[^{]*:focus-visible[^{]*\{[^}]*\}/.exec(css);
  assert.ok(rule, 'the stylesheet has a :focus-visible rule for .chip');
  assert.match(rule[0], /outline|box-shadow/,
    'the chip focus rule actually paints something');
});

/* ---------------------------------------------- 7. text that can be read.
   --ink-3 carries every section heading, the working-card captions and the
   footer, and it sat at 3.4:1 on the panels it sits on. */

test('every text colour clears WCAG AA on every surface it is used on', () => {
  const surfaces = ['--bg', '--bg-2', '--panel', '--panel-2'].map(token);
  const inks = ['--ink', '--ink-2', '--ink-3', '--accent', '--accent-2'].map(token);

  const failures = [];
  for (const ink of inks) {
    for (const surface of surfaces) {
      if (contrast(ink, surface) < 4.5) failures.push(label(ink, ink, surface));
    }
  }
  assert.deepEqual(failures, [],
    'a colour token used for text must read at 4.5:1 on any panel behind it');
});

test('chart axis text clears WCAG AA against the plot background', () => {
  const plotBg = /<rect[^>]*fill="(#[0-9a-fA-F]{3,8})"/.exec(HTML)[1];
  const textFills = [...HTML.matchAll(/<text[^>]*fill="(#[0-9a-fA-F]{3,8})"/g)]
    .map(m => m[1]);

  assert.ok(textFills.length > 0, 'the chart draws labelled text');
  const failures = [...new Set(textFills)]
    .filter(fill => contrast(fill, plotBg) < 4.5)
    .map(fill => label('chart text', fill, plotBg));
  assert.deepEqual(failures, [],
    'axis and message text inside the plot must be readable');
});