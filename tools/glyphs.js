/* =====================================================================
   A monoline vector alphabet, so nothing that goes to a printer carries a
   font reference.

   Why this exists rather than <text font-family="Helvetica">: a printer
   without the font substitutes one, and a substituted glyph for U+20B9 (₹)
   prints the wrong character onto wood. The run is then scrap. Outlining
   removes the question entirely — the file describes shapes, not names of
   fonts someone else has to own.

   Each glyph is drawn on a 0..70 em box with the baseline at y=70, cap top
   at y=4 and x-height top at y=26; `w` is the advance. They are stroked, not
   filled: monoline is what engraving and screen printing want, and it stays
   legible at the small footer size.

   Only the characters this project prints are here. text() throws on
   anything else rather than dropping it silently — a missing glyph in a
   print file is worse than a failed build.
   ===================================================================== */
'use strict';

const G = {
  '0': { w:50, d:'M12 18 Q12 4 25 4 Q38 4 38 18 L38 52 Q38 66 25 66 Q12 66 12 52 Z' },
  '1': { w:50, d:'M15 16 L25 7 L25 66 M15 66 L35 66' },
  '2': { w:50, d:'M12 18 Q12 4 25 4 Q38 4 38 18 Q38 29 12 66 L39 66' },
  '3': { w:50, d:'M13 11 Q19 4 27 4 Q38 4 38 17 Q38 28 26 28 Q38 28 38 45 Q38 66 26 66 Q15 66 12 57' },
  '4': { w:50, d:'M32 66 L32 4 L10 47 L41 47' },
  '5': { w:50, d:'M37 4 L16 4 L13 31 Q20 26 27 26 Q39 27 39 46 Q39 66 26 66 Q15 66 12 57' },
  '6': { w:50, d:'M36 7 Q30 4 25 4 Q12 5 12 30 L12 48 Q12 66 25 66 Q38 66 38 48 Q38 32 25 32 Q14 32 12 43' },
  '7': { w:50, d:'M11 4 L39 4 L21 66' },
  '8': { w:50, d:'M25 4 Q13 4 13 16 Q13 28 25 28 Q37 28 37 16 Q37 4 25 4 Z M25 28 Q11 28 11 47 Q11 66 25 66 Q39 66 39 47 Q39 28 25 28 Z' },
  '9': { w:50, d:'M15 63 Q21 66 25 66 Q38 65 38 40 L38 22 Q38 4 25 4 Q12 4 12 22 Q12 38 25 38 Q36 38 38 27' },
  ',': { w:26, d:'M14 60 L14 65 Q14 73 8 77' },
  '.': { w:26, d:'M13 64 L13 66' },
  '+': { w:50, d:'M25 23 L25 49 M12 36 L38 36' },
  ' ': { w:22, d:'' },

  'A': { w:52, d:'M7 66 L26 4 L45 66 M14 47 L38 47' },
  'B': { w:52, d:'M13 4 L13 66 M13 4 L29 4 Q40 4 40 17 Q40 30 29 30 L13 30 M13 30 L31 30 Q42 30 42 48 Q42 66 31 66 L13 66' },
  'D': { w:52, d:'M13 4 L13 66 L28 66 Q42 66 42 35 Q42 4 28 4 Z' },
  'E': { w:48, d:'M39 4 L13 4 L13 66 L39 66 M13 34 L34 34' },
  'I': { w:26, d:'M13 4 L13 66' },
  'L': { w:46, d:'M13 4 L13 66 L40 66' },
  'O': { w:54, d:'M27 4 Q12 4 12 26 L12 44 Q12 66 27 66 Q42 66 42 44 L42 26 Q42 4 27 4 Z' },
  'Q': { w:54, d:'M27 4 Q12 4 12 26 L12 44 Q12 66 27 66 Q42 66 42 44 L42 26 Q42 4 27 4 Z M31 54 L44 72' },
  'R': { w:52, d:'M13 66 L13 4 L29 4 Q41 4 41 19 Q41 34 29 34 L13 34 M28 34 L43 66' },
  'S': { w:50, d:'M38 12 Q32 4 24 4 Q12 4 12 18 Q12 30 25 33 Q39 36 39 50 Q39 66 25 66 Q15 66 11 57' },
  'X': { w:50, d:'M11 4 L39 66 M39 4 L11 66' },
  'T': { w:50, d:'M11 4 L39 4 M25 4 L25 66' },

  'a': { w:48, d:'M36 26 L36 70 M36 40 Q36 26 24 26 Q12 26 12 48 Q12 70 24 70 Q36 70 36 56' },
  'c': { w:46, d:'M37 34 Q31 26 23 26 Q11 26 11 48 Q11 70 23 70 Q31 70 37 62' },
  'e': { w:48, d:'M11 46 L36 46 Q36 26 23 26 Q11 26 11 48 Q11 70 23 70 Q31 70 36 63' },
  'g': { w:48, d:'M36 26 L36 76 Q36 90 22 90 Q12 90 8 84 M36 40 Q36 26 24 26 Q12 26 12 46 Q12 66 24 66 Q36 66 36 52' },
  'i': { w:24, d:'M12 34 L12 70 M12 22 L12 25' },
  'l': { w:24, d:'M12 4 L12 70' },
  'm': { w:66, d:'M11 70 L11 26 M11 38 Q11 26 21 26 Q31 26 31 38 L31 70 M31 38 Q31 26 41 26 Q53 26 53 38 L53 70' },
  'n': { w:48, d:'M12 70 L12 26 M12 38 Q12 26 24 26 Q36 26 36 40 L36 70' },
  'o': { w:50, d:'M25 26 Q12 26 12 48 Q12 70 25 70 Q38 70 38 48 Q38 26 25 26 Z' },
  's': { w:44, d:'M34 32 Q29 26 22 26 Q12 26 12 36 Q12 44 23 46 Q34 48 34 58 Q34 70 22 70 Q13 70 9 63' },
  't': { w:36, d:'M17 10 L17 58 Q17 70 29 70 Q33 70 36 68 M8 26 L30 26' },
  'u': { w:48, d:'M12 26 L12 56 Q12 70 24 70 Q36 70 36 56 L36 26 M36 26 L36 70' },
  'v': { w:46, d:'M10 26 L23 70 L36 26' },
  'k': { w:44, d:'M12 4 L12 70 M35 30 L14 52 M21 45 L37 70' },
  'r': { w:36, d:'M12 70 L12 26 M12 40 Q14 26 28 26 Q33 26 35 28' },

  /* ₹ — two bars, the bowl, and the leg. Drawn rather than named, which is
     the whole point of this file. */
  '₹': { w:54, d:'M12 10 L44 10 M12 24 L44 24 M18 24 Q32 26 30 34 Q28 41 15 41 M21 41 L44 66' }
};

function glyph(ch){
  const g = G[ch];
  if(!g) throw new Error('no outline for "' + ch + '" (U+' +
    ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') +
    ') — add it to tools/glyphs.js rather than shipping a font reference');
  return g;
}

/* width of a string at a given cap-height size, in the same units */
function width(str, size){
  const k = size / 70;
  return [...str].reduce((n, ch) => n + glyph(ch).w, 0) * k;
}

/* Returns a single <path> per character, translated and scaled into place.
   `size` is the cap height. Stroke width scales with it so the weight stays
   even across the footer and the cell numbers. */
function text(str, x, y, size, opts){
  const o = opts || {};
  const k = size / 70;
  const sw = (o.weight || 0.11) * size;
  let cx = x;
  if(o.anchor === 'middle') cx = x - width(str, size) / 2;
  if(o.anchor === 'end')    cx = x - width(str, size);
  const out = [];
  [...str].forEach(ch => {
    const g = glyph(ch);
    if(g.d) out.push(
      `<path d="${g.d}" transform="translate(${cx.toFixed(2)} ${(y - size).toFixed(2)}) scale(${k.toFixed(5)})" ` +
      `fill="none" stroke="${o.stroke || '#000'}" stroke-width="${(sw / k).toFixed(2)}" ` +
      `stroke-linecap="round" stroke-linejoin="round"/>`);
    cx += g.w * k;
  });
  return out.join('');
}

module.exports = { text, width, glyph, GLYPHS: G };
