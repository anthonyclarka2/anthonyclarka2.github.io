# Open issues: fidelity to the K&E 669

Raised from the high-resolution photographs of the instrument. Each entry records
what the instrument does, what the implementation does, what is known so far, and
what still has to be checked. Nothing here is speculative by intent: where a
cause is not yet confirmed it says so.

Status values: `OPEN`, `DIAGNOSED` (cause identified, fix not yet written),
`FIXED` (fix written and verified).

| Issue | Status |
| --- | --- |
| I-1 Back button does nothing | `FIXED` |
| I-2 D appears missing from the lower front | `FIXED` |
| I-3 Slide boundaries appear misplaced | `FIXED` |
| I-4 Slide's dividing line missing | `FIXED` |
| I-5 Sine needs a scale the chosen face lacks | `OPEN` |

---

## The authoritative layout

Transcribed from the photographs. This is the specification; the row order in
`rule669.js` and the band in `slideBand()` must agree with it exactly.

**Front face** — eleven rows, three pieces:

```
  LL01     stock
  L        stock
  K        stock
  A        stock
  ---------------- upper boundary of the slide ----------------
  CF       slide
  CIF      slide
  -------- horizontal line: divides the slide exactly in two ----
  CI       slide
  C        slide
  ---------------- lower boundary of the slide ----------------
  D        stock
  DI       stock
  LL1      stock
```

**Back face** — ten rows, three pieces:

```
  LL02     stock
  LL03     stock
  DF       stock
  ---------------- upper boundary of the slide ----------------
  B        slide
  -------- horizontal line: divides the slide exactly in two ----
  T        slide
  SRT      slide
  S        slide
  ---------------- lower boundary of the slide ----------------
  D        stock
  LL3      stock
  LL2      stock
```

Two features of the slide are called out separately because they are not row
boundaries and are easy to mistake for them:

- The slide is divided **exactly in half** by a horizontal line, between `CIF`
  and `CI` on the front, and between `B` and `T` on the back. Both faces split
  the same way.
- The seam above and below the slide is a *gap between pieces*, not a rule.

---

## I-1 — The Back button does nothing

**Status:** `FIXED`

**Reported.** Clicking `Back` leaves the front face showing, so the back of the
instrument cannot be inspected.

**Cause — confirmed by reading `app.js`.** There are two places that decide the
face, and the second one always wins.

`setFace(next)` (line 180) records the choice and then calls `drawRule(current)`.
But `drawRule` (line 157) recomputes the face from the expression before it draws:

```js
const needed = scalesUsed(p) || [];
const wanted = needed.find((n) => rule669.faceFor(n));
if (wanted && rule669.faceFor(wanted) !== face) {
  face = rule669.faceFor(wanted);   // overwrites the user's choice
}
```

For the default expression `2.5 * 3.7` the scales used are `C` and `D`. `C` is
printed on the front only, so `faceFor('C')` is `front`, and the guard fires and
resets `face` to `front` — the same value the user was already looking at. The
click lands, the chip highlight is set, the redraw happens, and the face is put
back. The button appears inert.

This is also why the button *does* appear to work for some expressions: typing
`sin(30)` uses `S`, which is back-only, so the auto-switch and the manual choice
happen to agree and the face turns over. The manual control is being overridden
by the auto-switch, not broken.

The auto-switch itself is right in principle — the app must not animate a scale
that is not printed on the face being shown — but it must yield to an explicit
choice.

**Resolution.** The decision moved out of `drawRule` and into `resolveFace` in
`rule669.js`, which is a pure function and therefore testable:

```js
resolveFace(scales, { chosen, current })
```

- A `chosen` face always wins.
- Otherwise the current face is kept if it can print every scale the plan reads.
- Otherwise the first face that can, is used.
- Otherwise the first scale that exists anywhere decides, so trigonometry still
  turns the rule over (see I-5).
- Otherwise the face is left alone.

`faceCanShow` and `facesFor` back it. `facesFor` exists because `faceFor`
returned the first face a scale appears on, and `D` is printed on **both** —
so "can the back show `D`" was answering false on a face that prints it.

`app.js` holds `faceChoice` separately from `face`, cleared in `update()` so a
face picked to look round does not then govern the next calculation. The chip
highlighting, duplicated in `drawRule` and `setFace`, is now `markFaceChips`.

When the chosen face cannot print a scale the operation reads, the app says so
in a note under the buttons rather than turning the rule back — the buttons
exist to let the other side be looked at.

**Tests.** `resolveFace` and `faceCanShow` are covered directly. The wiring in
`app.js` has no test seam, so it was verified in the browser: clicking `Back`
with `2.5 * 3.7` loaded draws all ten back rows and reports that `C` is not on
that side; typing `sin(30)` from the front turns the rule over; typing
`2.5 * 3.7` again turns it back and clears the note.

---

## I-2 — D appears to be missing from the lower front face

**Status:** `OPEN` — not yet confirmed

**Reported.** `D` is missing from the lower part of the front face. The front
should read `… C, D, DI, LL1`.

**What the code says.** This one does not reproduce from the layout, so it needs
checking at 1:1 rather than a guess.

`FRONT` in `rule669.js` lists `D`, `DI` and `LL1` in that order after `C`, and
`D` is not in `SLIDE_SCALES.front`, so it is placed on the stock. Reading the
rendered DOM directly rather than inferring from bounding boxes gives:

| row | piece | y (rule units) |
| --- | --- | --- |
| `CF` | slide | 142 |
| `CIF` | slide | 174.5 |
| `CI` | slide | 207 |
| `C` | slide | 239.5 |
| `D` | stock | 272 |
| `DI` | stock | 298 |
| `LL1` | stock | 324 |

`D` is present, carries 68 graduations, and sits at y=272 — immediately below the
slide band, which ends at 272. So by the layout it is correct and it is not
inside the slide.

**Why it may still look wrong.** Three candidates, to be checked in the browser
rather than guessed at:

1. **Draw order.** The `#slide` group is appended to the SVG after the `#stock`
   group (`render.js` line 538). Any stock row that overlaps the band is painted
   over by the slide plate. `D` starts exactly at the band bottom, so a
   half-pixel of overlap at the seam would clip its first tick — but not its
   whole row, which makes this an unlikely sole cause.
2. **The lower stock plate.** `y: band.bottom, height: ruleHeight - band.bottom`
   covers the same region as `D`. It is appended before the rows so the rows
   should win, but this is the same z-order question and worth confirming.
3. **Crowding.** `D` sits hard against the seam with a 26-unit row and a 27-unit
   label ascent, and the camera zooms in on a reading point rather than on the
   whole face. At the zoom the cursor settles on, `D` may simply be off-screen
   while the reader is looking at `C` and `DI` — which would present exactly as
   "D is missing".

**Cause — the same one as I-3.** A row's `y` is its baseline and its
graduations are drawn *upward* from it, but `slideBand` returned the range from
the first sliding row's baseline to the last one's baseline plus its height.
So `D`, which is on the stock, printed at 255.9–272 against a plate ending at
272: its graduations were under the plate, and the plate is appended after the
stock, so it painted over them. Confirmed on both faces — `D` on the back was
covered in exactly the same way.

**Resolution.** The band now spans the printing of its rows: from the first
sliding row's baseline less its tallest graduation, to the last one's baseline.
`TALLEST_GRADUATION` moved into `rule669.js` as the instrument metric it is,
because the plate has to know how far a row's printing reaches, and a number
duplicated across two modules is how the two came to disagree.

**Test.** A render-level test asserts every row's graduations fall inside the
piece it is printed on, on both faces, and that a row drawing no graduations is
only ever one whose graduations are unverified.

---

## I-3 — Slide boundaries appear to be in the wrong place

**Status:** `FIXED` — same cause as I-2

**Reported.** The slide boundaries are currently between `CF`/`CIF` and `C`/`DI`
on the front, rather than above `CF` and below `C`.

**What the code says.** `SLIDE_SCALES` is already correct:

```js
front: ['CF', 'CIF', 'CI', 'C'],
back:  ['B', 'T', 'SRT', 'S'],
```

and `layout()` reserves `SEAM` once, only where the fixed stock gives way to the
slide (`if (!onSlide && nextIsSlide) y += SEAM`), so the band is not split into
four pieces. `slideBand()` takes the first and last slide rows. Measured on the
rendered front face: band top 142 (exactly `CF`'s y), band bottom 272 (exactly
`C`'s y + height). The boundaries are correct.

**Cause — the same one as I-2.** For the same reason, `CF` on the front and `B`
on the back, which are printed *on* the slide, had their graduations drawn
outside it, above its top edge, on the stock. A row whose numbers appear off the
bar reads as a row that is not on the bar, so the eye puts the boundary one row
too high — between `CF` and `CIF`. And the reported lower boundary, "between C
and DI", is exactly where `D` should be: `D` was invisible, so the seam above it
read as being between `C` and `DI`. One bug, seen twice.

**Resolution.** Fixed with I-2. Verified in the browser: the front plate runs
121.85–239.5 with `CF` at 122–142 and `C` at 219–240 inside it and `D` at
256–272 clear of it; the back plate runs 95.85–213.5 with `B` at 96–116 and `S`
at 193–214 inside it.

---

## I-4 — The slide's dividing line is missing on both faces

**Status:** `FIXED`

**Reported.** A horizontal line divides the front of the slide exactly in two,
between `CIF` and `CI`. The back has the same line, between `B` and `T`.

**What the code says.** Not implemented. There is no such line anywhere in
`render.js` or `rule669.js`. The only horizontal rules drawn are the two stock
plate outlines and the slide plate outline. This one is a plain omission, not a
misplacement.

**Resolution.** `slideMidline(face)` in `rule669.js`, drawn inside the `#slide`
group so it travels with the bar, lighter than either seam.

Two things the tests forced out, both of which a midpoint would have got wrong:

- **The two faces divide at different points.** The front splits its four
  sliding rows two and two and so lands on the band's midpoint by coincidence.
  The back splits one from three, and the midpoint falls between `T` and `SRT`
  instead of between `B` and `T`. Which row each line falls below is therefore
  per-face data (`SLIDE_MIDLINE`), not geometry. A test asserts the two faces do
  not share a fraction, so "simplifying" them to a common midpoint fails.
- **It sits in the gap between the rows' printing, not on the boundary between
  their baselines.** Graduations are drawn upward from a baseline, so a line on
  the boundary runs straight into the lower row's ticks. The gap is the only
  place on the bar where a line prints cleanly.

**Tests.** The line is asserted to exist, to be drawn inside the plate, and to
fall in the gap between the named pair of rows on each face.

---

## Cross-cutting: none of the row order is under test

Four of these issues share a cause worth naming: **the row order and piece
assignment are declared once and never checked against the specification
above.** `rule669.test.js` asserts that rows exist, that their kinds are known,
and that `width()` is exported, but nothing asserts the *sequence* or which piece
each row is printed on. A row inserted, dropped or moved between pieces passes
every test.

The single highest-value test for this project is a table-driven one that reads
the specification in `ISSUES.md` and asserts it:

```js
const SPEC = {
  front: {
    order: ['LL01', 'L', 'K', 'A', 'CF', 'CIF', 'CI', 'C', 'D', 'DI', 'LL1'],
    slide: ['CF', 'CIF', 'CI', 'C'],
    midlineBetween: ['CIF', 'CI'],
  },
  back: {
    order: ['LL02', 'LL03', 'DF', 'B', 'T', 'SRT', 'S', 'D', 'LL3', 'LL2'],
    slide: ['B', 'T', 'SRT', 'S'],
    midlineBetween: ['B', 'T'],
  },
};
```

It should assert `layout(face).map(r => r.name)` equals `order`, that the rows
named in `slide` are exactly those with `slide === true`, and that `slideBand`
spans the first to the last of them. That one test would have caught I-2 and
I-3 outright, and it is what stops the next row-order change from being silent.

---

## I-5 — A sine is read with two scales that are never on the same face

**Status:** `OPEN` — found while fixing I-1, not yet fixed

**Found.** `resolveFace` is the first piece of face logic that could be asked
what it was doing, and asking it showed that sine cannot be read on either
face. `sin` and `cos` read with `S` and `CI`. `S` is printed on the back; `CI`
is printed on the front. `faceCanShow(['S', 'CI'], face)` is false for both.

The app already told the reader to do this: the working steps for `sin(30)` read
"Read 0.5 against CI", and the rule had turned itself over to the back to show
`S`, which has no `CI` on it. `resolveFace` falls back to the first scale that
exists anywhere, which turns the rule to the back and keeps trigonometry
working, but it does not answer the question.

**Why this is not a coding error to fix quickly.** How the instrument actually
reads a sine was not established here. The obvious reading — that `S` is
graduated so that `sin θ` falls at the same position on the front's `C` scale,
so the cursor is set on `S` and the value read through it on `C` — cannot be
right as drawn, because a single face cannot be seen through the cursor at once.
The alternatives all need the photographs or the instrument to settle, and
guessing would produce a confident animation of a procedure that is not the one
the rule performs.

**To settle it, one of:**

1. Read the `S` scale's graduations off the back photograph and check where they
   fall relative to `C` on the front. If they coincide, sine is read across the
   faces and the app should say so rather than naming one scale on the other.
2. Read the `SRT` scale, whose graduations are also unknown. If it carries
   `sin θ` directly, sine is read entirely on the back and the step text should
   say `SRT` rather than `CI`.

**Meanwhile.** The face note added for I-1 reports the gap honestly: with
`sin(30)` on the back it reads "Back face: this operation needs CI, which this
side does not carry." That is the correct thing to show until the procedure is
settled, and it is better than the previous behaviour of quietly claiming a
scale that is not there.

---

## Suggested order of work

The first four are done. What is left, in order:

1. **I-5** — needs a reading of the photographs or the instrument, not a
   decision. Until then the face note reports the gap, which is the honest
   state.
2. **Re-check `LL2`/`LL3` against the photographs.** The back now renders and
   can be inspected, which it could not before I-1. Their ranges are still the
   ones derived from the naming rather than read off the rule: `LL3` shows
   `2 3 4 … 11` and `LL2` shows `1.10 1.20 … 2`, where the instrument carries
   far wider ranges. Recorded in `plans/SCALES.md` as unverified.
3. **`S` and `T` paired labels, and the end-of-row captions.** Both readable in
   the photographs, both listed in `SCALES.md` as not yet implemented.

Everything above needs a browser check as well as a green suite. The row order,
the band, the seams and the midline are all layout, and the DOM stub cannot see
any of them.
