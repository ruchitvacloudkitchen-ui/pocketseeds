/* Audit of the standalone pages: /box/, /seedbox/, /moneybox/, /privacy/.
 *
 *   node tools/pages-audit.js
 *   CHROME_PATH=/path/to/chrome node tools/pages-audit.js
 *
 * Standalone: it starts its own HTTP server on a free port, serves the repo,
 * runs the checks and exits non-zero if any fail. Needs playwright-core (or
 * playwright) and a Chromium build.
 */
let chromium;
for(const pkg of ['playwright-core','playwright']){ try{ ({chromium}=require(pkg)); break; }catch(e){} }
if(!chromium){
  console.error('This audit needs playwright-core and a Chromium build.\n' +
    '  npm i playwright-core        (in this directory, or set NODE_PATH to a global install)\n' +
    'Set CHROME_PATH to the browser binary if it is not on the default path.');
  process.exit(2);
}
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let HOST = '';
let SRV = null;

/* A free port rather than a fixed one, so the three audits can run back to
   back (or at once) without colliding, and so a stray server left over from a
   previous run cannot be mistaken for this one. */
const freePort = () => new Promise((res, rej) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  s.on('error', rej);
});
const reachable = port => new Promise(res => {
  const s = net.connect(port, '127.0.0.1').on('connect', () => { s.end(); res(true); }).on('error', () => res(false));
});
async function startServer(){
  const port = await freePort();
  SRV = spawn('python3', ['-m', 'http.server', String(port)], { cwd: ROOT, stdio: 'ignore' });
  for(let i = 0; i < 60; i++){
    if(await reachable(port)) return 'http://127.0.0.1:' + port;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('the test server did not come up');
}
process.on('exit', () => { try{ if(SRV) SRV.kill('SIGKILL'); }catch(e){} });
for(const sig of ['SIGINT','SIGTERM']) process.on(sig, () => process.exit(130));

let pass=0, fail=0;
const ok=(n,c,d)=>{ c?pass++:fail++; console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'  ['+d+']':'')); };
let BASEB = '';

/* Wait for the webfonts before measuring. The faces are self-hosted now, so
   they actually load here -- they never did when they came from Google Fonts,
   because this sandbox cannot reach fonts.gstatic.com. Three layout checks had
   therefore been measuring fallback metrics and passing for the wrong reason.
   The geometry is unchanged (the board is a CSS grid; cell sizes measure
   identically with and without the fonts) -- what was wrong was reading the
   page mid-swap. This waits for the swap instead of loosening the assertion. */
const settle = async pg => { try{ await pg.evaluate(()=>document.fonts.ready); }catch(e){} };

(async () => {
  HOST = await startServer();
  BASEB = HOST + '/';
  const br = await chromium.launch(Object.assign({}, process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}));
  const ctx = await br.newContext({ viewport:{width:360,height:900}, deviceScaleFactor:2, locale:'te-IN' });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(e.message));

  console.log('\n--- PRODUCT PAGE /moneybox/ ---');
  await p.goto(HOST+'/moneybox/', {waitUntil:'load'}); await settle(p);
  await p.waitForTimeout(700);
  ok('every block the brief asked for is on the page', await p.evaluate(()=>{
     const txt = document.body.innerText;
     return document.querySelector('.hero') && document.querySelector('.feat')
         && document.querySelectorAll('.gifts > div').length === 5
         && document.querySelectorAll('.trust div').length === 4
         && document.querySelectorAll('ol.steps li').length === 3
         && document.querySelectorAll('details').length === 5
         && txt.length > 400; }));
  ok('no horizontal scroll at 360', await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  /* The photo exists now and sits below the fold as its own captioned
     section, so the old "it removed itself" behaviour is gone. What matters
     instead: it is lazy, it reserves its space so nothing jumps, it offers
     both sources, and its alt describes the object rather than reading back
     the headline that is printed into the image. */
  /* The poster is now 361x548 — smaller than the slot it fills — so there is
     deliberately no srcset: a second source could only be an upscale. What
     this asserts instead: it is lazy, the reserved box matches the file's
     REAL intrinsic size (a stale width/height is the shift-on-load bug), it
     points at the one poster that exists, and it does not reference a variant
     that is no longer in the repo. If a bigger export arrives and srcset comes
     back, this check must be rewritten, not deleted. */
  ok('the hero photo is lazy and reserves its true intrinsic box', await p.evaluate(()=>{
     const i = document.getElementById('shot');
     if(!i || i.loading !== 'lazy') return false;
     if(i.getAttribute('width') !== '361' || i.getAttribute('height') !== '548') return false;
     if(i.naturalWidth && (i.naturalWidth !== 361 || i.naturalHeight !== 548)) return false;
     return /seedbox-hero\.jpg$/.test(i.getAttribute('src') || '')
       && !i.getAttribute('srcset') && !/720/.test(i.outerHTML); }));
  /* The ribbon used to be a rotated corner band 302px long, which ran across
     the tagline and the Order button and had its own text clipped away by the
     hero's overflow:hidden. This asserts the thing that was actually broken:
     it stays inside the card, and it does not sit on top of either. */
  ok('the ribbon stays inside the hero and covers nothing', await p.evaluate(()=>{
     const r = document.querySelector('.ribbon');
     const hero = document.querySelector('.hero');
     if(!r || !hero) return false;
     const a = r.getBoundingClientRect(), h = hero.getBoundingClientRect();
     const inside = a.right <= h.right + 0.5 && a.left >= h.left - 0.5
                 && a.top >= h.top - 0.5 && a.bottom <= h.bottom + 0.5;
     const clear = el => { const b = el.getBoundingClientRect();
       return a.bottom <= b.top + 0.5 || a.top >= b.bottom - 0.5
           || a.right <= b.left + 0.5 || a.left >= b.right - 0.5; };
     return inside && clear(document.querySelector('.tagline'))
            && clear(document.querySelector('.cta')); }));
  ok('the ribbon text is not cut off', await p.evaluate(()=>{
     const r = document.querySelector('.ribbon');
     return !!r && r.scrollWidth <= r.clientWidth + 1; }));
  ok('its alt describes the box and is not the headline', await p.evaluate(()=>{
     const a = (document.getElementById('shot')||{}).alt || '';
     return a.length > 30 && !/Save Smart|Track Easy|Achieve Big/i.test(a); }));
  ok('nothing on the page repeats what is printed in the image', await p.evaluate(()=>
     !document.querySelector('.eyebrow') && !document.querySelector('.pill')
     && !document.querySelector('.hl') && document.querySelectorAll('.feat .ic').length === 0));
  ok('the feature sub-lines survived the cut',
     await p.evaluate(()=>document.querySelectorAll('.feat p').length === 3));
  /* A number IS shipped now, so asserting the inert state alone would be
     asserting the config file rather than the behaviour. Drive both states. */
  ok('the order button is inert with no number and live with one', await p.evaluate(()=>{
     const b = document.getElementById('waBtn');
     const was = MB_WA;
     MB_WA = ''; paint();
     const inert = b.getAttribute('aria-disabled')==='true' && !b.getAttribute('href');
     MB_WA = '917989964542'; paint();
     const live = !b.getAttribute('aria-disabled')
       && (b.getAttribute('href')||'').startsWith('https://wa.me/917989964542?text=');
     MB_WA = was; paint();
     return inert && live; }));
  ok('the order message names the product, and the box when there is one',
     await p.evaluate(()=>{
       const dec = h => decodeURIComponent(new URL(h).searchParams.get('text')||'');
       const b = document.getElementById('waBtn');
       MB_WA = '917989964542'; paint();
       const plain = dec(b.getAttribute('href'));
       return /Seed Box|విత్తన పెట్టె/.test(plain) && !/BOX\d/.test(plain); }));
  ok('language follows the app and both are complete', await p.evaluate(()=>{
     const missing = [];
     Object.keys(STR.te).forEach(k=>{ if(!STR.en[k]) missing.push('en:'+k); });
     Object.keys(STR.en).forEach(k=>{ if(!STR.te[k]) missing.push('te:'+k); });
     return missing.length === 0; }));
  /* .eyebrow is gone with the rest of the duplicated copy; the tagline is the
     hero's line now, so that is what proves the language took. */
  ok('it opens in Telugu when the app is set to Telugu',
     (await p.textContent('.tagline')).includes('సముద్రం'));
  await p.click('.lang button[data-lang="en"]'); await p.waitForTimeout(300);
  ok('and switches to English', (await p.textContent('.tagline')).includes('a lakh in a year'));
  ok('the switch is remembered for the app too',
     await p.evaluate(()=>localStorage.getItem('pocketseeds.lmode')==='en'));
  ok('both CTAs reach the tracker', await p.$$eval('a[href="../box/"]', e=>e.length===2));

  console.log('\n--- TRACKER /box/ ---');
  await p.goto(HOST+'/box/', {waitUntil:'load'}); await settle(p); await p.waitForTimeout(600);
  ok('with no id it asks for the box number', !!(await p.$('#boxIn')));
  ok('a bad number is refused', await (async()=>{
     await p.fill('#boxIn','hello'); await p.click('#boxGo'); await p.waitForTimeout(300);
     return await p.evaluate(()=>document.getElementById('boxErr').style.display==='block'); })());
  await p.goto(HOST+'/box/?id=BOX0001', {waitUntil:'load'}); await settle(p); await p.waitForTimeout(700);
  ok('the printed cells add up to the goal exactly',
     await p.evaluate(()=>MB_PLANNED === MB_GOAL),
     await p.evaluate(()=>MB_PLANNED + ' vs ' + MB_GOAL));
  ok('the declared rows account for every cell',
     await p.evaluate(()=>MB_ROWED === MB_COUNT),
     await p.evaluate(()=>MB_ROWED + ' across rows vs ' + MB_COUNT + ' declared'));
  ok('and the page is clean when both agree',
     await p.evaluate(()=>MB_FAULTS.length===0 && !document.querySelector('.fault')));

  ok('six sections, in the order asked for', await p.evaluate(()=>{
     const secs=[...document.querySelectorAll('#app > section')];
     return secs.length===6
       && !!secs[0].querySelector('.ring')
       && secs[1].querySelectorAll('.tile').length===4
       && !!secs[2].querySelector('.board')
       && !!secs[3].querySelector('#lastBox')
       && secs[4].querySelectorAll('ol.tips li').length===5; }),
     await p.$$eval('#app > section', e=>e.length + ' sections'));
  ok('the header carries the box id and the tagline pill', await p.evaluate(()=>
     document.getElementById('hdrId').textContent==='BOX0001'
     && document.querySelector('.tagpill').textContent.length > 10));
  ok('the ring is one inline circle, no library', await p.evaluate(()=>{
     const f=document.querySelector('.ring .fill');
     return f && f.tagName==='circle' && f.getAttribute('stroke-dasharray'); }));
  ok('the percentage carries one decimal',
     /^\d+\.\d%$/.test(await p.textContent('#ringPc')), await p.textContent('#ringPc'));
  ok('the ring sweep respects prefers-reduced-motion',
     await p.evaluate(()=>[...document.styleSheets].some(ss=>{
       try{ return [...ss.cssRules].some(r=>String(r.cssText).includes('prefers-reduced-motion')
              && String(r.cssText).includes('.ring')); }catch(e){ return false; } })));
  /* "saved" is the brand green, and the brand green is a token that differs
     per theme now — so read the token rather than naming last year's hex.
     The other two are fixed colours and stay named. */
  ok('four tiles, coloured as asked', await p.evaluate(()=>{
     const c=s2=>getComputedStyle(document.querySelector(s2)).color;
     const brand=getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
     const probe=document.createElement('span');
     probe.style.color=brand; document.body.appendChild(probe);
     const brandRgb=getComputedStyle(probe).color; probe.remove();
     return c('.tile.saved .v')===brandRgb
         && c('.tile.left .v')==='rgb(176, 67, 26)'
         && c('.tile.prog .v')==='rgb(17, 99, 168)'; }),
     await p.evaluate(()=>getComputedStyle(document.querySelector('.tile.saved .v')).color));

  ok('the board is drawn row by row in the printed shape', await p.evaluate(()=>{
     const rows=[...document.querySelectorAll('.brow')].map(r=>r.children.length);
     return rows.length===MB_FACE_ROWS.length && rows.every((n,i)=>n===MB_FACE_ROWS[i]); }),
     await p.$$eval('.brow', e=>e.length + ' rows'));
  ok('cells run in printed order, so tile position maps to box position',
     await p.evaluate(()=>[...document.querySelectorAll('.cell')].map(c=>c.dataset.cell).join(',')
       === BOX.cells.map(c=>c.id).join(',')));
  ok('the whole board fits 360 with no sideways scroll anywhere',
     await p.evaluate(()=>{ const b=document.querySelector('.board');
       return b.scrollWidth<=b.clientWidth+1
         && document.documentElement.scrollWidth<=window.innerWidth+1; }));
  /* wood before, brand green after — the green is a token, so compare against
     what the token resolves to and require the two states to be far enough
     apart to read as different at a glance */
  ok('an unfilled cell is wood and a filled one is brand green',
     await p.evaluate(async ()=>{
       const lin=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};
       const lum=s2=>{const m=String(s2).match(/[\d.]+/g).map(Number);
         return .2126*lin(m[0])+.7152*lin(m[1])+.0722*lin(m[2]);};
       const brand=getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
       const probe=document.createElement('span');
       probe.style.color=brand; document.body.appendChild(probe);
       const brandRgb=getComputedStyle(probe).color; probe.remove();
       const c=document.querySelectorAll('.cell')[0];
       const off=getComputedStyle(c).backgroundColor;
       c.click(); await new Promise(r=>setTimeout(r,180));
       const on=getComputedStyle(c).backgroundColor;
       c.click(); await new Promise(r=>setTimeout(r,180));
       const a=lum(off), b=lum(on);
       return off==='rgb(91, 58, 33)' && on===brandRgb
         && (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05) >= 1.6; }),
     await p.evaluate(()=>getComputedStyle(document.querySelectorAll('.cell')[0]).backgroundColor));
  ok('every cell shows its own amount, filled or not', await p.evaluate(()=>
     [...document.querySelectorAll('.cell')].every(c=>/^\d+$/.test(c.textContent.trim()))));
  /* behaviour, not the stylesheet: the font must actually change with the
     viewport, and the amount must fit inside its cell at the narrow end */
  ok('the number scales with the cell rather than staying fixed', await (async()=>{
     const at = async w => { await p.setViewportSize({width:w, height:900});
       await p.waitForTimeout(250);
       return p.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.cell')).fontSize)); };
     const a = await at(320), b = await at(414);
     await p.setViewportSize({width:360, height:900}); await p.waitForTimeout(250);
     return b > a; })());
  ok('and the amount still fits inside its cell at 320', await (async()=>{
     await p.setViewportSize({width:320, height:900}); await p.waitForTimeout(250);
     const fits = await p.evaluate(()=>{
       const c=[...document.querySelectorAll('.cell')].find(x=>x.textContent.trim().length===3);
       const box=c.getBoundingClientRect();
       const s2=document.createElement('span');
       s2.style.cssText='position:absolute;visibility:hidden;white-space:nowrap;font-weight:800;font-size:'
         + getComputedStyle(c).fontSize;
       s2.textContent=c.textContent.trim(); document.body.appendChild(s2);
       const tw=s2.getBoundingClientRect().width; s2.remove();
       return tw < box.width - 1; });
     await p.setViewportSize({width:360, height:900}); await p.waitForTimeout(250);
     return fits; })());

  console.log('\n--- BOARD ZOOM ---');
  ok('fit is the default, and shows the whole face without scrolling',
     await p.evaluate(()=>{ const b=document.querySelector('.board');
       return !b.classList.contains('zoom') && b.scrollWidth<=b.clientWidth+1
         && document.documentElement.scrollWidth<=window.innerWidth+1; }));
  ok('zoom gives a cell that clears 44px, scrolling sideways to do it',
     await (async()=>{
       await p.click('#zoomSeg button[data-zoom="big"]'); await p.waitForTimeout(350);
       return p.evaluate(()=>{ const b=document.querySelector('.board');
         const c=document.querySelector('.cell').getBoundingClientRect();
         return c.width>=44 && b.scrollWidth>b.clientWidth
           && document.documentElement.scrollWidth<=window.innerWidth+1; }); })());
  ok('the print order and row structure are the same in both modes',
     await p.evaluate(()=>{
       const rows=[...document.querySelectorAll('.brow')].map(r=>r.children.length);
       return rows.length===MB_FACE_ROWS.length && rows.every((n,i)=>n===MB_FACE_ROWS[i])
         && [...document.querySelectorAll('.cell')].map(c=>c.dataset.cell).join(',')
            === BOX.cells.map(c=>c.id).join(','); }));
  ok('switching mode keeps what is already filled', await p.evaluate(async ()=>{
     const before=[...document.querySelectorAll('.cell')].map(c=>c.getAttribute('aria-pressed')).join('');
     document.querySelector('#zoomSeg button[data-zoom="fit"]').click();
     await new Promise(r=>setTimeout(r,300));
     const after=[...document.querySelectorAll('.cell')].map(c=>c.getAttribute('aria-pressed')).join('');
     return before===after; }));
  ok('the choice is remembered for that box, and does not leak to another',
     await (async()=>{
       await p.click('#zoomSeg button[data-zoom="big"]'); await p.waitForTimeout(300);
       await p.reload({waitUntil:'load'}); await p.waitForTimeout(1100);
       const kept = await p.evaluate(()=>ZOOM && document.querySelector('.board').classList.contains('zoom'));
       await p.goto(HOST+'/box/?id=BOX0002', {waitUntil:'load'}); await settle(p);
       await p.waitForTimeout(1000);
       const other = await p.evaluate(()=>!ZOOM);
       await p.goto(HOST+'/box/?id=BOX0001', {waitUntil:'load'}); await settle(p);
       await p.waitForTimeout(1000);
       await p.evaluate(()=>{ localStorage.removeItem('moneybox.zoom.BOX0001');
         ZOOM=false; document.querySelector('.board').classList.remove('zoom'); });
       return kept && other; })());
  ok('the preference is never mistaken for a box',
     await p.evaluate(()=>knownBoxes().every(b=>/^BOX\d+$/.test(b))),
     await p.evaluate(()=>knownBoxes().join(',')));
  ok('cells are real buttons, focusable, with aria-pressed', await p.evaluate(()=>{
     const c=document.querySelector('.cell');
     return c.tagName==='BUTTON' && c.getAttribute('aria-pressed')==='false' && c.tabIndex>=0; }));
  ok('the label says where on the box a cell is',
     await p.evaluate(()=>document.querySelectorAll('.cell')[11].getAttribute('aria-label').length>8),
     await p.evaluate(()=>document.querySelectorAll('.cell')[11].getAttribute('aria-label')));
  /* read the amount off the cell rather than naming one: the face is data and
     the first cell's denomination changes whenever the grid is re-cut */
  ok('a tap counts, and the tiles and ring follow immediately', await p.evaluate(async ()=>{
     const c0 = document.querySelectorAll('.cell')[0];
     const amt = Number(String(c0.textContent).replace(/[^\d]/g,''));
     c0.click();
     await new Promise(r=>setTimeout(r,200));
     const shown = Number(document.getElementById('tSaved').textContent.replace(/[^\d]/g,''));
     return shown === amt
         && document.getElementById('tProg').textContent !== '0.0%'
         && document.getElementById('ringFill').style.strokeDashoffset !== ''; }));
  ok('a tap does not re-render the board', await p.evaluate(async ()=>{
     const first=document.querySelectorAll('.cell')[5];
     first.dataset.mark='keep';
     first.click(); await new Promise(r=>setTimeout(r,200));
     const still=document.querySelectorAll('.cell')[5].dataset.mark==='keep';
     first.click(); await new Promise(r=>setTimeout(r,150));
     return still; }));
  ok('the new total is announced to a screen reader',
     (await p.textContent('#live')).length>3, await p.textContent('#live'));
  ok('tapping again reverses it', await p.evaluate(async ()=>{
     const c=document.querySelectorAll('.cell')[0]; c.click();
     await new Promise(r=>setTimeout(r,180));
     return c.getAttribute('aria-pressed')==='false'; }));
  ok('"undo last" reverses the most recent one', await p.evaluate(async ()=>{
     document.querySelectorAll('.cell').forEach(c=>{ if(c.getAttribute('aria-pressed')==='true') c.click(); });
     await new Promise(r=>setTimeout(r,200));
     const cells = document.querySelectorAll('.cell');
     const first = Number(String(cells[0].textContent).replace(/[^\d]/g,''));
     cells[0].click(); cells[1].click();
     await new Promise(r=>setTimeout(r,200));
     document.getElementById('undo').click();
     await new Promise(r=>setTimeout(r,250));
     /* the second tap is undone, so exactly the first cell's amount is left */
     return Number(document.getElementById('tSaved').textContent.replace(/[^\d]/g,'')) === first; }),
     await p.textContent('#tSaved'));

  ok('the last-10 table fills in and follows every tap', await p.evaluate(async ()=>{
     [2,3,4].forEach(i=>document.querySelectorAll('.cell')[i].click());
     await new Promise(r=>setTimeout(r,250));
     return document.querySelectorAll('#lastBox tbody tr').length === 4; }),
     await p.$$eval('#lastBox tbody tr', e=>e.length + ' rows'));
  ok('it shows at most ten, newest first', await p.evaluate(async ()=>{
     document.querySelectorAll('.cell').forEach((c,i)=>{ if(i<15 && c.getAttribute('aria-pressed')!=='true') c.click(); });
     await new Promise(r=>setTimeout(r,300));
     return document.querySelectorAll('#lastBox tbody tr').length === 10; }));
  ok('"view all" opens a sheet grouped by month with a subtotal', await (async()=>{
     await p.click('#viewAll'); await p.waitForTimeout(450);
     const txt = await p.textContent('#sheet');
     const grouped = (await p.$$('#sheet .mhead')).length >= 1;
     await p.click('#hxClose'); await p.waitForTimeout(400);
     return grouped && txt.length > 40; })());
  ok('dates use the app\'s day-then-month shape',
     /^\d{1,2}\s/.test((await p.$$eval('#lastBox tbody tr td', e=>e[0].textContent.trim()))),
     await p.$$eval('#lastBox tbody tr td', e=>e[0].textContent.trim()));

  ok('five tips, written in both languages', await p.evaluate(()=>{
     const n=document.querySelectorAll('ol.tips li').length;
     const bothLangs=[1,2,3,4,5].every(i=>STR.te['tip'+i] && STR.en['tip'+i]
       && STR.te['tip'+i] !== STR.en['tip'+i]);
     return n===5 && bothLangs; }));

  ok('a milestone is recorded in the stored box', await p.evaluate(async ()=>{
     document.querySelectorAll('.cell').forEach((c,i)=>{ if(i<60 && c.getAttribute('aria-pressed')!=='true') c.click(); });
     await new Promise(r=>setTimeout(r,350));
     const b=JSON.parse(localStorage.getItem('moneybox:BOX0001'));
     return Array.isArray(b.milestones) && b.milestones.includes(25); }));
  ok('and does not fire again when the page is reopened', await (async()=>{
     await p.reload({waitUntil:'load'}); await p.waitForTimeout(1200);
     return await p.evaluate(()=>!document.getElementById('cheer').classList.contains('on')); })());
  ok('it survives a reload', await p.evaluate(()=>
     document.getElementById('tSaved').textContent !== '₹0'));
  ok('the goal state shows at 100%', await p.evaluate(async ()=>{
     document.querySelectorAll('.cell').forEach(c=>{ if(c.getAttribute('aria-pressed')!=='true') c.click(); });
     await new Promise(r=>setTimeout(r,400));
     return document.getElementById('goalSec').classList.contains('done')
         && document.getElementById('tSaved').textContent === '₹1,00,000'
         && document.getElementById('ringPc').textContent === '100.0%'; }),
     await p.textContent('#ringPc'));
  ok('"add to my savings" writes once, and only the new part', await p.evaluate(async ()=>{
     localStorage.setItem('pocketseeds.v2', JSON.stringify({ savings:[], tx:[] }));
     BOX.syncedTotal = 0; saveBox();
     document.getElementById('addSav').click();
     await new Promise(r=>setTimeout(r,250));
     document.getElementById('addSav').click();
     await new Promise(r=>setTimeout(r,250));
     const db = JSON.parse(localStorage.getItem('pocketseeds.v2'));
     return db.savings.length === 1 && db.savings[0].amount === 100000
         && db.savings[0].note.includes('BOX0001'); }));
  ok('several boxes are kept apart', await (async()=>{
     await p.goto(HOST+'/box/?id=BOX0002', {waitUntil:'load'}); await settle(p);
     await p.waitForTimeout(700);
     const fresh = (await p.textContent('#tSaved')) === '₹0';
     const listed = await p.evaluate(()=>knownBoxes().length >= 2);
     return fresh && listed; })());
  ok('and listed once there is more than one',
     (await p.$$('.boxes a')).length >= 2, String((await p.$$('.boxes a')).length));
  ok('reset clears the box', await (async()=>{
     p.once('dialog', d => d.accept());
     await p.evaluate(()=>document.querySelectorAll('.cell')[0].click());
     await p.waitForTimeout(200);
     await p.click('#reset'); await p.waitForTimeout(500);
     return (await p.textContent('#tSaved')) === '₹0'; })());
  ok('both languages are complete on the tracker too', await p.evaluate(()=>{
     const miss=[]; Object.keys(STR.te).forEach(k=>{ if(!STR.en[k]) miss.push(k); });
     Object.keys(STR.en).forEach(k=>{ if(!STR.te[k]) miss.push(k); });
     return miss.length===0; }));
  ok('no runtime errors anywhere', errs.length===0, errs.join(' | '));



  /* Sweep the whole page for text painted on a green fill and require AA of
     every one, in both themes. This is what would have caught white on the
     mint button: the failure was in a TOKEN, so no check that named a hex
     could ever have seen it. Only elements that paint their own text count —
     a container whose words live in a child with its own colour is not a
     contrast pair, and counting it invents failures that are not there. */
  const greenTextAA = () => p.evaluate(() => {
    const lin = c => { c/=255; return c<=0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); };
    const lum = s => { const m=String(s).match(/[\d.]+/g); if(!m) return null;
      const [r,g,b]=m.slice(0,3).map(Number); return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b); };
    const bad = [];
    document.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      if(cs.backgroundColor === 'rgba(0, 0, 0, 0)') return;
      /* Composite the fill down the ancestors until it is opaque. A tint like
         rgba(99,190,113,.16) is nearly the page underneath, not the green it
         names, and judging it as opaque invents a failure that no reader can
         see. */
      const px = s2 => { const q=String(s2).match(/[\d.]+/g); return q ? q.map(Number) : null; };
      let acc = [0,0,0], alpha = 0, node = el;
      while(node && alpha < 0.999){
        const c = px(getComputedStyle(node).backgroundColor);
        if(c){ const a = c.length > 3 ? c[3] : 1;
          if(a > 0){ const w = a * (1 - alpha);
            acc = [acc[0]+c[0]*w, acc[1]+c[1]*w, acc[2]+c[2]*w]; alpha += w; } }
        node = node.parentElement;
      }
      if(alpha < 0.999){ const w = 1 - alpha;
        acc = [acc[0]+255*w, acc[1]+255*w, acc[2]+255*w]; }
      const [r,g,b] = acc;
      if(!(g > r + 18 && g > b + 18)) return;              // green-ish fills only
      const bg = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
      const own = Array.from(el.childNodes)
        .filter(n => n.nodeType === 3 && n.textContent.trim()).length;
      if(!own) return;
      if(el.getBoundingClientRect().width === 0) return;
      const size = parseFloat(cs.fontSize), wt = parseInt(cs.fontWeight) || 400;
      const need = (size >= 24 || (size >= 18.66 && wt >= 700)) ? 3.0 : 4.5;
      const a = lum(cs.color), c = lum(bg);
      const ratio = (Math.max(a,c) + 0.05) / (Math.min(a,c) + 0.05);
      if(ratio < need) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} `
        + `${cs.color} on ${bg} = ${ratio.toFixed(2)}:1 (needs ${need})`);
    });
    return bad;
  });

  console.log('\n--- GREEN CONTRAST ON THE STANDALONE PAGES ---');
  for(const [label, url] of [['tracker', BASEB+'box/?id=BOX0777'], ['product page', BASEB+'seedbox/']]){
    for(const theme of ['light','dark']){
      await p.goto(url, {waitUntil:'load'}); await settle(p);
      await p.evaluate(t=>localStorage.setItem('pocketseeds.theme', t), theme);
      await p.reload({waitUntil:'load'}); await p.waitForTimeout(600);
      const bad = await greenTextAA();
      ok(`${label}, ${theme}: no text on a green fill below AA`,
         bad.length === 0, bad.slice(0,3).join(' | ') || 'all clear');
    }
  }
  await p.evaluate(()=>localStorage.removeItem('pocketseeds.theme'));

  console.log('\n--- FROZEN FACE ORDER ---');
  await p.goto(HOST+'/box/?id=BOX0801', {waitUntil:'load'}); await settle(p); await p.waitForTimeout(700);
  ok('MB_FACE_ORDER exists and is the length MB_CELLS declares',
     await p.evaluate(()=>Array.isArray(MB_FACE_ORDER) && MB_FACE_ORDER.length===MB_COUNT),
     await p.evaluate(()=>(MB_FACE_ORDER||[]).length+' vs '+MB_COUNT));
  ok('it is MB_CELLS rearranged, denomination for denomination', await p.evaluate(()=>{
     const want=new Map(), got=new Map();
     MB_CELLS.forEach(g=>want.set(g.amount,(want.get(g.amount)||0)+g.count));
     MB_FACE_ORDER.forEach(a=>got.set(a,(got.get(a)||0)+1));
     return [...new Set([...want.keys(),...got.keys()])]
       .every(a=>(want.get(a)||0)===(got.get(a)||0)); }));
  ok('the printed order adds up to the goal',
     await p.evaluate(()=>MB_FACE_ORDER.reduce((n,a)=>n+a,0)===MB_GOAL),
     await p.evaluate(()=>String(MB_FACE_ORDER.reduce((n,a)=>n+a,0))));
  ok('every row carries one cell per column', await p.evaluate(()=>
     MB_FACE_ROWS.every(n=>n===MB_FACE_COLS)));
  ok('the board draws from the frozen order, not from config order', await p.evaluate(()=>{
     const drawn = Array.from(document.querySelectorAll('.cell'))
       .map(c=>Number(String(c.textContent).replace(/[^\d]/g,'')));
     return drawn.length===MB_FACE_ORDER.length
        && drawn.every((a,i)=>a===MB_FACE_ORDER[i]); }));
  ok('so no row is a solid band of one denomination', await p.evaluate(()=>
     Array.from(document.querySelectorAll('.brow'))
       .every(r=>new Set(Array.from(r.querySelectorAll('.cell')).map(c=>c.textContent)).size>1)));
  ok('a 4-digit label still fits its cell at 360px', await (async()=>{
     await p.setViewportSize({width:360,height:800}); await p.waitForTimeout(350);
     const over = await p.evaluate(()=>{
       let n=0;
       document.querySelectorAll('.cell').forEach(el=>{
         const rg=document.createRange(); rg.selectNodeContents(el);
         if(rg.getBoundingClientRect().width > el.getBoundingClientRect().width - 2) n++; });
       return n; });
     await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(300);
     return over===0; })());
  ok('the small amounts are a real share of the face, not a token row',
     await p.evaluate(()=>MB_CELLS.filter(g=>g.amount<=100).reduce((n,g)=>n+g.count,0) >= MB_COUNT*0.2),
     await p.evaluate(()=>MB_CELLS.filter(g=>g.amount<=100).reduce((n,g)=>n+g.count,0)+' of '+MB_COUNT));
  ok('nothing tells the reader to fill the cells in order', await p.evaluate(()=>
     !/week ?\d|in order|one a day|sequence|schedule/i.test(document.body.innerText)));
  await p.evaluate(()=>localStorage.removeItem('moneybox:BOX0801'));

  console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
  await br.close();
  process.exit(fail ? 1 : 0);
})();
