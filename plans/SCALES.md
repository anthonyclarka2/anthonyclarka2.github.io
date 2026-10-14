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

## The log-log rows

`LL1`, `LL01`, `LL2`, `LL02` and `LL3` are not logarithmic in their value. Each
is graduated in the logarithm of the **excess over one** -- `log(v - 1)` above
one, `log(1 - v)` below.

The construction is confirmed by the arithmetic rather than assumed. `LL1` runs
1.01 to 1.1, so its excess runs 0.01 to 0.1, which is exactly one decade of
log10. Every LL row fits the rule for the same reason: its span is the log of
max excess over min excess, and each of them is one decade.

| Row | Reads | Excess | Labels |
| --- | --- | --- | --- |
| `LL01` | below one | 0.01 to 0.1 | `.99 .98 … .90` |
| `LL1` | above one | 0.01 to 0.1 | `1.01 1.02 … 1.10` |
| `LL02` | above one | 0.1 to 1 | `1.10 1.20 … 2` |
| `LL2` | above one | 0.1 to 1 | `1.10 1.20 … 2` |
| `LL3` | above one | 1 to 10 | `2 3 4 … 11` |

This is what the rows are for. On an ordinary log scale 1.01 sits a single pixel
from 1 and is unreadable; the log-log rows spend a whole decade resolving
exactly that region. Drawing them as ordinary log scales -- which is what
happened first -- printed `1 10 100 1000` on a row that reads 1.01 to 1.1, which
is not a crowded version of the right answer but a different and wrong one.

## Graduations

Every row carries three classes of mark, longest to shortest:

| Class | Carries | Length |
| --- | --- | --- |
| labelled | the printed number | 0.62 of the row |
| middle | a graduation between two labels | 0.40 |
| fine | the half, between two labels | 0.24 |

The hierarchy is what makes a scale readable: the long ticks are the landmarks a
reader aims the cursor at, and the short ones fill in between. Drawn at one
length the row is a comb.

Subdivision beyond the halves is **not derivable from the photographs**. A real
log-log rule of this family subdivides the first decade far more finely than the
later ones, tapering so that the tick density stays even along the rule; that is
the "Deci-Log" idea behind the name. The photographs do not resolve enough minor
ticks to recover the taper, so the implementation marks every decade equally at
the halves and does not claim the taper. Every graduation keeps its tick; only
the printed numbers thin out where they would collide, so the scale still shows
where each mark is.

## What the photographs settle

Read off the high-resolution images rather than inferred:

- **Where each scale starts.** Every scale begins at the same vertical line: the
  `1` of `L`, `K`, `A`, `C` and `D` all align, and the reciprocal rows begin
  there too. There is no margin to the left of the index.
- **Legend placement.** Each row's name is printed to the left of that line,
  clearing the first graduation by two to three characters.
- **Colour.** Front: `LL01`, `CIF`, `CI`, `DI` red; `L`, `K`, `A`, `CF`, `C`,
  `D`, `LL1` black. Back: `LL02`, `LL03`, `T`, `S` red; `DF`, `B`, `SRT`, `D`,
  `LL3`, `LL2` black. The legends are printed in their row's colour.
- **Reciprocal rows.** `CI` and `DI` are printed `9 8 7 6 5 4 3 2 1` and then
  `9 8 7 6 5 4 3 2 1` again, each group one decade further along — the
  mantissa, with the `1` marking the decade. They run `9` to `1` and then `0.9`
  to `0.01` and so on across the whole rule.
- **`S` and `T` carry stacked pairs.** `79/11`, `78/12`, `75/25`, `65/25`,
  `50/40`: the second figure is the complement to ninety, so each graduation
  prints the angle and its complement. On `S` that is sine against its
  cosecant; on `T`, tangent against its cotangent.

## Not derivable from the photographs

Recorded so the implementation does not quietly invent them:

- **Which degrees carry a pair on `S` and `T`.** That each graduation prints the
  angle and its complement is clear. Which of the ninety are printed as pairs and
  which carry a single figure is legible only in part, and guessing the set would
  put numbers on the rule that are not there. Not yet implemented.
- **The end-of-row captions.** Every row carries a multiplier range at its right
  end — `-.001 to -.01`, `0.01 to 10`, `10 to 100`, `-.01 to -.1`, `0.001 to
  01`, `01 to 1.0`. These are readable but not transcribed exactly, and a
  caption that states the wrong multiplier is worse than none. Not yet
  implemented.
- **`LL02`/`LL03` subdivision density.** The construction of the log-log rows is
  derived (see above), but which round values each prints is a printing
  decision the photographs settle only loosely. `LL02` is drawn as a copy of
  `LL2` and `LL03` as a copy of `LL3`, which follows the naming but is not
  confirmed against the instrument.
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