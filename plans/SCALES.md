# Scale reference: K&E 669

Read from the two photographs of the 10-inch K&E 669 log-log rule (front and
back). This is a reference sheet, not code. `geometry.js` implements the rows
that can be derived exactly; the rest are recorded here with their ambiguity
spelled out, because knowing what we do not know is part of the deliverable.

## What the rule is

Two-sided, ivory stock, aluminium end caps with fixing screws at each end, and a
clear glass cursor with a metal surround and four corner screws. Both
photographs show the same rule from opposite faces, so the scale lists below are
complementary rather than two different instruments.

The stock is a logarithmic axis. Every ordinary scale on it is a graduation of
that one axis, which is why the whole geometry reduces to `pos(v) = log10(v)`.

Each face is built in three bands: fixed scales above, the slide across the
middle, fixed scales below. The slide carries the second reading of each pair.

## Front face

Top (fixed): `LL01`, `L`, `K`, `A`
Slide: `CF`, `CIF`, `CI`, `C`
Bottom (fixed): `D`, `DI`, `LL1`

| Row | Name | Notes |
| --- | --- | --- |
| 1 | `LL01` | Log-log, one decade of small ratios. Red labels .91-.98 |
| 2 | `L` | The main log scale, 1-10-100-1000-10000 |
| 3 | `K` | Cube scale |
| 4 | `A` | Square scale |
| 5 | `CF` | "Cube of" scale, on the slide, with the pi marks |
| 6 | `CIF` | Reciprocal of CF, on the slide |
| 7 | `CI` | Reciprocal scale, on the slide |
| 8 | `C` | Second log scale, on the slide; C against D multiplies |
| 9 | `D` | Third log scale, fixed |
| 10 | `DI` | Reciprocal of D, fixed |
| 11 | `LL1` | Log-log detail at the high end, 1.01-1.1 |

> **Correction.** This list was first read from the photographs, which gave nine
> rows: `CIF` was taken as one row and `DI` was missed entirely. The scale list
> supplied for the instrument has eleven. The photograph reading was wrong, not
> the rule.

## Back face

Top (fixed): `LL02`, `LL03`, `DF`
Slide: `B`, `T`, `SRT`, `S`
Bottom (fixed): `D`, `LL3`, `LL2`

| Row | Name | Notes |
| --- | --- | --- |
| 1 | `LL02` | Log-log, second decade, red labels .91-.98 |
| 2 | `LL03` | Log-log third decade, red, .2 through 2/3 |
| 3 | `DF` | Repeating-decimal / pitch scale, pi marked |
| 4 | `B` | Cube scale, on the slide, with 2 and 3pi marks |
| 5 | `T` | Tangent, on the slide. Red paired labels |
| 6 | `SRT` | Small-angle sine/tangent/tangent-cotangent, on the slide |
| 7 | `S` | Sine, on the slide. Red paired labels |
| 8 | `D` | Log scale, fixed |
| 9 | `LL3` | Log-log, large values, red, 6 through 20000 |
| 10 | `LL2` | Log-log detail, 1.01-1.1 region |

## Verified derivable

These follow from the one log axis and need no interpretation:

- `L`, `C`, `D` — position `log10(v) * dpx`
- `K`, `B` — cube scales, position `3 * log10(v) * dpx`
- `A` — square scale, position `2 * log10(v) * dpx`
- `CF`, `CIF` — cube and reciprocal-cube
- `S`, `T` — projected, at `-log10(sin t)` and `-log10(tan t)`

`K`, `B`, `CF` and `CIF` are the same graduation as one another, read against
different partners. Drawing them as separate rows with their own labels is what
the photographs show, and it is what makes the rule teachable.

## Not derivable from the photographs

Recorded so the implementation does not quietly invent them:

- **Paired red labels on `S` and `T`.** The back face prints sin/cot and tan/cot
  as stacked pairs at each graduation, for example `78`/`22` and `80`/`20`. The
  pattern is legible but the exact pairing rule is not certain from a
  photograph, so the implementation prints one label per graduation.
- **`LL01`/`LL02`/`LL03` fine graduations.** The red labels .91 to .98 are
  readable, but the minor tick spacing between them cannot be recovered.
- **`SRT` graduation.** Its scale is visible and labelled 0.6 to 1, but its
  relationship to `S` and `T` is not established here. It is deferred.
- **`DF`.** The pi marks are clear; the scale's exact rule is not.

## Consequences for the app

- **The rule has a CI scale**, on the slide above C. So sine is read the same
  way as on a Deci-Log: under an S graduation, D shows the cosecant, and the CI
  graduation shows the sine. This finding survives the correction above.
- `A` gives squares and square roots, which is the main way to raise to a power
  on this rule rather than repeated multiplication.
- `DI` reciprocates against `D` in the same way `CI` does against `C`, which
  makes reciprocals a direct read rather than a division.
- Eleven rows on the front face and ten on the back is dense. This is the
  constraint that drove the zoomed main view and the minimap.

## What the photographs got wrong

Recorded so the mistake is not repeated:

- The front face has **eleven** rows, not nine. `CIF` and `CI` are two separate
  rows, and `DI` was missed entirely between `D` and `LL1`.
- The face is organised in **three bands** — fixed, slide, fixed — which is not
  visible from the photographs alone because the slide's scales are printed
  directly onto the sliding bar. Reading the rows top to bottom without knowing
  which piece each row is printed on led to `L` being marked as sliding when it
  is fixed.