# Plan: Slide Rule Simulator

A single-page web app that accepts a calculation as input and animates a slide
rule performing it, step by step, in SVG.

---

## 1. Goal and non-goals

**Goal.** Given an expression like `2.5 * 3.7`, `cbrt(250)` or `asin(0.5)`, drive
an animated slide rule through the correct physical procedure for that
operation, narrating each move, and report what the rule could actually have
read — including its error against the true value.

**Non-goals.**
- Not a calculator that happens to have a slide rule skin. The animation must
  show the *real* physical method for each operation, including the cases where
  that method is awkward or has a range limit.
- No build step, no dependencies, no network access.

**Design principle.** Accuracy beats prettiness. Where the real instrument is
limited (4 decades, `ln` capping at 9.21, trig ranges), the app surfaces the
limit rather than hiding it. The interesting part of a slide rule is that it
*cannot* do addition, cannot hold more than ~4 decades, and cannot do log base 10
without a mental trick — that story should come through.

---

## 2. Repo changes

This is a GitHub Pages repo publishing from **`./docs/`** (the GitHub convention).
It originally held a single self-contained `index.html` at the repo root (the
interplanetary telescope resolution calculator), now at `docs/index.html`.

| File | Action |
| --- | --- |
| `docs/index.html` | Currently the telescope calculator. Becomes the **landing page** linking to both tools |
| `docs/telescope.html` | `git mv docs/index.html docs/telescope.html`; contents unchanged except the CSP meta and a "back to index" link |
| `docs/slide-rule.html` | Markup shell only |
| `docs/slide-rule.css` | All styling |
| `docs/slide-rule.js` | All logic, IIFE + strict mode |

`plans/` is outside the published directory and is never served. `docs/CNAME`
already holds the custom domain, so it stays as-is.

### CSP

The existing page ships a strict CSP:

```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; ...
```

Splitting into external `css`/`js` requires `'self'`, so `docs/telescope.html`
becomes:

```
default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'none'; connect-src 'none'; font-src 'none'; media-src 'none';
object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'
```

`img-src 'none'` stays — the rule is inline SVG, no raster assets.

> **Risk.** `script-src 'self'` is unreliable over `file://` in some browsers.
> Local development should use `python3 -m http.server`, not double-click.

### Visual consistency

Reuse the design tokens already in `index.html` (`--bg`, `--panel`, `--line`,
`--ink`, `--accent: #5fd0f5`, `--accent-2: #f2a65a`, `--mono`, `--sans`) so the
two tools read as one site. The rule body is the one place a material texture
(ruled ivory/beige stock, dark slide) is worth introducing — but keep the page
chrome dark to match.

---

## 3. Slide rule model

Modelled on a 10-inch K&E-style Deci-Log rule: **4 decades** across the axis.

- **Stock** (fixed): D, A, CI, Ln
- **Slide** (moves): C, B, C|, K, S, T, ST

### 3.1 The core fact

Every log scale is linear in log₁₀ of value. Define

```
dpx        = AXIS_PX / DECADES            // 4 decades
pos(v)     = log10(v) * dpx               // position of graduation v from the scale's index
```

Everything else follows from where a graduation is *placed* relative to C.
These derivations were verified numerically before planning; see §9.

| Scale | Position of graduation `y` | Consequence |
| --- | --- | --- |
| C, D | `log y` | stock and slide coincide when slide is home |
| A, C\| | `2 log y` | A tick `x` → D reads `x²`. D reads `v` → A reads `√v`. A and C\| are the *same* graduation, drawn twice — authentic |
| B, K | `3 log y` | K tick `x` → D reads `x³`. D reads `v` → K reads `∛v` |
| CI | `−log y` | reads `1/x` |
| Ln | `log10(e)·k = 0.43429·k` | linear in ln; read directly off the stock |

**Consequence worth internalising:** at the S graduation for angle θ, the D
scale reads `csc θ`, not `sin θ`. So **sine is read on the CI scale**, against
the S scale. Same for tangent against T. This is how a real rule works and it
is why CI is on the stock in the Deci-Log layout.

### 3.2 Projected trig scales

S, T and ST are *not* log scales of value. S and T are projections in which
angle runs backwards:

```
p_S(θ) = (log10(sin θ) − log10(sin θmax)) * dpx + offset_S
p_T(θ) = (log10(tan θ) − log10(tan θmax)) * dpx + offset_T
```

90° (resp. θmax) sits at the scale's own index; small angles run right.
Verified: at the S graduation for 30°, CI reads exactly `0.500000`.

**Each scale needs its own origin offset.** T cannot use S's origin — `tan`
exceeds 1 above 45°, so the T scale's 1-mark cannot sit at the left index the way
S's can. A 4-decade rule covers roughly **0.5°–89.5° on T** (that is
`2.059 + 2.059 = 4.118` decades; 0.1°–89.5° would need 4.817 and does not fit).
S comfortably covers 90° down to ~0.1° in 2.758 decades.

**ST** is graduated **linearly in degrees** over the S span (90° at the left
index, 0° at the right end, ≈8.5 px/degree on a 1000 px axis). It is the angle
read-out and shares tick positions with S, which is exactly what makes §4's
inverse-trig method work.

### 3.3 Known range limits to surface in the UI

- `ln` on a 4-decade rule tops out at **9.21** (`e^9.21 = 10⁴`). `ln(50000)` is
  genuinely off the end of the rule.
- Root and power operations need the value to sit inside the rule's span, or be
  decade-normalised (§6).

---

## 4. Operation → animation

Each operation compiles to a list of steps:

```
{ target: 'slide' | 'cursor', to: <px>, say: "<narration>" }
```

`slide` tweens the slide group's `transform`; `cursor` tweens the hairline.
Narration is written as an instruction a person could follow on a real rule.

| Input | Choreography |
| --- | --- |
| `a * b` | Slide C's 1 onto `a` on D → cursor to `a` → cursor to `a·b`, read off D |
| `a / b` | Slide `a` on C over `b` on D → cursor to the C index → quotient on D |
| `x²` | Slide home → cursor runs to `x` on the **A** scale; D reveals `x²` |
| `sqrt(x)` | Slide home → cursor to `x` on D; A and C\| both read `√x` |
| `x³` | Cursor to `x` on the **K** scale; D reads `x³` |
| `cbrt(x)` | Cursor to `x` on D; K reads `∛x` |
| `log10(x)` | Cursor to `x` on D. If `x ≥ 10`, **slide C's 1 to the cursor first** so the mantissa is in view; read mantissa on C, characteristic off D's decade |
| `ln(x)` | Slide home; cursor to `x` on D; read the Ln scale |
| `sin(θ)` | Cursor to `θ` on S; read **CI** |
| `cos(θ)` | Cursor to `90−θ` on S → `sin`, narrated as the standard identity |
| `tan(θ)` | Cursor to `θ` on T; read **CI** |
| `asin/acos/atan(v)` | Cursor to `v` on D, then **slide until the S/T graduation meets the cursor**, read θ on ST |

### 4.1 Why the inverse-trig move works

Put the cursor on `v` on D at `p_c = pos(v)`. Slide by

```
tx = p_c − p_S(θ)
```

Now the S graduation for θ lands exactly at `p_c`, and D reads `v` there. The
user is *visually confirming* the alignment — that visual coincidence is the
whole method. Then ST under the cursor reads θ, because ST and S share tick
positions.

Verified for `asin(0.25/0.5/0.8)` and `atan(0.5/1.5/3)`: the graduation lands on
the cursor to within floating-point error.

> **Open item.** This was reconstructed from first principles, not read off a
> manual. It is self-consistent and numerically exact, but it is the one claim
> here worth checking against a physical rule before shipping.

---

## 5. Animation engine

- **rAF tween loop**, easing curve, writing `transform="translate(x,0)"` on the
  slide group. Not CSS transitions — rAF gives interruptible, seekable, pausable
  motion, which CSS transitions make awkward.
- Controls: play / pause / step / replay, speed, scrub bar, keyboard shortcuts.
- **The rule is draggable.** Users can grab the slide or the cursor and verify by
  hand. A drag cancels the running animation.
- **Active scales brighten, the rest dim to ~35%**, so the row in play is obvious
  without hiding the others (a real rule has them all printed).
- `prefers-reduced-motion` jumps straight to the end state.
- Re-layout on resize recomputes `dpx` and rebuilds tick positions.

---

## 6. Normalisation and edge cases

A real rule is only 4 decades long, so the app must handle the edges the way a
person would:

- **Multiplication/division**: normalise operands into 1–10 by shifting decades
  (`10 × 5` → `2 × 5`, read the 10 back at the end). If the required slide
  offset runs off the end, re-normalise and narrate why.
- **Inverse trig**: small values land the cursor off the left end. Pull them up by
  powers of ten and scale the angle back — `asin(0.25)` → `asin(2.5)/10`. This is
  the classic hand trick and makes a good animation beat.
- **Negatives**: slide rules handle sign by convention (work with mantissas).
  Normalise to a positive mantissa and narrate the sign separately.
- **Out of range**: if a value genuinely cannot be represented, say so rather than
  silently clamping. This is a teaching moment.
- **Results off the top of the rule** for `ln`: report the 9.21 ceiling.

---

## 7. Input and parsing

One text box, parsed by a **hand-written recursive-descent parser — no `eval`**
(the page's own CSP story makes string-eval bad practice regardless).

- Numbers, including scientific notation (`1.2e3`)
- Operators: `+ - * / ^ ** ( )`, unary minus
- Functions: `sqrt`, `cbrt`, `log10`, `log`, `ln`, `sin`, `cos`, `tan`,
  `asin`, `acos`, `atan`
- Angles parse as **degrees**
- Errors return a caret-pointed message against the input string, not a stack trace

Example chips: compound interest, Rule of 72, gear ratio, `sin(35)`, `cbrt(250)`.

The parser returns an **AST**, so the UI can show the structure of what was typed
rather than just a number — and the choreography compiler can walk it for
multi-step expressions.

---

## 8. Layout

**Left panel (360px, matching the existing page):** expression box, chips, parsed
AST readout, error area, transport controls, and a result card showing
**the slide rule's reading vs. the true value, with % error** — snapped to the
actual nearest engraved 0.1 division, because that is what a real rule could
resolve.

**Right:** the SVG rule (full width), then a step log ("Working"), then a short
history note on why slide rules lost to pocket calculators.

**SVG structure:**

```svg
<svg viewBox="0 0 1180 380">
  <g id="stock">      <!-- D, A, CI, Ln : never moves -->
  <g id="slide" transform="translate(tx,0)">  <!-- C, B, C|, K, S, T, ST -->
  <g id="cursor" transform="translate(cx,0)"> <!-- hairline + vernier readout -->
</svg>
```

Ten scales in ~360 px is tight. If it proves cramped, add a **focus mode** that
enlarges just the two scales currently in play.

---

## 9. Build order

1. **Geometry module** — `pos`, per-scale origins, tick generation
2. **SVG rendering** — stock, slide, cursor, tick labels
3. **Parser + evaluator** → AST
4. **Tween engine** + choreography compiler (operation → steps)
5. **UI shell** — input, chips, transport, result card
6. **Landing page** — turn `docs/index.html` into the landing page and relocate
   the telescope calculator to `docs/telescope.html`

### Self-test

The repo has no test infrastructure and we want to keep it that way, so:

- Guard `?selftest=1` → runs assertions and logs to console
- Pure geometry/parser functions stay free of DOM references so they are
  independently checkable

Assertions to seed it with (all currently passing in the planning spikes):

```
pos:  readOnD(pos(a), b)          === a * b
      readOnD(pos(a) - pos(b), 1)  === a / b
A:    tick x -> D reads x²
K:    tick x -> D reads x³
A/C|: D reads v -> reads √v
S:    CI at S-graduation for θ     === sin θ
T:    CI at T-graduation for θ     === tan θ
inv:  S-graduation lands on cursor within 1e-9, for asin and atan
Ln:   mark k sits at 0.43429k decades
```

---

## 10. Open questions

- **Inverse-trig method** — geometrically verified and self-consistent, but
  reconstructed rather than sourced. Verify against a real rule before shipping.
  *(§4.1)*
- **Scale density** — ten scales in ~360 px may be cramped; may need focus mode.
  *(§8)*
- **Which rule to model** — the K&E Deci-Log layout is assumed. If a different
  era or region is more interesting (a British Abavo, a German Rades, a pocket
  Otis King), the scale set changes and so does the "which scale reads the sine"
  story.

---

## Appendix: verification spikes run during planning

All the geometric claims above were checked numerically before this plan was
written. Highlights:

```
mult  2.5 x 3.7  ->  9.250000          (exact)
div   2.5 / 3.7   ->  0.675676          (exact)
A:    D=100  -> A reads 10
C|:   D=16   -> C| reads 4
K:    D=125  -> K reads 5
S:    30deg -> CI reads 0.500000 ;  60deg -> 0.866025
T:    45deg -> CI reads 1.000000 ;  12deg -> 0.212557
asin: 0.25 -> 14.478deg, graduation lands on cursor exactly
atan: 3    -> 71.565deg, graduation lands on cursor exactly
```

Two findings from these spikes changed the design:

1. **`tan` cannot share S's origin** — `tan` exceeds 1 above 45°, so the T scale's
   1-mark cannot sit at the left index the way S's can. Every scale now carries
   an explicit origin parameter instead of sharing one formula. *(§3.2)*
2. **`ln` has a real ceiling of 9.21** on a 4-decade rule. Surfaced rather than
   hidden. *(§3.3)*