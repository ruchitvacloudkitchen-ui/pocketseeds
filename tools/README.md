# tools

Build-time scripts. Neither is part of the app — the app itself still ships
with no dependencies and works offline.

## face.js — the printed box face

Generates the face from the app's own config. It reads `MB_CELLS` and
`MB_FACE_ROWS` out of `box/index.html` rather than keeping its own copy, so
the print and the app cannot drift apart. Change the config in one place and
regenerate.

```
node tools/face.js                       # 118 x 566 mm at 300 dpi
node tools/face.js --w 120 --h 560       # face size in mm
node tools/face.js --dpi 600 --out dist
```

Writes `dist/box-face.svg`, `.pdf` and `.json`. Exits non-zero, saying which,
if the cells do not add up to the goal or do not fit the declared rows.

Cell order is shuffled with a fixed seed so the face reads as mixed rather
than blocked, and so re-running produces the identical layout. Changing
`--seed` invalidates any box already printed.

**Send the SVG to the printer.** The PDF is a proof: it uses Helvetica with no
embedded font, so its footer reads `Rs.` rather than `₹` — U+20B9 is not in
WinAnsi and faking it would print a wrong glyph.

## boxes.js — box IDs and QR labels

```
npm install qrcode                       # build-time only, see below
node tools/boxes.js --n 500
node tools/boxes.js --from 501 --n 250   # a later run continues the numbering
node tools/boxes.js --base https://pocketseeds.online --out dist/run1
```

Writes one QR SVG per box, a labels sheet laid out for guillotining, and a CSV
of the run.

It uses the `qrcode` package rather than a hand-rolled encoder, and refuses to
run without it. A QR encoder is a day's work and there is no scanner in the
build environment to prove the output scans — a subtly wrong encoder is the
kind of mistake you find after five hundred boxes are printed.
