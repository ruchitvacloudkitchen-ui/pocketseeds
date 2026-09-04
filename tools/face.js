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
const OUT = require('./glyphs.js');     // vector letterforms, so no font is named

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
/* PAD/GAP/FOOT are the face's furniture, and --cell needs them to work out
   how big the face has to be, so they are declared before OPT. */
const PAD = 8, GAP = 1.4, FOOT = 26;
const OPT = {
  wmm:  Number(arg('w', 0)),
  hmm:  Number(arg('h', 0)),
  /* --cell drives the face from the cell size, which is the way round you
     usually want it: pick a cell you can write a tick in, get the face. */
  cell: Number(arg('cell', 0)),
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
const QRW = 30, QRH = 22;                        // mm reserved for the QR label
const rowsN = cfg.rows.length;
let cell, faceW, faceH;
if(OPT.cell > 0){
  cell  = OPT.cell;
  faceW = cell * cols  + GAP * (cols  - 1) + PAD * 2;
  faceH = cell * rowsN + GAP * (rowsN - 1) + PAD * 2 + FOOT;
}else{
  faceW = OPT.wmm > 0 ? OPT.wmm : 236.6;         // 13.4mm cells on a 15x15 face
  faceH = OPT.hmm > 0 ? OPT.hmm : 262.6;
  const cw = (faceW - PAD * 2 - GAP * (cols - 1)) / cols;
  const ch = (faceH - PAD * 2 - FOOT - GAP * (rowsN - 1)) / rowsN;
  cell = Math.min(cw, ch);                       // square cells
}
OPT.wmm = faceW; OPT.hmm = faceH;
const usedW = cell * cols + GAP * (cols - 1);
const usedH = cell * rowsN + GAP * (rowsN - 1);
const x0 = (faceW - usedW) / 2;
const y0 = PAD;

const INK = '#C9A227', WOOD = '#3E2412', LINE = 'rgba(201,162,39,.55)';

/* ---------- SVG ----------
   Two files. box-face.svg is what goes to the printer: every glyph is a
   path, so there is not one font name in it — a substituted font would set
   the wrong character for U+20B9 onto wood, and the run would be scrap.
   box-face-proof.svg is the same drawing with live text, which is easier to
   read on screen and to copy-edit from. Never send the proof to print.  */
function drawFace(outlined){
  const px = n => +(n * MM).toFixed(2);
  const cap = cell * 0.30;                       // cap height of the cell numbers
  let out = '';
  out += `<svg xmlns="http://www.w3.org/2000/svg" width="${px(OPT.wmm)}" height="${px(OPT.hmm)}" `
       + `viewBox="0 0 ${px(OPT.wmm)} ${px(OPT.hmm)}">\n`;
  out += `<rect width="100%" height="100%" fill="${WOOD}"/>\n`;

  grid.forEach((row, r) => {
    row.forEach((amt, c) => {
      const x = px(x0 + c * (cell + GAP)), y = px(y0 + r * (cell + GAP));
      const s2 = px(cell);
      out += `<rect x="${x}" y="${y}" width="${s2}" height="${s2}" fill="none" `
           + `stroke="${LINE}" stroke-width="${px(0.25)}" rx="${px(1)}"/>`;
      const cxp = x + s2 / 2, byp = y + s2 / 2 + px(cap) / 2;
      out += outlined
        ? OUT.text(String(amt), cxp, byp, px(cap), { anchor:'middle', stroke:INK, weight:0.13 })
        : `<text x="${cxp.toFixed(2)}" y="${byp.toFixed(2)}" text-anchor="middle" `
          + `font-family="Helvetica,Arial,sans-serif" font-weight="700" `
          + `font-size="${px(cap * 1.35)}" fill="${INK}">${amt}</text>`;
      out += '\n';
    });
  });

  const fy = y0 + usedH + 9;
  const goalCap = 7, subCap = 3.2;
  if(outlined){
    out += OUT.text('₹ 1,00,000', px(x0), px(fy + 8), px(goalCap), { stroke:INK, weight:0.12 }) + '\n';
    out += OUT.text('Small Amounts Become Big Savings', px(x0), px(fy + 15), px(subCap),
                    { stroke:INK, weight:0.10 }) + '\n';
  }else{
    out += `<text x="${px(x0)}" y="${px(fy + 8)}" font-family="Helvetica,Arial,sans-serif" `
         + `font-weight="700" font-size="${px(goalCap * 1.35)}" fill="${INK}">₹ 1,00,000</text>\n`;
    out += `<text x="${px(x0)}" y="${px(fy + 15)}" font-family="Helvetica,Arial,sans-serif" `
         + `font-size="${px(subCap * 1.35)}" fill="${INK}">Small Amounts Become Big Savings</text>\n`;
  }

  /* the space the QR label and the box ID are stuck into afterwards */
  const qx = x0 + usedW - QRW, qy = fy - 1;
  out += `<rect x="${px(qx)}" y="${px(qy)}" width="${px(QRW)}" height="${px(QRH)}" `
       + `fill="none" stroke="${LINE}" stroke-width="${px(0.3)}" `
       + `stroke-dasharray="${px(1.5)} ${px(1.5)}" rx="${px(1.5)}"/>\n`;
  const label = 'QR LABEL + BOX ID';
  out += outlined
    ? OUT.text(label, px(qx + QRW / 2), px(qy + QRH / 2), px(2.4),
               { anchor:'middle', stroke:INK, weight:0.11 })
    : `<text x="${px(qx + QRW / 2)}" y="${px(qy + QRH / 2)}" text-anchor="middle" `
      + `font-family="Helvetica,Arial,sans-serif" font-size="${px(3.2)}" fill="${INK}">${label}</text>`;
  out += `\n</svg>\n`;
  return out;
}

/* ---------- PDF ----------
   A proof, not a print file, and named box-face-proof.pdf so it cannot be
   picked up by mistake. It references Helvetica rather than embedding
   anything, which is exactly the risk the SVG was outlined to remove — and
   why its footer reads "Rs." : U+20B9 is not in WinAnsi and faking it would
   set a wrong glyph. Send box-face.svg to the printer. */
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
fs.writeFileSync(path.join(dir, 'box-face.svg'), drawFace(true));
fs.writeFileSync(path.join(dir, 'box-face-proof.svg'), drawFace(false));
fs.writeFileSync(path.join(dir, 'box-face-proof.pdf'), pdf(), 'binary');
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
console.log(`  written to ${OPT.out}/box-face.svg  (outlined — this is the print file)`);
console.log(`             ${OPT.out}/box-face-proof.svg  (live text — screen only)`);
console.log(`             ${OPT.out}/box-face-proof.pdf  (names Helvetica — screen only)`);
console.log(`             ${OPT.out}/box-face.json`);
/* proving it, rather than saying it */
const printed = fs.readFileSync(path.join(dir, 'box-face.svg'), 'utf8');
const nText = (printed.match(/<text/g) || []).length;
const nFont = (printed.match(/font-family/g) || []).length;
console.log(`  print file: ${nText} <text> elements, ${nFont} font-family attributes`);
if(nText || nFont){
  console.error('\n  A font reference reached the print file. Refusing to call that done.\n');
  process.exit(2);
}
console.log('');
if(Number(aspect) > 2)
  console.log(`  NOTE: this face is ${aspect}:1 — a tall ribbon, not a cube face.\n` +
              `        ${cols} columns x ${cfg.rows.length} rows cannot be square. If it has to sit on a\n` +
              `        cube, the column count is the thing to change, in box/index.html.\n`);
