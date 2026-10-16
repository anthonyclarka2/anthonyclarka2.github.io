# Scale reference: K&E 4181-3

The instrument is a 10-inch K&E 4181-3 Log Log Duplex Decitrig. Everything below
was read at 1:1 from high-resolution photographs of the instrument — two of the
assembled rule, one for each face (7859x1356 and 7786x1305) — and checked
against the published scale-set diagrams for the model
(https://mccoys-kecatalogs.com/KECollection/4081-3/ke4181-3_s5.htm). This is a
reference sheet, not code: it records what is known, names what is not, and
fills nothing in by inference.

The instrument is not a "K&E 669". An earlier version of this sheet called it
that. `669` and `352669` are serial numbers stamped on the instrument. The same
earlier version had the two faces swapped and several of the scale descriptions
wrong; the corrections are listed near the end, so the mistakes are not
repeated.

## The two faces

Both faces are the same instrument seen from opposite sides, and both are built
from three pieces: the fixed stock above, the sliding bar across the middle, and
the fixed stock below. `stock` below means the fixed part and `slide` the moving
bar. The seam above and below the slide is a *gap between two pieces of
material*, not a printed line.

**Front face** — ten rows:

```
  LL02     stock
  LL03     stock
  DF       stock
  ---------------- upper boundary of the slide ----------------
  CF       slide
  CIF      slide
  -------- horizontal line printed across the slide --------
  CI       slide
  C        slide
  ---------------- lower boundary of the slide ----------------
  D        stock
  LL3      stock
  LL2      stock
```

**Back face** — eleven rows:

```
  LL01     stock
  L        stock
  K        stock
  A        stock
  ---------------- upper boundary of the slide ----------------
  B        slide
  -------- horizontal line printed across the slide --------
  T        slide
  SRT      slide
  S        slide
  ---------------- lower boundary of the slide ----------------
  D        stock
  DI       stock
  LL1      stock
```

Each face has a horizontal line printed across its slide, and the two lines are
not in the same place. The front's falls between `CIF` and `CI`, dividing its
four sliding rows two and two. The back's falls between `B` and `T`, dividing
its four one and three. Only the front divides exactly in two.

The back carries one row more than the front — eleven against ten — and the two
faces are the same physical height cap to cap, so the back's rows are shorter.
Measured row pitch: about 99 px on the front against 88 to 91 px on the back,
the 10:11 ratio the row counts predict.

`D` is printed on both faces. Every other row name appears on one face only.

## Colours

A row's numbers are printed in red or black. The row's name, in the left-hand
legend column, is printed in black on every row of both faces; the red/black
distinction applies to the numbers alone.

| Face | Numbers in red | Numbers in black |
| --- | --- | --- |
| Front | `LL02`, `LL03`, `CIF`, `CI` | `DF`, `CF`, `C`, `D`, `LL3`, `LL2` |
| Back | `LL01`, `T`, `S`, `DI` | `L`, `K`, `A`, `B`, `SRT`, `D`, `LL1` |

## The graduated length

Every row's graduations span the full graduated length of the rule. They all
begin at the same left index and end at the same right-hand end.

Measured on the front face at 1:1: graduated length about 5895 px against a row
pitch of about 99 px, so the graduated length is about 59.5 row-heights. The
ivory body measures about 6991 x 1004 px, an aspect of about 6.96:1, and about
7.72:1 measured cap to cap.

The body is laid out left to right as roughly 4.4 row-heights of legend column,
then the 59.5 row-heights of graduations, then 6.6 row-heights of blank ivory
carrying the end-of-row captions and the maker's mark.

Every ordinary scale is a graduation of the one logarithmic axis. The rows
differ in how many cycles of that axis they carry in the one graduated length,
and in the direction they run. This replaces an earlier and now-disproven model
in which the whole stock was treated as one four-decade axis.

## How each row is graduated

| Row(s) | The row's rule | Position of a value `v` along the length |
| --- | --- | --- |
| `C`, `D` | one decade of `log10(v)` | `log10(v)` of the length |
| `A`, `B` | two decades of `log10(v)` | `log10(v) / 2`, so `1` to `100` fills the rule twice over |
| `K` | three decades of `log10(v)` | `log10(v) / 3` |
| `L` | linear, `0` to `1` | `v` itself; the `log10` of a `1`-to-`10` reading spans exactly `0` to `1` |
| `CF`, `DF` | one decade, folded at pi | `(log10(v) - log10(pi))` taken modulo 1 |
| `CIF` | the folded reciprocal of `CF` | `(-log10(v) - log10(pi))` taken modulo 1 |
| `CI`, `DI` | reciprocal, drawn descending | `10` at the left index, down to `1` at the right-hand end |
| `LL01`, `LL02`, `LL03`, `LL1`, `LL2`, `LL3` | one decade of `log10(\|ln v\|)` each | spans the full length |
| `S` | sine of an angle | `log10(sin θ) + 1` |
| `T` | tangent of an angle | `log10(tan θ) + 1` |
| `SRT` | small angles | not yet recovered |

Notes:

- `A` is the square scale: the `D` reading under an `A` graduation of `v` is
  `sqrt(v)`.
- `S` runs from about 5.74 degrees (`sin = 0.1`) at the left index up to 90
  degrees (`sin = 1`) at the right-hand end. The sine of an angle is read on
  the `D` scale as ten times its value.
- `T` runs from about 5.71 degrees (`tan = 0.1`) at the left index up to 45
  degrees (`tan = 1`) at the right-hand end.
- On `CF` and `DF` the photographs show the labels in the order `4 5 6 7 8 9`
  and then `1 2 3`, with a pi mark at *both* ends of the row: pi at 0.00 and
  10 pi wrapping to the right-hand end at 1.00. Confirmed at three separate
  points on the photograph.
- On `CIF` the photographs show the row opening at about 3.18, then
  `2 1 9 8 7 6 5 4`, ending at about 3.18 again.

## The log-log rows

Each of the six log-log rows is exactly one decade of `log10(|ln v|)`, spanning
the full graduated length. Each carries its own natural-logarithm range as a
caption printed at the right-hand end of the row:

| Row | Caption | Values | Sense |
| --- | --- | --- | --- |
| `LL01` | `-0.01 to -0.1` | `e^-0.01` (0.990) down to `e^-0.1` (0.905) | descends left to right |
| `LL02` | `-0.1 to -1.0` | `e^-0.1` (0.905) down to `e^-1` (0.368), with `1/e` marked at the far end | descends left to right |
| `LL03` | `-1.0 to -10.0` | `e^-1` (0.368) down to `e^-10` (0.0000454) | descends left to right |
| `LL1` | `0.01 to 0.1` | `e^0.01` (1.0100) up to `e^0.1` (1.1052) | ascends left to right |
| `LL2` | `0.1 to 1.0` | `e^0.1` (1.1052) up to `e` (2.718), with `e` marked at the far end | ascends left to right |
| `LL3` | `1.0 to 10.0` | `e` (2.718) up to `e^10` (22026): labelled `e`, then `3`, and at the far end `200`, `500`, `1000`, `2000`, `5000`, `10000`, `20000` | ascends left to right |

An earlier reading took these rows to be graduated on the *excess over one* —
`log10(v - 1)` above one and `log10(1 - v)` below. That model is provably wrong
for the large rows: it cannot place `LL3`'s `20000` label on a one-decade row
at all, whereas `log10(ln v)` puts it at 99.6% along the row, which is where
the photograph shows it. The excess model is a good approximation only for the
rows close to one.

## The paired labels on `S` and `T`

Both `S` and `T` carry stacked pairs at the same graduation: a red number over
a black number, written here as `84|6` — red `84` over black `6`. These are
the complement pairs. The black number is the angle whose sine (on `S`) or
tangent (on `T`) the graduation reads; the red number is its complement.

`sin 6` and `tan 6` differ by about 0.5%, so the `84|6` pair sits at almost
exactly the same place on both rows, which is what the photograph shows.

Reproducing the pairs is not yet implemented.

## What the first pass got wrong

Recorded so the mistakes are not repeated:

- **The two faces were swapped.** The first pass put `LL01`, `L`, `K`, `A`
  above the slide and `DI`, `LL1` below it on the *front*; those six belong to
  the back. It gave the back the front's `LL02`, `LL03` and `DF` above the
  slide and `LL3` and `LL2` below it. (`D` is printed on both faces, so it was
  right either way.) The sliding rows were right on both faces. The row counts
  went with the swap: the front has ten rows and the back eleven, not the
  reverse.
- **The log-log rows are not on the excess over one.** They are one decade of
  `log10(|ln v|)` each. The excess construction fits the rows near one
  approximately, which is what made it plausible, but it cannot fit the large
  rows at all.
- **`B` and `CF` are not cube scales.** `B` carries two decades, the same as
  `A`; `K` is the three-decade cube scale. `CF` is `C` folded at pi.
- **`CI` and `DI` are one descending pass**, `10` at the left index down to
  `1` at the right, not a run of mantissas repeated across the rule.
- **The legends are not coloured.** Every row's name, in the left-hand column,
  is black on both faces. Only the numbers are red or black.
- **The name.** The instrument is a K&E 4181-3; `669` and `352669` are serial
  numbers stamped on it.

## Not yet recovered

Recorded so that nothing is filled in silently:

- **`SRT`'s graduations.** The row is on the back face's slide and is
  labelled, but its graduation has not been recovered from the photographs.
  Nothing about it is claimed here.
- **The subdivision density of `LL03` and `LL02`.** The log-log construction
  is settled, but which intermediate values these two rows print, and how
  finely, has not been read off the instrument.
- **The `S`/`T` paired labels.** Which graduations carry a pair rather than a
  single figure has not been established, and reproducing the pairs is not yet
  implemented.
- **The end-of-row captions.** The six log-log captions are transcribed above;
  the captions on the other rows have not been read. None of them is drawn yet.
