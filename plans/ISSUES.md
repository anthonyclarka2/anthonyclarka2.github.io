# Open issues: fidelity to the K&E 4181-3

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
| I-5 Sine needs a scale the chosen face lacks | `FIXED` — the reading was wrong, not the faces |

---

## The authoritative layout

Transcribed from the photographs at 1:1. This is the specification; the row order
in `rule669.js` and the band in `slideBand()` must agree with it exactly.

**THE TWO FACES WERE SWAPPED IN THE FIRST READING OF THESE PHOTOGRAPHS.** What is
written below is the corrected one. The front carries the C family and the
log-log pair LL2/LL3; the back carries L, K and A with the trig rows and the
log-log pair LL01/LL1. The quickest way to tell the reading is right: the front
has TEN rows and the back ELEVEN, across the same height of ivory, so the back's
rows are visibly shorter -- measured at 90.3px against the front's 99.2px.

**Front face** — ten rows, three pieces:

```
  LL02     stock     red numbers
  LL03     stock     red numbers
  DF       stock
  ---------------- upper boundary of the slide ----------------
  CF       slide
  CIF      slide     red numbers
  -------- horizontal line: divides the slide exactly in two ----
  CI       slide     red numbers
  C        slide
  ---------------- lower boundary of the slide ----------------
  D        stock
  LL3      stock
  LL2      stock
```


**Back face** — eleven rows, three pieces:

```
  LL01     stock     red numbers
  L        stock
  K        stock
  A        stock
  ---------------- upper boundary of the slide ----------------
  B        slide
  -------- horizontal line: between B and T ----
  T        slide     red numbers
  SRT      slide
  S        slide     red numbers
  ---------------- lower boundary of the slide ----------------
  D        stock
  DI       stock     red numbers
  LL1      stock
```

The row NAMES in the left-hand column are printed black on every row of both
faces. Only the numbers take the second, red pass. `front_legends.png` and
`back_legends.png` are the 1:1 crops this was read from, and they settle it for
every red row on both faces.


Two features of the slide are called out separately because they are not row
boundaries and are easy to mistake for them:

- Each face has a horizontal line printed across its slide, and **the two lines
  are not in the same place**. The front's falls between `CIF` and `CI`, which
  divides its four sliding rows exactly in half. The back's falls between `B`
  and `T`, which divides its four one from three. Only the front divides exactly
  in two.
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

**Status:** `FIXED` — cause found, fix verified in the browser

**Reported.** `D` is missing from the lower part of the front face. The front
should read `… C, D, DI, LL1`.

**Resolution.** The same cause as I-3: `slideBand` returned the wrong range, so
`D`'s printing fell under the slide plate and was painted over. Fixed with I-3,
and confirmed since in the browser — the front face now draws all ten rows with
`D` on the stock below the bar, carrying its own graduations. The reported row
list (`… C, D, DI, LL1`) was itself a symptom of the swapped faces: on the
corrected layout `DI` and `LL1` are back-face rows and the front ends `D, LL3,
LL2`.

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

**Status:** `FIXED` — the reading was wrong, not the faces

**Found.** `resolveFace` is the first piece of face logic that could be asked
what it was doing, and asking it showed that sine cannot be read on either
face. `sin` and `cos` read with `S` and `CI`. `S` is printed on the back; `CI`
is printed on the front. `faceCanShow(['S', 'CI'], face)` is false for both.

**Resolution — read off the instrument, not decided.** The reading was the
mistake. A sine on this rule is read against **`D`**, which is printed on BOTH
faces, so nothing has to be seen through the instrument at once and the question
dissolves.

`S` is graduated so that `D` under a graduation shows **ten times the sine**: sin
30° sits over `D`'s 5, not its 0.5, because both scales share the rule's single
decade and a sine never exceeds one. The reader places the decimal point, which is
what an instrument of this period asks of them. The old plan read `CI` there,
which at an `S` graduation shows the reciprocal of the `D` reading — the cosecant
over ten — so `sin(30)` narrated a number that looked like an answer and was not
one.

Confirmed by the arithmetic of the corrected geometry, and stated in the tests:
`read('D', posOf('S', 30))` is 5, and `read('D', posOf('T', 45))` is 10. `S` runs
from about 5.74° at its index to 90° at its far end and `T` from 5.71° to 45°,
which is where the photographs show their first and last graduations.

`scalesUsed` in `app.js` now returns `['S', 'D']` and `['T', 'D']`, so
`resolveFace` turns the rule to the back — the face that prints `S` — and finds
everything the operation reads already there. The face note no longer fires for
trigonometry.

---

## Where this stopped

End of the session that reworked the layout to the corrected authoritative one
above. Tree on `dev` at `fbb84db` plus this change, 208 tests green:

```
node --test "tests/**/*.test.js"
```

Note the tests live in `tests/slide-rule/` and reach back through
`../../docs/` — they were moved out of `docs/` because that is the directory
GitHub Pages publishes, and a bare directory is not a directory to a glob.
The test command is the one in `.github/workflows/pages.yml`.

**What this session changed.**

- The faces were unswapped and every row, colour and legend settled at 1:1
  against the photographs. `rule669.js` now carries the corrected rows, the
  measured body metric (26-unit rows, 10.12 row-heights of ivory, 59.4 of axis,
  a legend column of 4.4 and caps of 3.9 and 3.6) and a uniform pitch per face.
- `geometry.js` was rewritten around ONE decade: every row spans the rule and is
  compressed by its own cycle count. The log-log rows are graduated on
  `log10|ln v|`, the folded scales are a shift rather than a wrap, and every
  range is exactly one decade.
- `render.js` was rewritten: graduations are generated per scale kind, the C and
  D rows print the instrument's own peculiar tenths convention (`1 1 2 3 … 9`),
  the folded rows carry a printed `π` at each end and CIF a `3.18`, the row names
  are black on every row, and the log-log rows print the lists read off the rule.
- `plan.js` reads sine and tangent against `D`, brings large operands down to
  their mantissas and carries the decades, uses C's right-hand index for products
  past ten, and reads roots with the cursor on A or K. Multiplication, division,
  powers and roots now work for operands the old four-decade model refused.

**The walk, which is the current work.** Rows are being read off the instrument
one at a time and encoded as `regions` (how finely a stretch is marked, and which
of its marks are printed longer) plus `marks` (the numbers it prints). Grade and
number are independent — LL03 prints `.005` on a medium tick and `.0005` on a
long one — so neither is derived from the other.

| row | state |
| --- | --- |
| LL02 | walked, tick for tick |
| LL03 | walked, tick for tick |
| CF, DF | walked, and mirror images of each other |
| LL3, LL2, LL01, LL1 | numbers read from the photographs; marks between them are a uniform comb, not a reading |
| CIF, CI, C, D | numbers and spacing generated from C's break-down; never walked |
| L, K, A, B | generated; L read as `.0 .1 … .9 1` |
| T, S | generated: whole degrees, thinned; never walked |
| SRT | not recovered at all, drawn as a name only |
| DI | generated, and paired with D |

Structural facts the walk has established, which the code now carries: a row's
printing can fall on either side of its baseline (`mirror`, CF alone so far); a
number can be centred on its tick or anchored by its last character (`numbers`);
a number can be printed smaller than its row's others (`small`); a row's ends can
be graded and named independently of its stretches (`ends`); and a stretch can
name individual longer marks that fall on no step (`longAt`, which is how CF's 25
is described).

**Still not drawn at all:** the `S`/`T` complement pairs (`84|6`, `83|7`) and
every row's end-of-row range caption.

**Next session, in this order.**

1. **Carry on walking the rows.** `LL3` and `LL2` are the next with real
   content to check, then the C family, `L`/`K`/`A`/`B`, and the trig rows.

2. **Debug the zoom and the animation across steps.** The main view is a fixed
   `DETAIL_PX_PER_UNIT` of 1.25 and so is 2532px wide against a panel of about
   880, which is deliberate — it overflows and scrolls. What is not settled is
   whether the container should scroll to follow the camera's focus
   automatically or stay where the reader put it.

3. **The slide's ends.** The bar now travels up to its own length, which is what
   dividing by a value below one takes, so it is clipped to the body of the rule
   rather than allowed to hang past the end caps. Worth a look in the browser at
   the extremes of travel.

**Worth re-measuring rather than trusting.** Everything about layout was checked
in a real browser because the DOM stub cannot see any of it. The figures recorded
here — the 2532x329 main view, the 983x128 overview, the 94-unit cursor glass —
were measured at one window width.

---

## Suggested order of work

1. **Walk each row against the photographs**, one at a time. Everything
   unverified is listed in `plans/SCALES.md`.
2. **Zoom and scroll** across steps.
3. **`S` and `T` paired labels**, and the end-of-row captions. Both are readable
   in the photographs and neither is implemented: the complement pairs
   (`84|6`, `83|7`) sit near the left of both rows, and every row carries its
   range caption in the end column.

Everything above needs a browser check as well as a green suite. The row order,
the band, the seams and the midline are all layout, and the DOM stub cannot see
any of them.
