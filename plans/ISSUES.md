# Open issues: fidelity to the K&E 669

Raised from the high-resolution photographs of the instrument. Each entry records
what the instrument does, what the implementation does, what is known so far, and
what still has to be checked. Nothing here is speculative by intent: where a
cause is not yet confirmed it says so.

Status values: `OPEN`, `DIAGNOSED` (cause identified, fix not yet written),
`FIXED` (fix written and verified).

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

**Status:** `DIAGNOSED`

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

**Fix.** Distinguish a *chosen* face from a *derived* one:

- Hold `faceOverride`, set by the `Front`/`Back` buttons and cleared when the
  expression changes.
- In `drawRule`, only auto-switch when `faceOverride` is null. When it is set,
  honour it even if the operation needs a scale from the other face, and say so
  in the explanation panel rather than silently switching back.
- `drawRule` currently duplicates the chip-highlighting loop that `setFace` also
  has; fold that into one place so the two cannot drift.

**Tests.** No test covers the face switch. Needed, because this failure is silent
— the chip highlight changes, so it looks like it worked:

1. With `2.5 * 3.7` loaded, clicking `Back` leaves the drawn face on `back`.
2. Choosing `Back` and then typing `sin(30)` keeps `back` (it agrees anyway).
3. Choosing `Back` and then typing `2 + 3` — an operation the back cannot
   perform — stays on `back` and reports that it cannot be performed there.
4. Choosing `Back`, then reloading the expression to one needing the front,
   switches back automatically once the override is cleared.
5. `setFace` and the auto-switch leave the chip highlight agreeing with the face
   actually drawn, checked together rather than separately.

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

**Diagnosis to run.** In the browser, on the front face: confirm `#row-D` exists
with its legend and 68 graduations; confirm its `getBoundingClientRect()` lies
inside `#rule`'s viewport; and screenshot the `C`/`D`/`DI` band at 1:1 with no
camera zoom to see what is actually painted. If it paints correctly, the cause is
(3), camera framing, and the fix is a framing one rather than a layout one.

---

## I-3 — Slide boundaries appear to be in the wrong place

**Status:** `OPEN` — not reproduced from the code; may be the same root cause as I-2

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

**Hypothesis to test first.** The two lines a reader sees on the front are the
upper and lower seams *and* — once I-5 is implemented — the midline. If the
midline is missing or misplaced it is easy to misattribute the visible line. Note
that the reported lower boundary, "between C and DI", is exactly where `D`
should be: if `D` is invisible, the seam above it reads as being between `C` and
`DI`. That makes **I-2 and I-3 likely one bug seen twice**, not two.

**Diagnosis to run.** Resolve I-2 first, then re-check the boundaries. If `D`
renders, re-examine whether the seams are too prominent — `SEAM = 8` against a
26-unit row is a third of a row, which is visually loud, and the stock plates
carry a `stroke-width: 1` outline on top of it.

---

## I-4 — The slide's dividing line is missing on both faces

**Status:** `OPEN` — confirmed absent from the code

**Reported.** A horizontal line divides the front of the slide exactly in two,
between `CIF` and `CI`. The back has the same line, between `B` and `T`.

**What the code says.** Not implemented. There is no such line anywhere in
`render.js` or `rule669.js`. The only horizontal rules drawn are the two stock
plate outlines and the slide plate outline. This one is a plain omission, not a
misplacement.

**Fix.** Add the midline to `rule669.js`, where the band is described, rather than
to the renderer:

- `slideMidline(face)` returning the y between the two halves. It is simply
  halfway across the band, which is what "exactly in two" means — but derive it
  from the midpoint of the band rather than hard-coding a row, so it stays true
  if `ROW_H` or `SLIDE_BAND_SCALE` ever change.
- `render.js` draws it inside the `#slide` group so it travels with the bar. It
  must be drawn over the plate and under nothing else, and it should be lighter
  than the seams, since it is a division *within* one piece rather than a gap
  between two.
- Both faces split the same way, so one implementation covers both; the test
  should assert it for both faces rather than only the front.

**Tests.** Assert the midline exists on each face, that it is at the band's
midpoint, and that it lies between the correct pair of rows (`CIF`/`CI` on the
front, `B`/`T` on the back) — the midpoint alone would pass even if the row
order changed underneath it.

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

## Suggested order of work

1. **Cross-cutting spec test** — cheap, and it pins everything below.
2. **I-1 (Back button)** — diagnosed; blocks verification of the whole back face,
   so nothing about the back can be checked until it is fixed.
3. **I-4 (midline)** — confirmed absent, unambiguous, and the specification is
   already exact.
4. **I-2 then I-3 together** — resolve the `D` question first; the boundary
   question may resolve itself.

Each of these should be built test-first, and each needs a browser check as well
as a green suite: the row order, the band and the seams are all layout, and the
DOM stub cannot see any of them.
