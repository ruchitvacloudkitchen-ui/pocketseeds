# tools

Build-time scripts. Neither is part of the app — the app itself still ships
with no dependencies and works offline.

## face.js — the printed box face

Generates the face from the app's own config. It reads `MB_CELLS` and
`MB_FACE_ROWS` out of `box/index.html` rather than keeping its own copy, so
the print and the app cannot drift apart. Change the config in one place and
regenerate.

```
node tools/face.js --cell 13.4           # cell size drives the face: 236.6 x 262.6 mm
node tools/face.js --w 220               # or give a face width and get the cell
node tools/face.js --dpi 600 --out dist
```

Writes:

| file | what it is |
|---|---|
| `box-face.svg` | **the print file.** Every glyph is an outlined path — zero `<text>`, zero `font-family` |
| `box-face-proof.svg` | the same drawing with live text, for reading on screen |
| `box-face-proof.pdf` | a proof that names Helvetica. Never send it to print |
| `box-face.json` | the cell order, to check a run against |

Exits non-zero, saying which, if the cells do not add up to the goal or do not
fit the declared rows — and again if a font reference somehow reaches the
print file.

Sizes for the 10 x 20 face (8mm margin, 1.4mm gutter, 26mm footer band):

| cell | face |
|---|---|
| 12 mm | 148.6 x 308.6 mm |
| 13 mm | 158.6 x 328.6 mm |
| **13.4 mm** | **162.6 x 336.6 mm** |
| 14 mm | 168.6 x 348.6 mm |

With no arguments at all the face is derived from the grid at a 13.4mm cell.
Nothing here is a stored millimetre measurement: a hard-coded default outlives
the grid it was measured for, and the next regrid would quietly squash the
cells to fit it.

At 2.07:1 this face is a tall panel, not a cube face. The script says so on
every run. If it has to sit on a cube, the column count is what changes.

## The cell order is frozen, not shuffled at print time

`MB_FACE_ORDER` in `box/index.html` is the printed sequence, written down. The
app draws from it and this script prints from it, so the screen and the box
cannot drift apart — which matters, because the whole mechanic is "fill a
printed cell, tap the same cell here".

`MB_CELLS` beside it is only a bill of materials: how many of each
denomination the face carries, in no particular order. Reading *that* in order
is what once drew the board as twenty solid bands while the print was mixed.

To re-cut the face:

```
node tools/face.js --make-order
```

It prints a `MB_FACE_ORDER` literal to paste over the existing one, shuffled
with a fixed seed so the face reads as mixed rather than blocked. It skips the
order checks, since those are what it is being run to satisfy. **Doing this
invalidates every box already printed.**

The script refuses to print at all if the order is not `MB_CELLS` rearranged —
same denominations, same counts, same total.

**Send `box-face.svg` to the printer.** Its text is outlined by `glyphs.js`,
so there is no font name in the file at all — a printer without the font
cannot substitute one, which is what would otherwise set the wrong character
for `₹` (U+20B9) onto wood and turn the run into scrap. The PDF proof still
names Helvetica, which is exactly why it is called a proof and why its footer
reads `Rs.`.

## boxes.js — box IDs and QR labels

```
npm install qrcode                       # build-time only, see below
node tools/boxes.js --n 500
node tools/boxes.js --from 501 --n 250   # a later run continues the numbering
node tools/boxes.js --base https://pocketseeds.online --out dist/run1
```

Writes one QR SVG per box, a labels sheet laid out for guillotining, and a CSV
of the run. The QR payload is the full production URL
(`https://pocketseeds.online/box/?id=BOX0001` — unchanged by the Seed Box rename, and never to be changed), and each label prints the box
id beside the code in human-readable form — outlined, like the face — so a
scuffed code is still recoverable by typing the number in.

It uses the `qrcode` package rather than a hand-rolled encoder, and refuses to
run without it. A QR encoder is a day's work and there is no scanner in the
build environment to prove the output scans — a subtly wrong encoder is the
kind of mistake you find after five hundred boxes are printed.

## glyphs.js

A monoline vector alphabet covering only the characters this project prints.
Both scripts use it instead of naming a font. `text()` throws on a character
it does not have, rather than dropping it — a missing glyph in a print file is
worse than a failed build.
