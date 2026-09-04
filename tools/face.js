#!/usr/bin/env node
/* =====================================================================
   Print the box face from the app's own config.

   The whole mechanic is that a printed cell and its tile in the app are the
   same cell. So this does not have its own copy of the layout — it reads
   MB_CELLS and MB_FACE_ROWS out of box/index.html. Change the config there
   and both the app and the print follow; there is no second place to edit,
   and no way for them to drift.

   Usage:
     node tools/face.js                       # defaults below
     node tools/face.js --w 120 --h 560       # face size in mm
     node tools/face.js --dpi 600 --out dist

   Output (into dist/ by default):
     box-face.svg   vector, for the printer
     box-face.pdf   the same drawing as a PDF proof
     box-face.json  the cell order, so a label run can be checked against it

   It exits non-zero and says why if the config does not add up to the goal
   or does not fit the declared rows.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------- read the config out of the app, rather than restating it ---- */
const APP = path.join(__dirname, '..', 'box', 'index.html');
function readConfig(){
  const src = fs.readFileSync(APP, 'utf8');
  const grab = name => {
    const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*([\\s\\S]*?);\\s*(?://|\\n)'));
    if(!m) throw new Error('could not find ' + name + ' in ' + APP);
    return m[1];
  };
  /* the three declarations are plain literals; evaluating them in a bare
     Function keeps this honest without pulling in a parser */
  const src2 = 'return [' + grab('MB_GOAL') + ',' + grab('MB_CELLS') + ',' + grab('MB_FACE_ROWS') + '];';
  const [goal, cells, rows] = Function(src2)();
  return { goal, cells, rows };
}

/* ---------- deterministic shuffle ----------
   A fixed seed, so the face looks mixed rather than blocked into a slab of
   500s followed by a slab of 200s — and so re-running this produces the
   identical layout every time. Change SEED only if you want a different
   face, and know that it invalidates any box already printed. */
const SEED = 20260904;
function rng(seed){
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffled(list, seed){
  const out = list.slice(), rand = rng(seed);
  for(let i = out.length - 1; i > 0; i--){
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ---------- args ---------- */
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? dflt : argv[i + 1];
};
const OPT = {
  /* A 7 x 35 face is a tall ribbon, not a square — see the note this script
     prints. These defaults keep a 14mm cell, which is a comfortable size to
     write a tick in and to find with a finger. Override with --w/--h. */
  wmm:  Number(arg('w', 118)),
  hmm:  Number(arg('h', 566)),
  dpi:  Number(arg('dpi', 300)),
  out:  arg('out', 'dist'),
  seed: Number(arg('seed', SEED))
};

/* ---------- validate, loudly ---------- */
const cfg = readConfig();
const planned = cfg.cells.reduce((n, g) => n + g.amount * g.count, 0);
const count   = cfg.cells.reduce((n, g) => n + g.count, 0);
const rowed   = cfg.rows.reduce((n, c) => n + c, 0);
const cols    = Math.max(...cfg.rows);
const faults  = [];
if(planned !== cfg.goal)
  faults.push(`the cells add up to ${planned}, not the goal of ${cfg.goal}`);
if(rowed !== count)
  faults.push(`MB_FACE_ROWS accounts for ${rowed} cells, but MB_CELLS declares ${count}`);
if(faults.length){
  console.error('\nWill not print a face that disagrees with the app:\n');
  faults.forEach(f => console.error('  • ' + f));
  console.error('\nFix the config in box/index.html and run this again.\n');
  process.exit(1);
}

/* ---------- the cell order ---------- */
const flat = [];
cfg.cells.forEach(g => { for(let i = 0; i < g.count; i++) flat.push(g.amount); });
const order = shuffled(flat, OPT.seed);
const grid = [];
let k = 0;
cfg.rows.forEach(n => { grid.push(order.slice(k, k + n)); k += n; });

/* ---------- geometry, in mm, then scaled ---------- */
const MM = OPT.dpi / 25.4;                       // px per mm at the chosen dpi
const PAD = 8;                                   // mm margin inside the face
const FOOT = 26;                                 // mm reserved for the footer band
const QRW = 30, QRH = 22;                        // mm reserved for the QR label
const gridW = OPT.wmm - PAD * 2;
const gridH = OPT.hmm - PAD * 2 - FOOT;
const GAP = 1.4;                                 // mm between cells
const cw = (gridW - GAP * (cols - 1)) / cols;
const ch = (gridH - GAP * (cfg.rows.length - 1)) / cfg.rows.length;
const cell = Math.min(cw, ch);                   // square cells
const usedW = cell * cols + GAP * (cols - 1);
const usedH = cell * cfg.rows.length + GAP * (cfg.rows.length - 1);
const x0 = (OPT.wmm - usedW) / 2;
const y0 = PAD;

const INK = '#C9A227', WOOD = '#3E2412', LINE = 'rgba(201,162,39,.55)';

/* ---------- SVG ---------- */
function svg(){
  const px = n => +(n * MM).toFixed(2);
  const fs = +(cell * 0.34).toFixed(2);
  let out = '';
  out += `<svg xmlns="http://www.w3.org/2000/svg" width="${px(OPT.wmm)}" height="${px(OPT.hmm)}" `
       + `viewBox="0 0 ${px(OPT.wmm)} ${px(OPT.hmm)}">\n`;
  out += `<rect width="100%" height="100%" fill="${WOOD}"/>\n`;
  out += `<g font-family="Helvetica,Arial,sans-serif" font-weight="700" text-anchor="middle" fill="${INK}">\n`;
  grid.forEach((row, r) => {
    row.forEach((amt, c) => {
      const x = px(x0 + c * (cell + GAP)), y = px(y0 + r * (cell + GAP));
      const s = px(cell);
      out += `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="none" `
           + `stroke="${LINE}" stroke-width="${px(0.25)}" rx="${px(1)}"/>`;
      out += `<text x="${(x + s / 2).toFixed(2)}" y="${(y + s / 2 + px(fs) * 0.35).toFixed(2)}" `
           + `font-size="${px(fs)}">${amt}</text>\n`;
    });
  });
  out += `</g>\n`;
  /* footer: the goal, the line, and the reserved QR label */
  const fy = y0 + usedH + 9;
  out += `<g font-family="Helvetica,Arial,sans-serif" fill="${INK}">\n`;
  out += `<text x="${px(x0)}" y="${px(fy + 7)}" font-size="${px(8)}" font-weight="700">`
       + `₹ 1,00,000</text>\n`;
  out += `<text x="${px(x0)}" y="${px(fy + 13.5)}" font-size="${px(3.6)}">`
       + `Small Amounts Become Big Savings</text>\n`;
  out += `</g>\n`;
  const qx = x0 + usedW - QRW, qy = fy - 1;
  out += `<rect x="${px(qx)}" y="${px(qy)}" width="${px(QRW)}" height="${px(QRH)}" `
       + `fill="none" stroke="${LINE}" stroke-width="${px(0.3)}" stroke-dasharray="${px(1.5)} ${px(1.5)}" rx="${px(1.5)}"/>\n`;
  out += `<text x="${px(qx + QRW / 2)}" y="${px(qy + QRH / 2)}" text-anchor="middle" `
       + `font-family="Helvetica,Arial,sans-serif" font-size="${px(2.6)}" fill="${INK}">QR LABEL</text>\n`;
  out += `<text x="${px(qx + QRW / 2)}" y="${px(qy + QRH / 2 + 4)}" text-anchor="middle" `
       + `font-family="Helvetica,Arial,sans-serif" font-size="${px(2.6)}" fill="${INK}">+ BOX ID</text>\n`;
  out += `</svg>\n`;
  return out;
}

/* ---------- PDF ----------
   Written by hand because this script takes no dependencies. Helvetica is one
   of the base-14 fonts every reader has, so nothing is embedded — which is
   also why the footer says "Rs." rather than the rupee sign: U+20B9 is not in
   WinAnsi, and faking it would print a wrong glyph. Send the SVG to the
   printer; this is the proof. */
function pdf(){
  const pt = n => +(n * 72 / 25.4).toFixed(2);      // mm -> points
  const W = pt(OPT.wmm), H = pt(OPT.hmm);
  const up = y => (H - pt(y)).toFixed(2);           // PDF origin is bottom-left
  const hex = h => {
    const n = parseInt(h.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
      .map(v => v.toFixed(3)).join(' ');
  };
  let c = '';
  c += `${hex(WOOD)} rg 0 0 ${W} ${H} re f\n`;
  c += `${hex(INK)} RG ${hex(INK)} rg 0.6 w\n`;
  const fs = cell * 0.34;
  grid.forEach((row, r) => {
    row.forEach((amt, cIdx) => {
      const x = pt(x0 + cIdx * (cell + GAP)), y = up(y0 + r * (cell + GAP) + cell);
      const s = pt(cell);
      c += `${x} ${y} ${s} ${s} re S\n`;
      const label = String(amt);
      const wApprox = label.length * pt(fs) * 0.56;
      c += `BT /F1 ${pt(fs).toFixed(2)} Tf `
         + `${(x + s / 2 - wApprox / 2).toFixed(2)} ${(y + s / 2 - pt(fs) * 0.35).toFixed(2)} Td `
         + `(${label}) Tj ET\n`;
    });
  });
  const fy = y0 + usedH + 9;
  c += `BT /F1 ${pt(8).toFixed(2)} Tf ${pt(x0)} ${up(fy + 7)} Td (Rs. 1,00,000) Tj ET\n`;
  c += `BT /F1 ${pt(3.6).toFixed(2)} Tf ${pt(x0)} ${up(fy + 13.5)} Td (Small Amounts Become Big Savings) Tj ET\n`;
  const qx = x0 + usedW - QRW, qy = fy - 1;
  c += `[3 3] 0 d ${pt(qx)} ${up(qy + QRH)} ${pt(QRW)} ${pt(QRH)} re S [] 0 d\n`;
  c += `BT /F1 ${pt(2.6).toFixed(2)} Tf ${pt(qx + 8)} ${up(qy + QRH / 2)} Td (QR LABEL + BOX ID) Tj ET\n`;

  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(c)} >>\nstream\n${c}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  ];
  let out = '%PDF-1.4\n';
  const xref = [];
  objs.forEach((o, i) => { xref.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const start = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
       + xref.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('')
       + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return out;
}

/* ---------- write ---------- */
const dir = path.join(__dirname, '..', OPT.out);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'box-face.svg'), svg());
fs.writeFileSync(path.join(dir, 'box-face.pdf'), pdf(), 'binary');
fs.writeFileSync(path.join(dir, 'box-face.json'), JSON.stringify({
  goal: cfg.goal, cells: cfg.cells, rows: cfg.rows, seed: OPT.seed,
  cols, rowCount: cfg.rows.length, total: count,
  faceMm: { w: OPT.wmm, h: OPT.hmm }, cellMm: +cell.toFixed(2), dpi: OPT.dpi,
  order: grid
}, null, 2));

const aspect = (OPT.hmm / OPT.wmm).toFixed(2);
console.log(`\nBox face generated from box/index.html\n`);
console.log(`  ${cols} columns x ${cfg.rows.length} rows = ${count} cells, ` +
            `${cfg.cells.map(g => g.count + ' x Rs' + g.amount).join(' + ')} = Rs${planned.toLocaleString('en-IN')}`);
console.log(`  face ${OPT.wmm} x ${OPT.hmm} mm at ${OPT.dpi} dpi ` +
            `(${Math.round(OPT.wmm * MM)} x ${Math.round(OPT.hmm * MM)} px), cell ${cell.toFixed(1)} mm`);
console.log(`  seed ${OPT.seed} — re-running gives the identical layout`);
console.log(`  written to ${OPT.out}/box-face.{svg,pdf,json}\n`);
if(Number(aspect) > 2)
  console.log(`  NOTE: this face is ${aspect}:1 — a tall ribbon, not a cube face.\n` +
              `        ${cols} columns x ${cfg.rows.length} rows cannot be square. If it has to sit on a\n` +
              `        cube, the column count is the thing to change, in box/index.html.\n`);
