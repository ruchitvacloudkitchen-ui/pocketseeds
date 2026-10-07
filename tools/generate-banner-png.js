const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 260" width="1000" height="260">
  <defs>
    <style>
      .txt-brand { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; font-style: italic; font-weight: 900; fill: #16A34A; }
      .txt-sub { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; font-style: italic; font-weight: 600; fill: #6E3F10; }
      .txt-te { font-family: 'Noto Sans Telugu', system-ui, sans-serif; font-weight: 700; fill: #6E3F10; }
      .txt-num { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; font-weight: 900; fill: #5A3311; }
      .txt-logo { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; font-weight: 800; fill: #6E3F10; letter-spacing: 2.5px; }
    </style>
    <filter id="shadow" x="-5%" y="-10%" width="110%" height="125%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.08"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1000" height="260" fill="#FAF7F2" />

  <!-- LEFT: LOGO -->
  <g transform="translate(142, 126)">
    <!-- Outer dashed and solid rings -->
    <circle cx="0" cy="-6" r="78" fill="none" stroke="#8C5824" stroke-width="1.8" stroke-dasharray="3,3" opacity="0.75"/>
    <circle cx="0" cy="-6" r="84" fill="none" stroke="#8C5824" stroke-width="1.2" opacity="0.4"/>
    
    <!-- Laurel grain leaves around circle -->
    <path d="M -72 6 C -80 -14 -76 -35 -62 -51 C -58 -46 -60 -30 -68 1 Z" fill="#8C5824" opacity="0.6"/>
    <path d="M 72 6 C 80 -14 76 -35 62 -51 C 58 -46 60 -30 68 1 Z" fill="#8C5824" opacity="0.6"/>
    <path d="M -80 -6 C -88 -8 -90 -20 -84 -24 C -82 -18 -78 -14 -80 -6 Z" fill="#8C5824" opacity="0.65"/>
    <path d="M 80 -6 C 88 -8 90 -20 84 -24 C 82 -18 78 -14 80 -6 Z" fill="#8C5824" opacity="0.65"/>
    <path d="M -46 70 C -30 78 -15 82 0 82 C 15 82 30 78 46 70" fill="none" stroke="#8C5824" stroke-width="1.6" stroke-dasharray="2,3" opacity="0.6"/>
    
    <!-- Top curved text -->
    <path id="topArch" d="M -62 -26 A 65 65 0 0 1 62 -26" fill="none"/>
    <text font-family="'Plus Jakarta Sans', sans-serif" font-size="9" font-weight="800" fill="#7A481C" letter-spacing="1.2">
      <textPath href="#topArch" startOffset="50%" text-anchor="middle">★ TASTE OF TRADITIONAL MILLETS ★</textPath>
    </text>

    <!-- Woman portrait illustration background circle -->
    <circle cx="0" cy="-3" r="55" fill="#F4E9D8" stroke="#D1B898" stroke-width="1.5"/>

    <!-- Woman Portrait Graphic -->
    <g transform="translate(0, 10)">
      <!-- Shoulders & Saree -->
      <path d="M -42 28 C -36 8 -22 2 -4 6 C 14 2 30 8 42 28 Z" fill="#994D3A"/>
      <path d="M -30 28 C -22 14 -12 10 2 12 C 14 10 24 14 32 28" fill="none" stroke="#DCAE76" stroke-width="2"/>
      <path d="M -38 28 C -30 18 -15 15 -2 22 L -10 28 Z" fill="#803825"/>
      <!-- Saree zari border lines -->
      <path d="M -26 28 C -18 17 -10 16 0 24" fill="none" stroke="#ECC480" stroke-width="1.8"/>

      <!-- Neck & Face -->
      <path d="M -10 10 L -10 0 C -10 -4 -8 -6 0 -6 C 8 -6 10 -4 10 0 L 10 10 Z" fill="#D79F78"/>
      <path d="M -8 11 C -4 14 4 14 8 11" fill="none" stroke="#BA7B54" stroke-width="1.2"/>
      <!-- Necklace -->
      <path d="M -12 6 C -6 11 6 11 12 6" fill="none" stroke="#ECC480" stroke-width="1.5" stroke-dasharray="1.5,1.5"/>

      <!-- Head & Jaw -->
      <path d="M -19 -16 C -19 -4 -13 8 0 8 C 13 8 19 -4 19 -16 C 19 -28 14 -34 0 -34 C -14 -34 -19 -28 -19 -16 Z" fill="#E8B58F"/>

      <!-- Hair bun -->
      <ellipse cx="-20" cy="-14" rx="8" ry="11" fill="#1C1815"/>
      <ellipse cx="-22" cy="-14" rx="3" ry="5" fill="#C93B2B" opacity="0.8"/>

      <!-- Main hair -->
      <path d="M -19 -16 C -18 -32 -10 -38 0 -38 C 10 -38 18 -32 19 -16 C 18 -26 12 -33 0 -33 C -12 -33 -18 -26 -19 -16 Z" fill="#1C1815"/>
      <path d="M -19 -18 C -14 -22 -6 -24 0 -22 C 6 -24 14 -22 19 -18 C 14 -28 6 -32 0 -32 C -6 -32 -14 -28 -19 -18 Z" fill="#1C1815"/>

      <!-- Ears & Earrings -->
      <circle cx="-19" cy="-11" r="3.2" fill="#E8B58F"/>
      <circle cx="19" cy="-11" r="3.2" fill="#E8B58F"/>
      <circle cx="-19" cy="-7" r="2.2" fill="#ECC480"/>
      <circle cx="19" cy="-7" r="2.2" fill="#ECC480"/>

      <!-- Eyes & Eyebrows -->
      <path d="M -14 -18 C -11 -21 -7 -21 -4 -18" fill="none" stroke="#2B1A10" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M 4 -18 C 7 -21 11 -21 14 -18" fill="none" stroke="#2B1A10" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M -13 -15 C -10 -17 -7 -17 -4 -15 C -7 -14 -10 -14 -13 -15 Z" fill="#2B1A10"/>
      <path d="M 4 -15 C 7 -17 10 -17 13 -15 C 10 -14 7 -14 4 -15 Z" fill="#2B1A10"/>

      <!-- Red Bindi -->
      <circle cx="0" cy="-17.5" r="2" fill="#B91C1C"/>

      <!-- Nose -->
      <path d="M -1 -15 L 0 -8 L 2 -8" fill="none" stroke="#C4845C" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>

      <!-- Lips / Gentle smile -->
      <path d="M -6 -3 C -3 -5 3 -5 6 -3 C 3 -1 -3 -1 -6 -3 Z" fill="#A83A2D"/>
    </g>

    <!-- Brand Name RUCHITVA below circle -->
    <text x="0" y="80" text-anchor="middle" class="txt-logo" font-size="19.5">RUCHITVA</text>
  </g>

  <!-- CENTER: BREAKFAST ON WHATSAPP -->
  <g transform="translate(244, 46)">
    <text x="0" y="52" class="txt-brand" font-size="64" letter-spacing="-1px">Breakfast</text>
    <text x="0" y="112" class="txt-brand" font-size="58" letter-spacing="-0.5px">on Whatsapp</text>
    <text x="2" y="156" class="txt-sub" font-size="25">100% millet breakfast only</text>
  </g>

  <!-- RIGHT: WHATSAPP ICON + TELUGU TEXT + PHONE + PRICE -->
  <!-- WhatsApp Logo -->
  <g transform="translate(568, 132) scale(1.18)" filter="url(#shadow)">
    <!-- Green speech bubble -->
    <path d="M 0 -44 C 24.3 -44 44 -24.3 44 0 C 44 8.2 41.7 16 37.8 22.6 L 41 38 L 26.2 34.2 C 18.6 38.6 9.7 41.2 0 41.2 C -24.3 41.2 -44 21.5 -44 -2.8 C -44 -27.1 -24.3 -44 0 -44 Z" fill="#25D366"/>
    <!-- Phone handset glyph -->
    <path d="M -12.5 -22 C -14.2 -22 -15.8 -21.4 -17.2 -20.2 C -19.4 -18.4 -20.8 -15.2 -20.6 -11.8 C -20.2 -4.8 -14.4 6.8 -5.2 15.6 C 3.8 24.4 15.2 29.8 22.2 29.8 C 25.6 29.8 28.6 28.2 30.2 25.8 C 31.4 24.2 31.8 22.6 31.6 21 C 31.4 19.8 27.8 17.6 25 16.2 C 22.4 14.8 21.2 15 19.8 16.4 C 18.8 17.4 17.6 18.8 16.4 18.6 C 15.2 18.4 11.8 16.4 8 13 C 4.4 9.4 2.6 6.2 2.6 5 C 2.6 3.8 4 2.4 5.2 1.2 C 6.4 -0.2 6.4 -1.4 5 -4 C 3.6 -6.6 1.4 -10.2 0.2 -10.4 C -1 -10.6 -2.4 -10.4 -3.6 -9.6 C -5.4 -8.2 -7 -6.4 -8.6 -6.4 C -10.4 -6.4 -11.2 -7.2 -12.5 -9 C -14 -11.2 -15.4 -13.8 -16.2 -16.8 C -16.8 -19.4 -15 -21.2 -12.5 -22 Z" fill="#FFFFFF" transform="scale(0.85) translate(2, -4)"/>
  </g>

  <!-- Text beside WhatsApp icon -->
  <g transform="translate(630, 46)">
    <!-- Telugu prompt -->
    <text x="0" y="34" class="txt-te" font-size="23.5">ఆర్డర్ కోసం ఇప్పుడే మెసేజ్ చేయండి</text>

    <!-- Phone Number -->
    <text x="0" y="94" class="txt-num" font-size="66" letter-spacing="-1px">93925 64542</text>

    <!-- Price -->
    <text x="0" y="152" class="txt-num" font-size="58" letter-spacing="-0.5px">Just @69</text>
  </g>
</svg>`;

const fontFiles = [
  path.join(__dirname, '../fonts/plus-jakarta-sans-latin.woff2'),
  path.join(__dirname, '../fonts/noto-sans-telugu-telugu.woff2')
];

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: {
    fontFiles: fontFiles.filter(fs.existsSync),
    loadSystemFonts: true,
    defaultFontFamily: 'Plus Jakarta Sans'
  }
});

const pngData = resvg.render().asPng();

// Save as both 'Advertise here banner.png' and 'advertise-here-banner.png' and 'ad-banner.png'
const targets = [
  path.join(__dirname, '../Advertise here banner.png'),
  path.join(__dirname, '../advertise-here-banner.png'),
  path.join(__dirname, '../ad-banner.png')
];

for(const t of targets){
  fs.writeFileSync(t, pngData);
  console.log('Wrote', t, pngData.length, 'bytes');
}
