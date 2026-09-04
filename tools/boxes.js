#!/usr/bin/env node
/* =====================================================================
   Box IDs and their QR labels for a print run.

   Emits BOX0001..BOXnnnn, each with a QR pointing at the tracker, plus a
   labels sheet laid out for guillotining and a CSV to check the run against.

   Usage:
     node tools/boxes.js --n 500
     node tools/boxes.js --from 501 --n 250        # a second run continues
     node tools/boxes.js --base https://pocketseeds.online --out dist/run1

   ON THE QR CODES, PLAINLY: this script does not hand-roll a QR encoder.
   Writing one is a day's work and I have no scanner here to prove the output
   scans — and a subtly wrong encoder is the kind of mistake you find after
   five hundred boxes are printed. So it uses the `qrcode` package, which is
   battle-tested, and refuses to run without it rather than guessing:

     npm install qrcode

   That is a build-time dependency on your machine only. The app itself still
   ships with none.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

let QR;
try{ QR = require('qrcode'); }
catch(e){
  console.error('\nThis needs the qrcode package to make codes that actually scan.\n');
  console.error('  npm install qrcode\n');
  console.error('It is only used here, at build time. The app has no dependencies.\n');
  process.exit(1);
}

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : argv[i + 1]; };
const OPT = {
  from: Number(arg('from', 1)),
  n:    Number(arg('n', 100)),
  pad:  Number(arg('pad', 4)),
  base: arg('base', 'https://pocketseeds.online'),
  out:  arg('out', 'dist/boxes'),
  /* label geometry in mm — a sheet of these gets guillotined apart */
  labelW: Number(arg('labelw', 30)),
  labelH: Number(arg('labelh', 22)),
  cols:   Number(arg('cols', 6)),
  dpi:    Number(arg('dpi', 300))
};
if(!(OPT.n > 0) || !(OPT.from > 0)){ console.error('--n and --from must be positive'); process.exit(1); }

const id = i => 'BOX' + String(i).padStart(OPT.pad, '0');
const url = i => `${OPT.base}/box/?id=${id(i)}`;
const ids = Array.from({ length: OPT.n }, (_, k) => OPT.from + k);

const dir = path.join(__dirname, '..', OPT.out);
fs.mkdirSync(path.join(dir, 'qr'), { recursive: true });

(async () => {
  /* one SVG per box, so a label can be placed on its own, and one sheet of
     them for a batch run */
  const svgs = {};
  for(const i of ids){
    /* M is the right level for a label that will live on a wooden box: it
       still reads with a quarter of the code scuffed. */
    const s = await QR.toString(url(i), { type:'svg', errorCorrectionLevel:'M', margin:1 });
    svgs[i] = s;
    fs.writeFileSync(path.join(dir, 'qr', id(i) + '.svg'), s);
  }

  const MM = OPT.dpi / 25.4;
  const px = n => +(n * MM).toFixed(2);
  const rows = Math.ceil(ids.length / OPT.cols);
  const sheetW = OPT.cols * OPT.labelW, sheetH = rows * OPT.labelH;
  let sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${px(sheetW)}" height="${px(sheetH)}" `
            + `viewBox="0 0 ${px(sheetW)} ${px(sheetH)}"><rect width="100%" height="100%" fill="#fff"/>`;
  ids.forEach((i, k) => {
    const c = k % OPT.cols, r = Math.floor(k / OPT.cols);
    const x = px(c * OPT.labelW), y = px(r * OPT.labelH);
    const qs = px(OPT.labelH - 8);
    /* the qrcode svg comes with its own viewBox; nest it so it scales */
    const inner = svgs[i].replace(/^<\?xml[^>]*>\s*/, '')
                         .replace('<svg ', `<svg x="${(x + px(1.5)).toFixed(2)}" y="${(y + px(1.5)).toFixed(2)}" width="${qs}" height="${qs}" `);
    sheet += `<g><rect x="${x}" y="${y}" width="${px(OPT.labelW)}" height="${px(OPT.labelH)}" `
           + `fill="none" stroke="#ccc" stroke-width="${px(0.2)}"/>${inner}`
           + `<text x="${(x + px(1.5) + qs + px(2)).toFixed(2)}" y="${(y + px(9)).toFixed(2)}" `
           + `font-family="Helvetica,Arial,sans-serif" font-size="${px(2.4)}" fill="#333">Scan to Track</text>`
           + `<text x="${(x + px(1.5) + qs + px(2)).toFixed(2)}" y="${(y + px(14)).toFixed(2)}" `
           + `font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="${px(3.2)}" fill="#111">${id(i)}</text>`
           + `</g>`;
  });
  sheet += '</svg>\n';
  fs.writeFileSync(path.join(dir, 'labels-sheet.svg'), sheet);

  fs.writeFileSync(path.join(dir, 'boxes.csv'),
    'box_id,url\n' + ids.map(i => `${id(i)},${url(i)}`).join('\n') + '\n');

  console.log(`\n${ids.length} boxes: ${id(ids[0])} .. ${id(ids[ids.length - 1])}`);
  console.log(`  ${OPT.base}/box/?id=${id(ids[0])}`);
  console.log(`  qr/            one SVG per box`);
  console.log(`  labels-sheet.svg  ${OPT.cols} across x ${rows} down, ${OPT.labelW}x${OPT.labelH}mm each`);
  console.log(`  boxes.csv      the run, to check against\n`);
  console.log(`  Next run starts at --from ${ids[ids.length - 1] + 1}\n`);
})();
