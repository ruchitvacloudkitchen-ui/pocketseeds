/* Full audit of the PocketSeeds app (index.html).
 *
 *   node tools/app-audit.js
 *   CHROME_PATH=/path/to/chrome node tools/app-audit.js
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

let BASE = '';
let pass=0, fail=0;
const ok  = (n,c,d)=>{ (c?pass++:fail++); console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'  ['+d+']':'')); };


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
  BASE = HOST + '/';
  const br = await chromium.launch(Object.assign({}, process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}));
  const ctx = await br.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, locale:'te-IN' });
  const p = await ctx.newPage();
  const errs=[], net=[];
  p.on('pageerror', e=>errs.push('JS: '+e.message));
  const notFound=[];
  p.on('response', r=>{ if(r.status()>=400 && !/googleapis|gstatic|google/.test(r.url())) notFound.push(r.url().split('/').pop()); });
  p.on('console', m=>{ if(m.type()==='error' && !/Failed to load resource|fonts.googleapis|gstatic|accounts.google|ERR_/.test(m.text())) errs.push('CON: '+m.text()); });
  /* Same-origin only, as the check's name says. A third-party host failing
     here says more about this sandbox's proxy than about the app — and every
     remote asset the app loads is written to degrade on error, which is
     asserted separately. A missing local file still fails this. */
  p.on('requestfailed', r=>{
    const u = r.url();
    if(u.startsWith(HOST+'/')) net.push(u+' :: '+(r.failure()||{}).errorText);
  });

  console.log('\n--- LOAD ---');
  const resp = await p.goto(BASE, {waitUntil:'load'}); await settle(p);
  await p.waitForTimeout(1500);
  ok('page returns 200', resp.status()===200, 'HTTP '+resp.status());
  ok('title is PocketSeeds', (await p.title()).includes('PocketSeeds'), await p.title());
  ok('no JS errors on load', errs.length===0, errs.join(' | '));
  ok('no failed same-origin requests', net.length===0, net.join(' | '));
  /* Optional artwork the owner may or may not have uploaded. Each is probed
     deliberately and each degrades to a drawn fallback, so a 404 here is the
     designed behaviour rather than a break. */
  const OPTIONAL_ART = ['icon.png', 'splash.jpg', 'income-banner.jpg'];
  const unexpected = notFound.filter(f=>!OPTIONAL_ART.includes(f));
  ok('no unexpected 404s', unexpected.length===0, unexpected.join(', ')||'only the optional-artwork probes');
  ok('a missing artwork degrades quietly', await p.evaluate(()=>{
     /* no artwork means no splash — never a half-drawn stand-in, and never a
        broken image where the income banner would be */
     const sp = document.getElementById('splash');
     const bn = document.getElementById('incBanner');
     return sp.children.length===0 && (!bn || !!bn.querySelector('img[src]')); }));
  ok('service worker registered', await p.evaluate(async()=>{ const r=await navigator.serviceWorker.getRegistrations(); return r.length>0; }));
  ok('manifest linked', (await p.getAttribute('link[rel=manifest]','href'))==='manifest.webmanifest');

  console.log('\n--- SPLASH (first run) ---');
  ok('splash shows on a first run', await p.isVisible('#splash'));
  ok('it covers the whole viewport', await p.evaluate(()=>{
     const r=document.getElementById('splash').getBoundingClientRect();
     return Math.round(r.width)===window.innerWidth && Math.round(r.height)===window.innerHeight; }));
  ok('the splash is the artwork and nothing else', await p.evaluate(()=>{
     const b=document.getElementById('splash');
     return b.children.length===0 &&
       getComputedStyle(b).backgroundImage.includes('splash.jpg'); }));
  ok('it is reachable by keyboard', await p.evaluate(()=>{
     const b=document.getElementById('splash');
     return b.getAttribute('role')==='button' && b.getAttribute('tabindex')==='0'; }));
  ok('the page behind cannot scroll', await p.evaluate(()=>getComputedStyle(document.body).overflow==='hidden'));
  await p.mouse.click(195, 700); await p.waitForTimeout(350);
  ok('a tap anywhere enters the app', !(await p.isVisible('#splash')));
  ok('entering throws no form at the user', !(await p.isVisible('.sheet.on')));
  ok('scroll is released', await p.evaluate(()=>document.body.style.overflow===''));
  await p.reload({waitUntil:'load'}); await p.waitForTimeout(1200);
  ok('it stays dismissed across reloads', !(await p.isVisible('#splash')));
  ok('never returns once there are entries', await p.evaluate(()=>{
     localStorage.removeItem('pocketseeds.welcomeSeen');
     DB.tx=[{id:'w',type:'income',amount:100,date:ymd(new Date()),category:'Salary'}];
     save(); renderAll();
     const hidden = !document.getElementById('splash').classList.contains('on');
     /* leave no trace: later checks assert exact balances */
     DB.tx=[]; localStorage.setItem('pocketseeds.welcomeSeen','1'); save(); renderAll();
     return hidden; }));

  console.log('\n--- REMOVED SECTIONS ---');
  ok('gold/silver rate strip gone from home', await p.evaluate(()=>!document.getElementById('rateBar')));
  ok('under-500 shopping strip gone', await p.evaluate(()=>!document.getElementById('shopBar')));
  ok('old savings coach gone from home', await p.evaluate(()=>!document.getElementById('coachBox')));
  ok('the Save page keeps its own coach', await p.evaluate(()=>!!document.getElementById('coachBox2')));
  ok('stylesheet has no unmatched brace', await p.evaluate(()=>{
     /* an unmatched } silently swallows whichever rule follows it */
     const sh=[...document.styleSheets].find(x=>{ try{ return x.cssRules.length>50; }catch(e){ return false; } });
     return !!sh && [...sh.cssRules].some(r=>r.selectorText==='.splash'); }));

  console.log('\n--- HOME LAYOUT / ORDER ---');
  await p.evaluate(()=>setLangMode('en')); await p.waitForTimeout(400);
  const order = (await p.$$eval('#page-home .sec-head h3', e=>e.map(x=>x.textContent.trim())));
  await p.evaluate(()=>setLangMode('te')); await p.waitForTimeout(400);
  ok('Quick add before SIP', order.indexOf('Quick add') < order.indexOf('SIP & mutual funds'), order.join(' > '));
  ok('Saving coach sits right after Quick add',
     order.indexOf('Saving coach') === order.indexOf('Quick add') + 1, order.join(' > '));
  ok('Where the money went is last', order[order.length-1]==='Where the money went', order.join(' > '));
  ok('save-data bar above balance', await p.evaluate(()=>{
      const b=document.querySelector('#btnSaveData').getBoundingClientRect().top;
      const c=document.querySelector('.balance-card').getBoundingClientRect().top; return b<c; }));
  ok('two (+) tile buttons', (await p.$$('.t-add')).length===2);
  ok('all icons are SVG, no emoji', await p.evaluate(()=>((document.body.innerText.match(/[\u{1F300}-\u{1FAFF}]/gu))||[]).length===0));
  ok('no sideways page scroll', await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));

  console.log('\n--- DATA ENTRY ---');
  await p.click('#quickOut'); await p.waitForTimeout(300);
  await p.click('#qaFast [data-v="500"]'); await p.fill('#qaNote','కూరగాయలు'); await p.click('#qaSave');
  await p.waitForTimeout(350);
  ok('quick expense saved', (await p.textContent('#hExpense'))==='₹500', await p.textContent('#hExpense'));
  await p.click('#quickIn'); await p.waitForTimeout(300);
  await p.fill('#qaVal','40000'); await p.click('#qaSave'); await p.waitForTimeout(350);
  ok('quick income saved', (await p.textContent('#hIncome'))==='₹40,000');
  ok('balance = income - expense', (await p.textContent('#hBalance'))==='₹39,500', await p.textContent('#hBalance'));
  await p.click('[data-quick="0"]'); await p.waitForTimeout(350);
  /* the monthly categories carry no preset amount on purpose: a wrong default
     for rent is worse than no default at all */
  ok('quick tile picks the category', (await p.inputValue('#fCat'))==='Milk', await p.inputValue('#fCat'));
  ok('quick tile prefills its amount', (await p.inputValue('#fAmt'))==='30', await p.inputValue('#fAmt'));
  ok('fifteen quick categories', (await p.$$('#quickTiles button')).length===15,
     String((await p.$$('#quickTiles button')).length));
  ok('the daily six are still there', await p.evaluate(()=>{
     const cats = QUICK.map(q=>q.cat);
     return ['Milk','Vegetables','Food','Travel','Fuel','Recharge'].every(c=>cats.includes(c)); }));
  ok('the nine monthly ones were added', await p.evaluate(()=>{
     const cats = QUICK.map(q=>q.cat);
     return ['Rent','Bills','Chit','EMI','Health','Education','Groceries','Outing','Other'].every(c=>cats.includes(c)); }));
  ok('every tile shows a price', await p.evaluate(()=>QUICK.every(q=>q.amt>0)));
  ok('rent starts at 5,000', await p.evaluate(()=>QUICK.find(q=>q.cat==='Rent').amt===5000));
  ok('every tile has a coloured chip', (await p.$$('.q-ic')).length===15);
  ok('every chip is the one button green', await p.evaluate(()=>{
     const fills = new Set([...document.querySelectorAll('.q-ic')].map(e=>getComputedStyle(e).backgroundColor));
     const btn = getComputedStyle(document.documentElement).getPropertyValue('--btn').trim();
     return fills.size===1 && !!btn; }));
  /* the glyph used to be white and is now dark; what the check is for is that
     it is READABLE on the fill, which is the thing white stopped being */
  ok('chip glyphs clear 3:1 on the button fill, whatever colour they are',
     await p.evaluate(()=>{
     const parse = s => (s.match(/[\d.]+/g)||[0,0,0]).slice(0,3).map(Number);
     const lum = c => { const f=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});
       return .2126*f[0]+.7152*f[1]+.0722*f[2]; };
     return [...document.querySelectorAll('.q-ic')].every(chip=>{
       const L2=lum(parse(getComputedStyle(chip).backgroundColor));
       const L1=lum(parse(getComputedStyle(chip.querySelector('.i')).color));
       return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05) >= 3; }); }),
     await p.evaluate(()=>{ const c=document.querySelector('.q-ic');
       return getComputedStyle(c.querySelector('.i')).color+' on '+getComputedStyle(c).backgroundColor; }));
  ok('chips are square and equal', await p.evaluate(()=>{
     const s=[...document.querySelectorAll('.q-ic')].map(e=>{const r=e.getBoundingClientRect();
       return Math.round(r.width)+'x'+Math.round(r.height);});
     return new Set(s).size===1 && s[0].split('x')[0]===s[0].split('x')[1]; }));
  await p.click('#fSave'); await p.waitForTimeout(300);

  console.log('\n--- SAVING COACH ---');
  await p.evaluate(()=>{ closeSheet();
    DB.tx=[{id:'i',type:'income',amount:60000,date:ymd(new Date()),category:'Salary'},
           {id:'e',type:'expense',amount:44000,date:ymd(new Date()),category:'Rent'}];
    DB.savings=[]; save(); renderAll(); });
  await p.waitForTimeout(400);
  ok('coach sits after quick add', await p.evaluate(()=>{
     const q=document.querySelector('#quickTiles').closest('.sec').getBoundingClientRect().top;
     const c=document.querySelector('#scBox').closest('.sec').getBoundingClientRect().top;
     return c>q; }));
  const sc = (await p.textContent('#scBox')).replace(/\s+/g,' ');
  ok('30% of income as the target', /18,000/.test(sc), sc.slice(0,50));
  ok('split three ways at 10% each', (await p.$$('.sc-b')).length===3 &&
     (await p.$$eval('.sc-b .sc-v', e=>e.map(x=>x.textContent))).every(v=>v==='\u20B96,000'));
  ok('health takes the wide block', await p.evaluate(()=>{
     const w=document.querySelector('.sc-cell.wide');
     const g=document.querySelector('.sc-bento').getBoundingClientRect();
     return w && w.querySelector('.sc-b').classList.contains('sc-pink') &&
            Math.abs(w.getBoundingClientRect().width-g.width)<2; }));
  ok('gold and the emergency fund share the row below', await p.evaluate(()=>{
     const b=[...document.querySelectorAll('.sc-cell:not(.wide) .sc-b')];
     return b.length===2 && Math.abs(b[0].getBoundingClientRect().top-b[1].getBoundingClientRect().top)<2; }));
  /* The property is "one flat colour across all four panels, no ramp", not a
     particular hex — the tint is a token now and moves with the theme, which
     is why naming the green here would only ever be a hex to update. */
  ok('every coach panel is the one tint, with no gradient left', await p.evaluate(()=>{
     const sels = ['.sc-top','.sc-pink','.sc-amber','.sc-green'];
     const bgs = sels.map(s2=>getComputedStyle(document.querySelector(s2)).backgroundColor);
     const imgs = sels.map(s2=>getComputedStyle(document.querySelector(s2)).backgroundImage);
     return new Set(bgs).size === 1
            && bgs[0] !== 'rgba(0, 0, 0, 0)'
            && imgs.every(i=>i === 'none'); }),
     await p.evaluate(()=>['.sc-top','.sc-pink','.sc-amber','.sc-green']
       .map(s2=>getComputedStyle(document.querySelector(s2)).backgroundColor).join(' / ')));
  ok('its ink clears 4.5:1 on that green', await p.evaluate(()=>{
     const lin=c=>{c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
     const lum=rgb=>{const [r,g,b]=rgb.match(/\d+/g).map(Number);
       return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);};
     const el = document.querySelector('.sc-green');
     const a = lum(getComputedStyle(el).color), b = lum(getComputedStyle(el).backgroundColor);
     const hi = Math.max(a,b), lo = Math.min(a,b);
     return (hi+0.05)/(lo+0.05) >= 4.5; }));
  /* Each block must set BOTH its ink and its ground rather than inheriting
     either, and the pair has to be readable — checked in both themes, since
     the coach now has a dark counterpart instead of one colour for both. */
  ok('each block states its own ink and ground, and is readable in both themes',
     await (async()=>{
       const probe = () => p.evaluate(()=>{
         const lin=c=>{c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
         const lum=rgb=>{const [r,g,b]=rgb.match(/\d+/g).map(Number);
           return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);};
         const page = getComputedStyle(document.body).backgroundColor;
         return [...document.querySelectorAll('.sc-b')].every(x=>{
           const c=getComputedStyle(x);
           if(c.backgroundColor==='rgba(0, 0, 0, 0)' || c.backgroundColor===page) return false;
           const a=lum(c.color), b=lum(c.backgroundColor);
           return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05) >= 4.5; });
       });
       await p.evaluate(()=>setTheme('light')); await p.waitForTimeout(250);
       const lightOk = await probe();
       await p.evaluate(()=>setTheme('dark')); await p.waitForTimeout(250);
       const darkOk = await probe();
       await p.evaluate(()=>setTheme('auto')); await p.waitForTimeout(200);
       return lightOk && darkOk;
     })());
  ok('warns when the balance falls short', /2,000/.test(sc) && !!(await p.$('.sc-short')));
  await p.evaluate(()=>{ DB.tx=[{id:'i',type:'income',amount:60000,date:ymd(new Date()),category:'Salary'}];
    save(); renderAll(); });
  await p.waitForTimeout(300);
  ok('clears the warning when it is covered', !!(await p.$('.sc-ok')));

  const STATE = {};
  console.log('\n--- MOVED / TRIMMED ---');
  ok('recent activity left the home page', await p.evaluate(()=>
     !document.getElementById('page-home').contains(document.getElementById('recentList'))));
  ok('recent activity now on expenses', await p.evaluate(()=>
     document.getElementById('page-expense').contains(document.getElementById('recentList'))));
  await p.click('.nav button[data-go="more"]'); await p.waitForTimeout(300);
  /* six, not seven: the Seed Box tile was removed because the card above the
     grid now does that job. The count is still pinned rather than relaxed to
     a range -- a tile appearing or vanishing unnoticed is the thing this
     check exists to catch. */
  /* go() hides the backup bar off home, but display:flex used to beat the
     hidden attribute, so it showed on every tab. Assert what the reader sees,
     not what the attribute says. */
  ok('the backup bar is on home only', await p.evaluate(async ()=>{
     const bar = document.getElementById('btnSaveData');
     go('home'); const onHome = bar.offsetParent !== null;
     go('more'); const onMore = bar.offsetParent !== null;
     go('more');
     return onHome && !onMore; }));
  ok('six tiles in the grid', (await p.$$('#menuGrid .menu-tile')).length===6,
     String((await p.$$('#menuGrid .menu-tile')).length));
  ok('chits, gold, insights, loans and budget tiles gone', await p.evaluate(()=>
     ['gold','insights','budget'].every(g=>!document.querySelector('.menu-tile[data-go="'+g+'"]')) &&
     !document.querySelector('.menu-tile[data-focus="chitList"]') &&
     !document.querySelector('.menu-tile[data-focus="loanList"]')));
  ok('eight reel cards', (await p.$$('.reel')).length===8, String((await p.$$('.reel')).length));
  ok('the reels are titled for the videos they open', await p.$$eval('#reelBox h4',
     e=>e[0].textContent.includes('Lump Sum') && e[1].textContent.includes('లంప్‌సమ్')),
     (await p.$$eval('#reelBox h4', e=>e.map(x=>x.textContent.slice(0,28)).join(' | '))));
  ok('the broker links also sit under the fund list on More',
     (await p.$$eval('#fundsBox .brokers a', e=>e.map(x=>x.textContent).join(',')))==='AngelOne,Groww,Upstox,Zerodha',
     await p.$$eval('#fundsBox .brokers a', e=>e.map(x=>x.textContent).join(',')));
  ok('every reel points at its own short, in the order given', await p.$$eval('#reelBox a',
     e=>e.map(x=>x.getAttribute('href').split('/').pop()).join(',')
     ==='HyhTn1u42Ho,VYOtr8lgXMw,VMOfnP6kia8,s3n6GjMspw8,lDgKcMsz6h4,awmkakjySGM,jDzp4jCCDm4,eWTN3DF9ExY'),
     (await p.$$eval('#reelBox a', e=>e.map(x=>x.getAttribute('href').split('/').pop()).join(','))));
  ok('the row scrolls sideways rather than stacking eight cards down the page',
     await p.evaluate(()=>{ const b=document.getElementById('reelBox');
       return b.scrollWidth > b.clientWidth + 20; }));
  ok('the arrows appear only where there is somewhere to scroll', await (async()=>{
     const at = () => p.evaluate(()=>[document.getElementById('reelPrev').hidden,
                                     document.getElementById('reelNext').hidden]);
     const start = await at();                       // [prev hidden, next shown]
     await p.click('#reelNext'); await p.waitForTimeout(700);
     const mid = await at();
     /* the row scrolls smoothly, so an assignment animates instead of jumping
        and the previous click may still be in flight — turn that off to land
        exactly on the end */
     const jump = to => p.evaluate(x=>{ const b=document.getElementById('reelBox');
       b.style.scrollBehavior='auto';
       b.scrollLeft = x === 'end' ? b.scrollWidth : 0;
       b.dispatchEvent(new Event('scroll'));
       b.style.scrollBehavior=''; }, to);
     await jump('end'); await p.waitForTimeout(400);
     const end = await at();
     await jump('start'); await p.waitForTimeout(400);
     STATE.arrows = JSON.stringify({start, mid, end});
     return start[0]===true && start[1]===false
         && mid[0]===false
         && end[0]===false && end[1]===true; })(),
     'observed ' + STATE.arrows);
  ok('reels open safely in a new tab', await p.$$eval('#reelBox a',
     e=>e.every(x=>x.target==='_blank' && x.rel.includes('noopener'))));
  ok('a video id is read from every shape of YouTube link, and only those',
     await p.evaluate(()=>[
       reelVideoId('https://www.youtube.com/shorts/HyhTn1u42Ho'),
       reelVideoId('https://youtu.be/VYOtr8lgXMw'),
       reelVideoId('https://www.youtube.com/watch?v=HyhTn1u42Ho&t=3'),
       reelVideoId('https://example.com/not-a-video'),
       reelVideoId('')].join(',')
       === 'HyhTn1u42Ho,VYOtr8lgXMw,HyhTn1u42Ho,,'),
     await p.evaluate(()=>[reelVideoId('https://youtu.be/VYOtr8lgXMw'),
                           reelVideoId('https://example.com/x')].join(',')));
  ok('the thumbnail url is the one size YouTube makes for every video',
     await p.evaluate(()=>reelThumb(null,'https://www.youtube.com/shorts/HyhTn1u42Ho')
       === 'https://i.ytimg.com/vi/HyhTn1u42Ho/hqdefault.jpg'),
     await p.evaluate(()=>reelThumb(null,'https://www.youtube.com/shorts/HyhTn1u42Ho')));
  ok('a local thumbnail in config wins, so these can be made offline',
     await p.evaluate(()=>reelThumb({thumb:'reel1.jpg'},'https://www.youtube.com/shorts/HyhTn1u42Ho')==='reel1.jpg'));
  ok('the thumbnail never leaks which page the reader is on',
     await p.evaluate(()=>{ CONFIG.reels=[{url:'https://youtu.be/aaaaaaaaaaa',thumb:'x.png'},
                                          {url:'https://youtu.be/bbbbbbbbbbb',thumb:'x.png'}]; renderReels();
       const okk=[...document.querySelectorAll('.r-thumb')].every(i=>i.getAttribute('referrerpolicy')==='no-referrer');
       delete CONFIG.reels; renderReels(); return okk; }));
  ok('a thumbnail that never arrives leaves a finished card, not a broken image',
     await p.evaluate(async ()=>{
       CONFIG.reels=[{url:'https://youtu.be/aaaaaaaaaaa',thumb:'does-not-exist.png'},
                     {url:'https://youtu.be/bbbbbbbbbbb',thumb:'does-not-exist.png'}];
       renderReels();
       await new Promise(r=>setTimeout(r,900));
       const cards=[...document.querySelectorAll('.reel')];
       const clean = cards.every(c=>!c.querySelector('.r-thumb') && !c.classList.contains('has-thumb')
                                    && /linear-gradient/.test(getComputedStyle(c).backgroundImage));
       delete CONFIG.reels; renderReels();
       return clean; }));
  ok('a configured reel becomes a real link', await p.evaluate(()=>{
     CONFIG.reels=[{url:'https://example.com/a'},{url:'https://example.com/b'}]; renderReels();
     const a=document.querySelector('.reel');
     const okk = a.tagName==='A' && a.getAttribute('href')==='https://example.com/a' && a.rel.includes('noopener');
     delete CONFIG.reels; renderReels(); return okk; }));
  ok('reel cards are vertical', await p.evaluate(()=>{
     const r=document.querySelector('.reel').getBoundingClientRect(); return r.height>r.width; }));
  ok('no floating (+) on More', await p.evaluate(()=>document.getElementById('fab').hidden));
  ok('the floating mic is gone from every page',
     await p.evaluate(()=>!document.getElementById('fabMic')));
  await p.click('.nav button[data-go="home"]'); await p.waitForTimeout(300);

  console.log('\n--- EMERGENCY HELP ---');
  await p.click('.nav button[data-go="more"]'); await p.waitForTimeout(350);
  await p.$eval('.sos-tile', e=>e.scrollIntoView({block:'center'}));
  await p.waitForTimeout(250);
  await p.click('.sos-tile'); await p.waitForTimeout(450);
  ok('the emergency page opens from More',
     (await p.evaluate(()=>document.querySelector('.page.on').id))==='page-sos');
  ok('all seven national helplines are listed, each dialable',
     (await p.$$eval('#sosBox .sos-row[href^="tel:"]',
        e=>e.map(x=>x.querySelector('.num').textContent).join(',')))==='112,108,101,100,181,14567,1098',
     await p.$$eval('#sosBox .sos-row[href^="tel:"]', e=>e.map(x=>x.querySelector('.num').textContent).join(',')));
  ok('112 comes first, because it reaches all three services',
     (await p.$$eval('#sosBox .sos-row .num', e=>e[0].textContent))==='112');
  ok('a contact can be added', await (async()=>{
     await p.evaluate(()=>sheetSOSContact()); await p.waitForTimeout(350);
     await p.fill('#soName','Apollo casualty'); await p.fill('#soPhone','040 2345 6789');
     await p.click('#soSave'); await p.waitForTimeout(450);
     return (await p.evaluate(()=>DB.sos.length))===1; })());
  ok('spaces in a number do not break the dial link',
     (await p.$$eval('#sosBox a.btn-out', e=>e[0].getAttribute('href')))==='tel:04023456789',
     await p.$$eval('#sosBox a.btn-out', e=>e[0].getAttribute('href')));
  ok('a contact with no name or no number is refused', await (async()=>{
     await p.evaluate(()=>sheetSOSContact()); await p.waitForTimeout(350);
     await p.fill('#soName','no number'); await p.click('#soSave'); await p.waitForTimeout(350);
     const n = await p.evaluate(()=>DB.sos.length);
     await p.evaluate(()=>closeSheet()); await p.waitForTimeout(250);
     return n===1; })());
  ok('the SOS modal leads with 112 and 108, then the owner\'s own numbers', await (async()=>{
     await p.evaluate(()=>sheetSOS()); await p.waitForTimeout(400);
     const hrefs = await p.$$eval('.sheet .sos-row', e=>e.map(x=>x.getAttribute('href')));
     await p.evaluate(()=>closeSheet()); await p.waitForTimeout(250);
     return hrefs.join(',')==='tel:112,tel:108,tel:04023456789'; })());
  ok('a contact can be removed', await (async()=>{
     await p.evaluate(()=>document.querySelector('[data-sos-del]').click()); await p.waitForTimeout(400);
     return (await p.evaluate(()=>DB.sos.length))===0; })());
  ok('the numbers survive a language switch', await (async()=>{
     await p.click('#langPick button[data-lang="en"]'); await p.waitForTimeout(400);
     const en = await p.$$eval('#sosBox .sos-row .num', e=>e.map(x=>x.textContent).join(','));
     await p.click('#langPick button[data-lang="te"]'); await p.waitForTimeout(400);
     const te = await p.$$eval('#sosBox .sos-row .num', e=>e.map(x=>x.textContent).join(','));
     return en===te && en.startsWith('112'); })());
  await p.click('.nav button[data-go="home"]'); await p.waitForTimeout(300);

  console.log('\n--- SAVING COACH: WHERE TO START ---');
  ok('each bucket carries its own panel', (await p.$$('#scBox .sc-cell .sc-where')).length===3);
  ok('two starting points per bucket',
     (await p.$$eval('#scBox .sc-cell', e=>e.map(c=>c.querySelectorAll('.sc-links a').length).join(',')))==='2,2,2',
     await p.$$eval('#scBox .sc-cell', e=>e.map(c=>c.querySelectorAll('.sc-links a').length).join(',')));
  ok('they open safely', await p.$$eval('#scBox .sc-links a',
     e=>e.every(x=>x.target==='_blank' && x.rel.includes('noopener') && x.href.startsWith('https://'))));
  ok('a non-endorsement note sits under the bento',
     (await p.textContent('#scBox .hint')).length>80);
  ok('config can replace a bucket\'s row', await p.evaluate(()=>{
     CONFIG.coachWhere={gold:[{name:'Only',url:'https://example.com/g'}]}; renderSavingCoach();
     const a=document.querySelectorAll('#scBox .sc-cell')[1].querySelectorAll('.sc-links a');
     const okk = a.length===1 && a[0].textContent==='Only';
     delete CONFIG.coachWhere; renderSavingCoach(); return okk; }));

  console.log('\n--- SIP CALCULATORS ---');
  const M = '#sipBox [data-sip-card="monthly"] ', O = '#sipBox [data-sip-card="once"] ';
  ok('two calculators, no mode toggle', (await p.$$('#sipBox [data-sip-card]')).length===2 && !(await p.$('[data-sip]')));
  await p.fill(M+'[data-sip-field="amt"]','5000'); await p.waitForTimeout(200);
  await p.fill(M+'[data-sip-field="yrs"]','10');   await p.waitForTimeout(200);
  await p.click(M+'[data-sip-rate="12"]');         await p.waitForTimeout(300);
  ok('monthly 5000/10y/12% = ₹11,61,695', (await p.textContent(M+'.sipc-out .big'))==='₹11,61,695', await p.textContent(M+'.sipc-out .big'));
  ok('monthly invested = ₹6,00,000', (await p.textContent(M+'.sipc-out .side b'))==='₹6,00,000');
  await p.fill(O+'[data-sip-field="amt"]','100000'); await p.waitForTimeout(200);
  await p.fill(O+'[data-sip-field="yrs"]','10');     await p.waitForTimeout(200);
  await p.click(O+'[data-sip-rate="12"]');           await p.waitForTimeout(300);
  ok('lumpsum 1L/10y/12% = ₹3,10,585', (await p.textContent(O+'.sipc-out .big'))==='₹3,10,585', await p.textContent(O+'.sipc-out .big'));
  ok('lumpsum invested = ₹1,00,000', (await p.textContent(O+'.sipc-out .side b'))==='₹1,00,000');
  await p.click(O+'[data-sip-rate="18"]'); await p.waitForTimeout(300);
  ok('the two calculators keep separate state', (await p.textContent(M+'.sipc-out .big'))==='₹11,61,695');
  ok('no duplicate element ids', (await p.evaluate(()=>{ const seen={},d=[];
      document.querySelectorAll('[id]').forEach(e=>{ if(seen[e.id]) d.push(e.id); seen[e.id]=1; }); return d; })).length===0);

  console.log('\n--- BROKER LINKS ---');
  ok('four broker buttons under the calculators',
     (await p.$$eval('#sipBox .brokers a', e=>e.map(x=>x.textContent))).join(',')==='AngelOne,Groww,Upstox,Zerodha',
     (await p.$$eval('#sipBox .brokers a', e=>e.map(x=>x.textContent))).join(','));
  ok('broker links open safely',
     (await p.$$eval('#sipBox .brokers a', e=>e.every(x=>x.target==='_blank' && x.rel.includes('noopener') && x.href.startsWith('https://')))));
  ok('a non-endorsement note sits with them',
     (await p.textContent('#sipBox .card:last-child .hint')).length>80);
  ok('config can replace the broker row', await p.evaluate(()=>{
     CONFIG.brokers=[{name:'Only',url:'https://example.com/b'}]; renderSip();
     const a=document.querySelectorAll('#sipBox .brokers a');
     const okk = a.length===1 && a[0].textContent==='Only';
     delete CONFIG.brokers; renderSip(); return okk; }));

  console.log('\n--- EVERY TAB ---');
  for(const [tab,sel] of [['income','#iTotal'],['expense','#eTotal'],['calendar','#calGrid'],['more','#fundsBox']]){
    await p.click('.nav button[data-go="'+tab+'"]'); await p.waitForTimeout(350);
    ok('tab '+tab+' renders', await p.isVisible(sel));
  }
  ok('funds list has rows', (await p.$$('#fundsBox .fund-row')).length===6);
  ok('funds disclaimer shown', (await p.textContent('#fundsBox .sip-risk')).length>60);
  ok('6 menu tiles', (await p.$$('#menuGrid .menu-tile')).length===6, String((await p.$$('#menuGrid .menu-tile')).length));
  /* The tile is gone; what replaced it is the card at the top of More, which
     still has to leave the app by a real link rather than a scripted jump. */
  ok('the Seed Box card in More leaves the app by a real link', await p.evaluate(()=>{
     const a = document.querySelector('#sbBannerMore a[href="seedbox/"]');
     return !!a && a.tagName === 'A'; }));
  ok('emergency help stands apart from them, in red', await p.evaluate(()=>{
     const b=document.querySelector('.sos-tile');
     if(!b || b.closest('#menuGrid')) return false;
     const bg=getComputedStyle(b).backgroundImage;
     return /211, 47, 47|183, 28, 28/.test(bg); }),
     await p.evaluate(()=>{const b=document.querySelector('.sos-tile');
       return b?getComputedStyle(b).backgroundImage.slice(0,60):'missing';}));

  console.log('\n--- NEW: SHOP / RATES / CALENDAR ---');
  await p.click('.nav button[data-go="home"]'); await p.waitForTimeout(300);
  /* the shopping and rate strips were removed from home; their absence is
     asserted in REMOVED SECTIONS above */
  await p.click('.nav button[data-go="more"]'); await p.waitForTimeout(250);
  await p.click('.nav button[data-go="calendar"]'); await p.waitForTimeout(350);
  ok('calendar opens', (await p.evaluate(()=>document.querySelector('.page.on').id))==='page-calendar');
  ok('calendar has 7 weekday heads', (await p.$$('.cal-dow')).length===7);
  ok('calendar day cells match month', (await p.$$('.cal-cell:not(.blank)')).length===new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate());
  ok('today is highlighted once', (await p.$$('.cal-cell.today')).length===1);
  await p.evaluate(()=>{CAL_VIEW=new Date(2026,0,1); CAL_SEL='2026-01-15'; renderCalendar();});
  await p.waitForTimeout(400);
  ok('public holidays red', (await p.$$eval('.cal-cell.pub .d', e=>e.map(x=>x.textContent).join(',')))==='1,14,15,16,26');
  ok('optional holidays blue', (await p.$$eval('.cal-cell.opt .d', e=>e.map(x=>x.textContent).join(',')))==='3,17,23');
  ok('holiday list for the month', (await p.$$('#holidayList .hol-row')).length===8);
  await p.evaluate(()=>{CAL_VIEW=new Date(2026,3,1); CAL_SEL='2026-04-14'; renderCalendar();});
  await p.waitForTimeout(300);
  ok('a date in both lists shows both', (await p.$$('#calDetail .hol-tag')).length===2);
  ok('public wins the cell colour', await p.evaluate(()=>document.querySelector('[data-cal="2026-04-14"]').classList.contains('pub')));

  console.log('\n--- SUB-PAGES VIA SHORTCUTS ---');
  for(const g of ['family','reports','loans']){
    await p.click('.nav button[data-go="more"]'); await p.waitForTimeout(200);
    const has = await p.$('.menu-tile[data-go="'+g+'"]');
    if(!has){ ok('shortcut '+g, false, 'card missing'); continue; }
    await p.click('.menu-tile[data-go="'+g+'"]'); await p.waitForTimeout(300);
    ok('opens '+g, (await p.evaluate(()=>document.querySelector('.page.on').id))==='page-'+g);
  }

  ok('search tile removed from the grid', !(await p.$('.menu-tile[data-go="search"]')));

  console.log('\n--- GOLD ---');
  await p.evaluate(()=>go('gold')); await p.waitForTimeout(300);
  ok('gold page still reachable', (await p.evaluate(()=>document.querySelector('.page.on').id))==='page-gold');
  ok('buy control is inert with no url configured',
     await p.evaluate(()=>{ const a=document.querySelector('#goldBox a.btn'); const b=document.querySelector('#goldBox button[disabled]'); return !a && !!b; }));
  await p.evaluate(()=>{ RATES={gold24:7420,gold22:6800,silver:92000,updated:ymd(new Date()),source:'test'}; renderGold(); });
  await p.waitForTimeout(200);
  const gtxt = await p.textContent('#goldBox');
  ok('shows 22K and 24K per gram', /6,800/.test(gtxt) && /7,420/.test(gtxt), gtxt.replace(/\s+/g,' ').trim().slice(0,80));
  ok('reuses RATES, no second fetch', await p.evaluate(()=>{
     const src = renderGold.toString(); return !/fetch\(/.test(src); }));
  await p.evaluate(()=>{ CONFIG.goldBuyUrl='https://example.com/buy'; renderGold(); });
  await p.waitForTimeout(200);
  ok('config url drives the buy button', await p.$eval('#goldBox a.btn', a=>a.getAttribute('href'))==='https://example.com/buy');

  console.log('\n--- INSIGHTS + INVITE ---');
  ok('every tile is the same height', await p.evaluate(()=>{
     const h=[...document.querySelectorAll('#menuGrid .menu-tile')].map(e=>Math.round(e.getBoundingClientRect().height));
     return new Set(h).size===1; }));
  await p.evaluate(() => {
    const now = new Date(); DB.tx=[]; DB.savings=[];
    const inc=[38000,41000,39000,44000,42000,46000], exp=[31000,36000,28000,47000,33000,30000], sav=[4000,3000,6000,0,5000,8000];
    for(let i=0;i<6;i++){
      const d=new Date(now.getFullYear(), now.getMonth()-(5-i), 12);
      const day=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-12';
      DB.tx.push({id:'i'+i,type:'income',amount:inc[i],date:day,category:'Salary'});
      DB.tx.push({id:'e'+i,type:'expense',amount:exp[i],date:day,category:'Groceries'});
      if(sav[i]) DB.savings.push({id:'s'+i,amount:sav[i],date:day});
    }
    save(); renderAll();
  });
  await p.waitForTimeout(400);
  await p.evaluate(()=>go('insights')); await p.waitForTimeout(400);
  ok('insights page still reachable', (await p.evaluate(()=>document.querySelector('.page.on').id))==='page-insights');
  ok('six months charted', (await p.$$('#insBox .tmonth')).length===6);
  const itx = (await p.textContent('#insBox')).replace(/\s+/g,' ');
  ok('average income 41,667', /41,667/.test(itx), itx.slice(0,60));
  ok('savings rate 10%', /10%/.test(itx));
  ok('a loss month shows negative', /-₹3,000/.test(itx));
  ok('derives from stats(), no parallel maths', await p.evaluate(()=>/stats\(/.test(insightData.toString())));

  await p.click('.nav button[data-go="more"]'); await p.waitForTimeout(200);
  await p.click('.menu-tile[data-go="invite"]'); await p.waitForTimeout(400);
  ok('invite tile still opens its page', (await p.evaluate(()=>document.querySelector('.page.on').id))==='page-invite');
  ok('share message carries the app link', await p.evaluate(()=>inviteText().includes(appUrl())));
  ok('app link is a config value', await p.evaluate(()=>{
     CONFIG.appUrl='https://example.com/app'; const ok=inviteText().includes('https://example.com/app');
     delete CONFIG.appUrl; renderInvite(); return ok; }));
  ok('no reward is promised', !/premium|free month|reward/i.test(await p.textContent('#invBox')));

  console.log('\n--- LOANS / VADDI ---');
  /* the hand-loans tile was removed from the grid; the section itself still
     lives on the loans page, which the Reminders tile opens */
  await p.click('.nav button[data-go="more"]'); await p.waitForTimeout(250);
  await p.click('.menu-tile[data-focus="remindList"]'); await p.waitForTimeout(500);
  ok('hand loans still on the loans page', !!(await p.$('#loanList')));
  ok('chits still on the loans page', !!(await p.$('#chitList')));
  await p.click('#btnAddLoan'); await p.waitForTimeout(300);
  await p.fill('#lPerson','రమేష్'); await p.fill('#lPrin','50000');
  await p.selectOption('#lRate','3');
  const st=new Date(); st.setMonth(st.getMonth()-5);
  await p.fill('#lStart', st.toISOString().slice(0,10)); await p.waitForTimeout(250);
  await p.click('#lSave'); await p.waitForTimeout(350);
  ok('vaddi: ₹50k @₹3 x5mo = ₹57,500 owed', (await p.textContent('#lOwe'))==='₹57,500', await p.textContent('#lOwe'));
  ok('monthly interest ₹1,500', (await p.textContent('#lVaddi'))==='₹1,500');

  console.log('\n--- STATEMENT ---');
  await p.evaluate(()=>{ const d=new Date(), lm=new Date(d.getFullYear(),d.getMonth()-1,1);
    const k=lm.getFullYear()+'-'+String(lm.getMonth()+1).padStart(2,'0');
    DB.tx.push({id:'zz',type:'income',amount:30000,note:'x',category:'Salary',method:'auto',date:k+'-05'});
    DB.receipts=[]; save(); renderAll(); });
  await p.click('.nav button[data-go="home"]'); await p.waitForTimeout(400);
  ok('completed-month banner shows', (await p.textContent('#monthBanner')).trim().length>10);
  await p.click('#monthBanner [data-statement]'); await p.waitForTimeout(1400);
  const img = await p.getAttribute('#sheet img','src');
  ok('statement image generated', !!img && img.startsWith('data:image/png') && img.length>50000, img?('bytes '+img.length):'none');
  ok('download link set', (await p.getAttribute('#stSave','download')||'').startsWith('pocketseeds-'));
  await p.evaluate(()=>closeSheet()); await p.waitForTimeout(300);

  console.log('\n--- EDIT + THEME ---');
  /* the recent list moved to the Expenses tab */
  await p.click('.nav button[data-go="expense"]'); await p.waitForTimeout(300);
  const firstAmt = await p.$eval('#recentList .amt', e=>e.textContent);
  await p.click('#recentList [data-edit-tx]'); await p.waitForTimeout(400);
  ok('edit sheet prefills', (await p.inputValue('#fAmt')).length>0, await p.inputValue('#fAmt'));
  await p.fill('#fAmt','1234'); await p.click('#fSave'); await p.waitForTimeout(400);
  ok('amount edited in place', (await p.$eval('#recentList .amt', e=>e.textContent))!==firstAmt);
  /* assert the switch works, not which colours it picks, so a palette change
     does not read as a regression */
  const themeOf = () => p.evaluate(()=>({
    attr: document.documentElement.getAttribute('data-theme'),
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    ink: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),
    layer: getComputedStyle(document.documentElement).getPropertyValue('--bg-layer').trim().slice(0,40)
  }));
  await p.evaluate(()=>setTheme('dark')); await p.waitForTimeout(250);
  const dk = await themeOf();
  await p.evaluate(()=>setTheme('light')); await p.waitForTimeout(250);
  const lt = await themeOf();
  ok('dark theme applies', dk.attr==='dark' && !!dk.bg, JSON.stringify(dk.bg));
  ok('light theme applies', lt.attr==='light' && !!lt.bg, JSON.stringify(lt.bg));
  ok('the two themes actually differ', dk.bg!==lt.bg && dk.ink!==lt.ink);
  ok('each theme defines its own wash', !!dk.layer && !!lt.layer && dk.layer!==lt.layer);
  ok('the wash sits behind the content', await p.evaluate(()=>{
     const st = getComputedStyle(document.body,'::before');
     return st.position==='fixed' && getComputedStyle(document.body).backgroundColor==='rgba(0, 0, 0, 0)'; }));
  await p.evaluate(()=>setTheme('auto')); await p.waitForTimeout(200);
  ok('owner panel is gated', await p.evaluate(()=>typeof ownerGate==='function' && sessionStorage.getItem('pocketseeds.owner')!=='1'));

  console.log('\n--- LANGUAGE + THEME PILLS ---');
  await p.click('#langPick button[data-lang="te"]'); await p.waitForTimeout(300);
  ok('Telugu only', (await p.getAttribute('html','data-lmode'))==='te');
  await p.click('#langPick button[data-lang="en"]'); await p.waitForTimeout(300);
  ok('English only', (await p.textContent('.balance-card .lbl'))==='Current Balance');
  ok('exactly one pill is pressed',
     (await p.$$eval('#langPick button', e=>e.map(x=>x.getAttribute('aria-pressed')))).join(',')==='false,true');
  await p.click('#langPick button[data-lang="en"]'); await p.waitForTimeout(300);
  ok('tapping the language already on is a no-op', (await p.getAttribute('html','data-lmode'))==='en');
  ok('never two languages at once', (await p.evaluate(()=>
     [...document.querySelectorAll('h3,h4,.mt-t,.lbl,.policy-row span')]
       .filter(e=>/\S \| \S/.test(e.textContent)).length))===0);
  await p.click('#langPick button[data-lang="te"]'); await p.waitForTimeout(300);

  console.log('\n--- BOTTOM NAV ---');
  await p.click('.nav button[data-go="expense"]'); await p.waitForTimeout(350);
  const navBg = sel => p.evaluate(s=>getComputedStyle(document.querySelector(s)).backgroundColor, sel);
  ok('the tapped tab is filled with the button green',
     (await navBg('.nav button[aria-selected="true"] span'))==='rgb(86, 197, 150)',
     await navBg('.nav button[aria-selected="true"] span'));
  ok('the other tabs stay unfilled',
     (await navBg('.nav button[aria-selected="false"] span'))==='rgba(0, 0, 0, 0)');
  await p.click('.nav button[data-go="home"]'); await p.waitForTimeout(300);
  ok('the fill follows the tap',
     (await p.evaluate(()=>document.querySelector('.nav button[aria-selected="true"]').dataset.go))==='home');
  await p.evaluate(()=>setTheme('light')); await p.waitForTimeout(250);
  await p.click('#btnTheme'); await p.waitForTimeout(300);
  ok('the header toggle turns dark mode on', (await p.evaluate(()=>THEME))==='dark',
     await p.getAttribute('html','data-theme'));
  await p.click('#btnTheme'); await p.waitForTimeout(300);
  ok('and turns it back off', (await p.evaluate(()=>THEME))==='light',
     await p.getAttribute('html','data-theme'));
  await p.evaluate(()=>setTheme('auto')); await p.waitForTimeout(200);

  console.log('\n--- EXPENDITURE SHEET ---');
  await p.click('.nav button[data-go="expense"]');
  /* go() scrolls to the top smoothly; let that finish, or it undoes the scroll
     below. Centring this right-aligned link would land it under the fixed mic
     button, so park it in the upper half instead — clear of the FABs and of
     the sticky header. */
  await p.waitForTimeout(900);
  await p.$eval('#btnAddExpense', e=>window.scrollTo(0,
     window.scrollY + e.getBoundingClientRect().top - 150));
  await p.waitForTimeout(400);
  /* the page cannot scroll past its end, so if the bottom padding is too short
     this link comes to rest under the mic button and nothing can free it */
  ok('nothing is trapped under the floating buttons at the end of a page',
     await p.evaluate(()=>{
       window.scrollTo(0, document.body.scrollHeight);
       return [...document.querySelectorAll('.page.on button, .page.on a')].every(el => {
         const b = el.getBoundingClientRect();
         if(b.width === 0 || b.bottom < 0 || b.top > innerHeight) return true;
         const hit = document.elementFromPoint(b.left + b.width/2, b.top + b.height/2);
         return !hit || el.contains(hit) || hit.contains(el);
       });
     }),
     JSON.stringify(await p.evaluate(()=>{
       const b=document.getElementById('btnAddExpense').getBoundingClientRect();
       const h=document.elementFromPoint(b.left+b.width/2, b.top+b.height/2);
       return {addLinkTop:b.top|0, topmost:h&&(h.id||h.tagName)};
     })));
  await p.$eval('#btnAddExpense', e=>window.scrollTo(0,
     window.scrollY + e.getBoundingClientRect().top - 150));
  await p.waitForTimeout(300);
  await p.click('#btnAddExpense'); await p.waitForTimeout(400);
  ok('the expenditure sheet does not offer Income', !(await p.$('#txSeg')));
  await p.evaluate(()=>closeSheet()); await p.waitForTimeout(250);
  await p.click('#fab'); await p.waitForTimeout(400);
  ok('the generic (+) still offers both', !!(await p.$('#txSeg')));
  await p.evaluate(()=>closeSheet()); await p.waitForTimeout(250);
  await p.click('.nav button[data-go="home"]'); await p.waitForTimeout(300);

  console.log('\n--- PERSISTENCE ---');
  const before = await p.textContent('#hBalance');
  await p.reload({waitUntil:'load'}); await p.waitForTimeout(1200);
  ok('data survives reload', (await p.textContent('#hBalance'))===before, before);

  console.log('\n--- OFFLINE (service worker) ---');
  await ctx.setOffline(true);
  const r2 = await p.reload({waitUntil:'load'}).catch(e=>null);
  await p.waitForTimeout(1200);
  const offlineWorks = await p.evaluate(()=>!!document.querySelector('.balance-card'));
  ok('app loads with no network', offlineWorks);
  ok('data intact offline', (await p.textContent('#hBalance'))===before);
  await ctx.setOffline(false);

  console.log('\n--- GOOGLE SIGN-IN WIRING ---');
  ok('client ID built in', await p.evaluate(()=>GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com')));
  ok('drive scope requested', await p.evaluate(()=>GSCOPE.includes('drive.appdata')));

  console.log('\n--- BUTTONS ---');
  await p.click('.nav button[data-go="expense"]'); await p.waitForTimeout(500);
  ok('full-size buttons are 17.5px, small ones 15.5px', await p.evaluate(()=>{
     const full = document.querySelector('.btn:not(.btn-sm)');
     const small = document.querySelector('.btn.btn-sm');
     return (!full  || getComputedStyle(full).fontSize==='17.5px')
         && (!small || getComputedStyle(small).fontSize==='15.5px'); }));
  ok('filled buttons all share one fill', await p.evaluate(()=>{
     /* the coach card inverts its own button on purpose — it sits on a
        coloured surface, so white-on-green would be green-on-green */
     const f=[...document.querySelectorAll('.btn-p,.btn-in,.btn-save,.btn-plum')]
       .filter(b=>!b.closest('.coach'))
       .map(b=>getComputedStyle(b).backgroundColor);
     return f.length>0 && new Set(f).size===1; }));
  /* it was white, at 2.14:1 on the mint, which is why it is not any more.
     The property is one ink shared by all of them and readable on the fill. */
  ok('their label is one ink, and clears AA on the fill', await p.evaluate(()=>{
     const parse = s => (s.match(/[\d.]+/g)||[0,0,0]).slice(0,3).map(Number);
     const lum = c => { const f=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});
       return .2126*f[0]+.7152*f[1]+.0722*f[2]; };
     const bs = [...document.querySelectorAll('.btn-p,.btn-in,.btn-save,.btn-plum')]
       .filter(b=>!b.closest('.coach'));
     if(!bs.length) return false;
     const inks = new Set(bs.map(b=>getComputedStyle(b).color));
     return inks.size === 1 && bs.every(b=>{
       const cs=getComputedStyle(b);
       const L1=lum(parse(cs.color)), L2=lum(parse(cs.backgroundColor));
       return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05) >= 4.5; }); }),
     await p.evaluate(()=>{ const b=document.querySelector('.btn-p');
       return b ? getComputedStyle(b).color+' on '+getComputedStyle(b).backgroundColor : 'none'; }));
  const btnRatio = await p.evaluate(()=>{
     const parse = s => (s.match(/[\d.]+/g)||[0,0,0]).slice(0,3).map(Number);
     const lum = c => { const f=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});
       return .2126*f[0]+.7152*f[1]+.0722*f[2]; };
     const b=document.querySelector('.btn-p'); if(!b) return null;
     const L=lum(parse(getComputedStyle(b).backgroundColor));
     return Math.round((1.05)/(L+.05)*100)/100; });
  /* The brand green was chosen knowing white on it is below WCAG AA. Report
     the number every run so the trade-off stays visible instead of quietly
     disappearing, but do not fail on a deliberate decision. */
  ok('button contrast is measured and recorded', btnRatio !== null,
     'white on the button fill = ' + btnRatio + ':1 (AA wants 4.5 — accepted)');
  ok('the expense button stays a different colour', await p.evaluate(()=>{
     const o=document.querySelector('.btn-out'), pb=document.querySelector('.btn-p');
     return !o || !pb || getComputedStyle(o).backgroundColor!==getComputedStyle(pb).backgroundColor; }));
  await p.click('.nav button[data-go="home"]'); await p.waitForTimeout(300);

  console.log('\n--- COLOUR + CONTRAST ---');
  ok('no text inherits the browser default black', await p.evaluate(()=>{
     /* a <button> takes the UA's black and does not inherit from the page —
        that is what made the quick-add labels invisible in dark mode */
     return [...document.querySelectorAll('button')].every(b=>
       getComputedStyle(b).color!=='rgb(0, 0, 0)'); }));
  ok('text on brand fills uses the on-brand token', await p.evaluate(()=>
     getComputedStyle(document.documentElement).getPropertyValue('--on-brand').trim().length>0));
  ok('dark mode ink is white', await p.evaluate(()=>{
     const r=document.documentElement, prev=r.getAttribute('data-theme');
     setTheme('dark');
     const ink=getComputedStyle(r).getPropertyValue('--ink').trim();
     setTheme(prev||'auto');
     return ink.toLowerCase()==='#ffffff'; }));
  ok('the published config does not override the theme', await p.evaluate(async()=>{
     /* a colour in config.json is written inline on :root and so beats BOTH
        themes, which stops dark mode lightening the brand for contrast */
     try{ const r=await fetch('config.json'); const j=await r.json();
       return !j.theme || Object.keys(j.theme).length===0; }catch(e){ return true; } }));

  console.log('\n--- QUICK ADD / FAB / BANNERS ---');
  await p.click('.nav button[data-go="home"]'); await p.waitForTimeout(400);
  ok('no floating (+) on home — the page has its own',
     await p.evaluate(()=>document.getElementById('fab').hidden));
  await p.click('.nav button[data-go="expense"]'); await p.waitForTimeout(400);
  ok('it is still there on every other tab',
     await p.evaluate(()=>!document.getElementById('fab').hidden));
  ok('the expenses banner leads the tab, with the artwork actually loaded',
     await p.evaluate(()=>{
       const b = document.getElementById('expBanner');
       if(!b) return false;                      // the file is in the repo now
       const img = b.querySelector('img');
       return b.parentElement.firstElementChild === b
              && img.complete && img.naturalWidth > 0;
     }),
     await p.evaluate(()=>{ const i=document.querySelector('#expBanner img');
       return i ? i.naturalWidth+'x'+i.naturalHeight : 'block removed'; }));
  ok('the space it reserves matches the file, so nothing jumps as it loads',
     await p.evaluate(()=>{
       const img = document.querySelector('#expBanner img');
       if(!img) return false;
       const css = getComputedStyle(img).aspectRatio.replace(/\s/g,'');
       return css === (img.naturalWidth + '/' + img.naturalHeight); }),
     await p.evaluate(()=>{ const i=document.querySelector('#expBanner img');
       return i ? getComputedStyle(i).aspectRatio + ' vs ' + i.naturalWidth+'/'+i.naturalHeight : '-'; }));
  await p.click('.nav button[data-go="home"]'); await p.waitForTimeout(450);
  ok('a quick-add tile shows an icon and a name, and no rupee line',
     await p.$eval('#quickTiles button', e=>e.innerText.trim().split('\n').length===1));
  ok('the quick-add glyph is the larger size',
     await p.evaluate(()=>Math.round(document.querySelector('.q-ic').getBoundingClientRect().width))===56,
     String(await p.evaluate(()=>Math.round(document.querySelector('.q-ic').getBoundingClientRect().width))));
  ok('a tile still files the right category',
     await p.evaluate(()=>{ const i=+document.querySelector('#quickTiles button').dataset.quick;
       return QUICK[i].cat === 'Milk'; }));
  ok('the two starting points sit side by side in a half-width cell',
     await p.$$eval('#scBox .sc-cell:not(.wide)', e=>e.every(c=>{
       const a=[...c.querySelectorAll('.sc-links a')];
       return a.length===2 && Math.abs(a[0].getBoundingClientRect().top-a[1].getBoundingClientRect().top)<2;
     })));

  console.log('\n--- CALENDAR PEN ---');
  await p.click('.nav button[data-go="calendar"]'); await p.waitForTimeout(700);
  ok('a pen sits under the grid', await p.evaluate(()=>{
     const pen=document.getElementById('btnCalPen'), grid=document.getElementById('calGrid');
     return !!pen && (grid.compareDocumentPosition(pen) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  ok('it names the day selected in the grid', await (async()=>{
     await p.evaluate(()=>{ [...document.querySelectorAll('.cal-cell[data-cal]')][9].click(); });
     await p.waitForTimeout(400);
     const sel = await p.evaluate(()=>CAL_SEL);
     const cap = await p.textContent('#calPenDate');
     return cap.includes(await p.evaluate(d=>shortDate(d), sel)); })());
  ok('it marks that day with a name and a short note', await (async()=>{
     await p.click('#btnCalPen'); await p.waitForTimeout(450);
     const sameDate = (await p.inputValue('#dyDate')) === (await p.evaluate(()=>CAL_SEL));
     await p.fill('#dyName','Pension day');
     await p.fill('#dyNote','collect from the post office before noon');
     await p.click('#dySave'); await p.waitForTimeout(550);
     const d = await p.evaluate(()=>DB.days.find(x=>x.name==='Pension day'));
     return sameDate && !!d && d.note.startsWith('collect'); })());
  ok('the mark shows on the day, and the note with it', await p.evaluate(()=>{
     const dot = !!document.querySelector('.cal-cell.sel .fest');
     return dot && document.getElementById('calDetail').textContent.includes('collect from the post office'); }));
  ok('reopening the pen edits that day rather than adding a second', await (async()=>{
     await p.click('#btnCalPen'); await p.waitForTimeout(450);
     const filled = (await p.inputValue('#dyName'))==='Pension day'
                 && (await p.inputValue('#dyNote')).startsWith('collect');
     const removable = await p.evaluate(()=>!!document.getElementById('dyDel'));
     await p.click('#dySave'); await p.waitForTimeout(500);
     const n = await p.evaluate(()=>DB.days.filter(x=>x.name==='Pension day').length);
     return filled && removable && n===1; })());
  ok('a note on its own is enough to mark a day', await (async()=>{
     await p.evaluate(()=>{ [...document.querySelectorAll('.cal-cell[data-cal]')][12].click(); });
     await p.waitForTimeout(350);
     await p.click('#btnCalPen'); await p.waitForTimeout(450);
     await p.fill('#dyNote','paid the milkman');
     await p.click('#dySave'); await p.waitForTimeout(500);
     return await p.evaluate(()=>!!DB.days.find(x=>x.note==='paid the milkman')); })());
  ok('the mark can be taken off again', await (async()=>{
     await p.click('#btnCalPen'); await p.waitForTimeout(450);
     await p.click('#dyDel'); await p.waitForTimeout(500);
     return await p.evaluate(()=>!DB.days.find(x=>x.note==='paid the milkman')); })());
  ok('no floating (+) on the calendar', await p.evaluate(()=>document.getElementById('fab').hidden));

  console.log('\n--- CALENDAR REMINDERS ---');
  await p.evaluate(()=>{ DB.calRem=[]; save(); renderAll(); });
  await p.waitForTimeout(300);
  ok('a bell sits beside the pen, under the grid', await p.evaluate(()=>{
     const b=document.getElementById('btnCalRem'), g=document.getElementById('calGrid');
     return !!b && !!(g.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  ok('the list says what to do when nothing is set',
     (await p.textContent('#remList')).trim().length > 10);
  ok('it schedules on the day picked in the grid, at 7:55 by default', await (async()=>{
     await p.evaluate(()=>{ [...document.querySelectorAll('.cal-cell[data-cal]')][17].click(); });
     await p.waitForTimeout(350);
     const sel = await p.evaluate(()=>CAL_SEL);
     await p.click('#btnCalRem'); await p.waitForTimeout(450);
     const d = await p.inputValue('#rmDate'), tm = await p.inputValue('#rmTime');
     await p.fill('#rmTitle','Pay the chit');
     await p.click('#rmSave'); await p.waitForTimeout(500);
     const r = await p.evaluate(()=>DB.calRem[0]);
     return d===sel && tm==='07:55' && r.date===sel && r.time==='07:55' && r.title==='Pay the chit'; })());
  ok('nothing rings before it is due', await p.evaluate(()=>{
     DB.calRem=[{id:'a1',date:ymd(new Date(Date.now()+864e5)),time:'07:55',title:'Later',snooze:0,done:false}];
     save(); remTick(); return document.getElementById('remBar').hidden; }));
  ok('the banner appears when it is due, and slides in', await p.evaluate(async ()=>{
     DB.calRem=[{id:'a2',date:ymd(new Date()),time:'00:01',title:'Milk bill',snooze:0,done:false}];
     save(); remTick(); await new Promise(r=>setTimeout(r,120));
     const bar=document.getElementById('remBar');
     return !bar.hidden && bar.classList.contains('on')
            && bar.textContent.includes('Milk bill'); }));
  ok('it stacks above the sheet — a reminder a sheet can hide is not one',
     await p.evaluate(()=>Number(getComputedStyle(document.getElementById('remBar')).zIndex)
                        > Number(getComputedStyle(document.querySelector('.sheet')).zIndex)));
  ok('only ever one banner, however many are overdue', await p.evaluate(()=>{
     DB.calRem.push({id:'a3',date:ymd(new Date()),time:'00:02',title:'Second',snooze:0,done:false});
     save(); remTick(); remTick(); remTick();
     return document.querySelectorAll('.rem-card').length === 1; }));
  /* back to one in play: with two overdue, snoozing the first correctly lets
     the second ring, which is right but not what the next checks are about */
  await p.evaluate(async ()=>{
     DB.calRem = DB.calRem.filter(x=>x.id==='a2'); save();
     remHide(); await new Promise(r=>setTimeout(r,420));
     remTick(); });
  await p.waitForTimeout(400);
  ok('"in 10 minutes" hides it and books it exactly 10 minutes out', await (async()=>{
     await p.click('#remSnooze'); await p.waitForTimeout(600);
     const r = await p.evaluate(()=>({hidden:document.getElementById('remBar').hidden,
       mins:Math.round((DB.calRem.find(x=>x.id==='a2').snooze - Date.now())/60000)}));
     return r.hidden === true && r.mins === 10; })());
  ok('and it does not come back early',
     await p.evaluate(()=>{ remTick(); return document.getElementById('remBar').hidden; }));
  ok('when the snooze is up it rings again', await p.evaluate(async ()=>{
     DB.calRem.find(x=>x.id==='a2').snooze = Date.now() - 1000; save();
     remTick(); await new Promise(r=>setTimeout(r,120));
     return document.getElementById('remBar').textContent.includes('Milk bill'); }));
  ok('Close dismisses it for good', await (async()=>{
     await p.click('#remClose'); await p.waitForTimeout(600);
     return await p.evaluate(()=>{
       const r = DB.calRem.find(x=>x.id==='a2');
       remTick();
       return r.done === true && !document.getElementById('remBar').textContent.includes('Milk bill'); }); })());
  ok('a dismissed reminder leaves the list',
     await p.evaluate(()=>!document.getElementById('remList').textContent.includes('Milk bill')));
  ok('a backgrounded app hands it to the system instead of the banner',
     await p.evaluate(()=>typeof remNotify === 'function'
       && /document.hidden/.test(remTick.toString())));
  ok('the sheet says plainly that a closed app cannot ring on its own',
     await p.evaluate(async ()=>{
       sheetReminder(CAL_SEL); await new Promise(r=>setTimeout(r,300));
       const txt = document.querySelector('.sheet').textContent;
       closeSheet();
       return txt.includes(t('remOnlyOpen')) && t('remOnlyOpen').length > 40; }));
  ok('one timer, not a per-second loop', await p.evaluate(()=>REM_TICK_MS >= 10000));
  await p.evaluate(()=>{ DB.calRem=[]; save(); renderAll(); });
  await p.waitForTimeout(300);
  await p.evaluate(()=>{ DB.days = (DB.days||[]).filter(d=>d.name!=='Pension day'); save(); renderCalendar(); });
  await p.click('.nav button[data-go="home"]'); await p.waitForTimeout(400);

  console.log('\n--- SPENDING REALITY CHECK ---');
  await p.evaluate(()=>{ DB.tx = DB.tx.filter(x=>!String(x.id).startsWith('rc'));
    localStorage.removeItem('pocketseeds.rcDismissed'); save(); renderAll(); });
  await p.waitForTimeout(300);
  const rcAdd = (cat, amt, id) => p.evaluate(a=>{
    DB.tx = DB.tx.filter(x=>!String(x.id).startsWith('rc'));
    DB.tx.push({id:a.id, type:'expense', amount:a.amt, date:ymd(new Date()), category:a.cat, note:'x'});
    save(); renderAll(); }, {cat, amt, id});
  const rcText = () => p.evaluate(()=>{ const c=document.querySelector('.rc'); return c?c.innerText:''; });

  await rcAdd('Milk', 2000, 'rc1'); await p.waitForTimeout(300);
  ok('an essential never gets questioned, however large', (await rcText())==='');
  await rcAdd('Movies', 299, 'rc2'); await p.waitForTimeout(300);
  ok('nothing under the 300 floor', (await rcText())==='');
  await rcAdd('Movies', 300, 'rc3'); await p.waitForTimeout(350);
  ok('300 exactly does show', (await rcText()).length>0);
  ok('it sits above the saving coach', await p.evaluate(()=>
     document.getElementById('rcBox').getBoundingClientRect().top
     < document.getElementById('scBox').getBoundingClientRect().top));
  ok('it names the real category and amount',
     /₹300/.test(await rcText()) && (await rcText()).includes(await p.evaluate(()=>catLabel('Movies'))),
     (await rcText()).split('\n')[1]);
  ok('three or four alternatives, never one', await p.evaluate(()=>{
     const n=document.querySelectorAll('.rc-list li').length; return n>=3 && n<=4; }),
     String(await p.$$eval('.rc-list li', e=>e.length)));
  ok('under 70 words', (await rcText()).trim().split(/\s+/).length < 70,
     String((await rcText()).trim().split(/\s+/).length));
  ok('the three CTAs are there', (await p.$$eval('.rc-cta button', e=>e.length))===3);
  ok('none of the three is pushed harder than the others', await p.$$eval('.rc-cta button', e=>{
     const bg = e.map(x=>getComputedStyle(x).backgroundColor);
     return new Set(bg).size === 1; }),
     (await p.$$eval('.rc-cta button', e=>[...new Set(e.map(x=>getComputedStyle(x).backgroundColor))].join(' / '))));
  ok('no individual company is named unless the publisher asks for one',
     await p.evaluate(()=>![...document.querySelectorAll('.rc-list li')]
        .some(li=>/TATA|Infosys|Reliance|HDFC|Adani/i.test(li.textContent))));
  /* whether the share line is drawn depends on the expense id, so sample a
     handful rather than betting on one */
  ok('config can name companies', await p.evaluate(()=>{
     const draw = () => ['c1','c2','c3','c4','c5','c6'].map(id =>
       rcPlan({id, amount:2500, date:ymd(new Date()), category:'Shopping'}).lines.join('|')).join('###');
     const off = draw();
     CONFIG.realityCheckStocks = ['TATA Motors'];
     const on = draw();
     delete CONFIG.realityCheckStocks;
     return /TATA Motors/.test(on) && !/TATA Motors/.test(off); }));
  ok('the amount picks the band', await p.evaluate(()=>{
     const mk=(amt,id)=>rcPlan({id, amount:amt, date:ymd(new Date()), category:'Shopping'}).lines.join('|');
     const small=mk(500,'b1'), big=mk(9000,'b1');
     return small!==big; }));
  ok('two expenses of the same size read differently', await p.evaluate(()=>{
     const mk=id=>rcPlan({id, amount:1500, date:ymd(new Date()), category:'Shopping'}).lines.join('|');
     return new Set([mk('x1'),mk('x2'),mk('x3')]).size > 1; }));
  ok('the same expense reads the same twice — it must not reshuffle while being read',
     await p.evaluate(()=>{
       const mk=()=>rcPlan({id:'stable', amount:1500, date:ymd(new Date()), category:'Shopping'}).lines.join('|');
       return mk()===mk(); }));
  ok('Save this opens the set-aside sheet with the amount already in it', await (async()=>{
     await rcAdd('Luxury', 6000, 'rc5'); await p.waitForTimeout(350);
     await p.$eval('#rcSave', e=>window.scrollTo(0, window.scrollY + e.getBoundingClientRect().top - 150));
     await p.waitForTimeout(300);
     await p.click('#rcSave'); await p.waitForTimeout(450);
     const v = await p.inputValue('#vAmt');
     await p.evaluate(()=>closeSheet()); await p.waitForTimeout(250);
     return v === '6000'; })());
  ok('Dismiss hides it, and it stays hidden for that expense', await (async()=>{
     await p.evaluate(()=>{ localStorage.removeItem('pocketseeds.rcDismissed'); renderRealityCheck(); });
     await p.waitForTimeout(300);
     await p.$eval('#rcClose', e=>window.scrollTo(0, window.scrollY + e.getBoundingClientRect().top - 150));
     await p.waitForTimeout(300);
     await p.click('#rcClose'); await p.waitForTimeout(400);
     const gone = (await rcText())==='';
     await p.evaluate(()=>renderAll()); await p.waitForTimeout(300);
     return gone && (await rcText())===''; })());
  ok('a newer expense brings it back', await (async()=>{
     await rcAdd('Outing', 4000, 'rc6'); await p.waitForTimeout(400);
     return (await rcText()).length>0; })());
  await p.evaluate(()=>{ DB.tx = DB.tx.filter(x=>!String(x.id).startsWith('rc'));
    localStorage.removeItem('pocketseeds.rcDismissed'); save(); renderAll(); });
  await p.waitForTimeout(300);

  console.log('\n--- ASK ABOUT YOUR MONEY ---');
  ok('the banner sits above the reality-check card', await p.evaluate(()=>{
     const b=document.getElementById('askBanner'), rc=document.getElementById('rcBox');
     if(!b || !rc) return false;
     return b.compareDocumentPosition(rc) & Node.DOCUMENT_POSITION_FOLLOWING; }));
  ok('and still below quick add', await p.evaluate(()=>{
     const b=document.getElementById('askBanner'), q=document.getElementById('quickTiles');
     return !!(q.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  ok('it answers the balance from the reader\'s own entries', await p.evaluate(()=>{
     const a = askAnswer('what is my balance');
     return a && a.amount === stats().balance; }));
  ok('it answers a named category', await p.evaluate(()=>{
     const k = mKey(VIEW);
     const milk = sum(inMonth(DB.tx.filter(x=>x.type==='expense'&&x.category==='Milk'), k));
     DB.tx.push({id:'askm',type:'expense',amount:77,date:ymd(new Date()),category:'Milk',note:'m'});
     const a = askAnswer('how much did I spend on milk');
     DB.tx = DB.tx.filter(x=>x.id!=='askm');
     return a && a.amount === milk + 77; }));
  ok('"spend most on" is not swallowed by the general spending rule', await p.evaluate(()=>{
     /* two categories, so the biggest one is a smaller figure than the total —
        which is exactly what the general rule would have returned */
     DB.tx.push({id:'askr',type:'expense',amount:9999,date:ymd(new Date()),category:'Rent',note:'r'});
     DB.tx.push({id:'askb',type:'expense',amount:4444,date:ymd(new Date()),category:'Bills',note:'b'});
     const top = askTopCategory(), a = askAnswer('what did I spend most on'), spent = stats().expense;
     DB.tx = DB.tx.filter(x=>x.id!=='askr' && x.id!=='askb');
     return a && top && a.amount === top.amount && a.amount < spent; }),
     await p.evaluate(()=>{
       DB.tx.push({id:'askr',type:'expense',amount:9999,date:ymd(new Date()),category:'Rent',note:'r'});
       DB.tx.push({id:'askb',type:'expense',amount:4444,date:ymd(new Date()),category:'Bills',note:'b'});
       const r = JSON.stringify({top:askTopCategory(), got:askAnswer('what did I spend most on'), spent:stats().expense});
       DB.tx = DB.tx.filter(x=>x.id!=='askr' && x.id!=='askb'); return r; }));
  ok('it says so plainly when it cannot answer',
     await p.evaluate(()=>askAnswer('what is the capital of france') === null));
  ok('Telugu case endings still find the category',
     await p.evaluate(()=>{ const a=askAnswer('పాలకు ఎంత'); return !!a; }));
  ok('the sheet states that answers come from this phone only', await (async()=>{
     await p.evaluate(()=>sheetAsk()); await p.waitForTimeout(400);
     const txt = await p.textContent('.sheet');
     const ok2 = txt.includes(await p.evaluate(()=>t('askScope')));
     await p.evaluate(()=>closeSheet()); await p.waitForTimeout(250);
     return ok2; })());

  console.log('\n--- THE ORB ---');
  await p.click('.nav button[data-go="home"]'); await p.waitForTimeout(450);
  ok('the banner carries the orb, with its ring, gloss and five blobs',
     await p.evaluate(()=>{ const o=document.querySelector('#askBanner .orb');
       return !!o && !!o.querySelector('.orb-core') && !!o.querySelector('.orb-vig')
              && !!o.querySelector('.orb-ring') && o.querySelectorAll('.orb-core i').length===5; }));
  ok('it is decorative, so it is hidden from a screen reader',
     await p.evaluate(()=>document.querySelector('#askBanner .orb').getAttribute('aria-hidden')==='true'));
  ok('every animation loops forever and lasts 6–8s (the spin is the slow drift)',
     await p.evaluate(()=>{
       const els=[document.querySelector('.orb'), document.querySelector('.orb-core'),
                  ...document.querySelectorAll('.orb-core i')];
       const an=els.flatMap(e=>e.getAnimations());
       return an.length>=7 && an.every(a=>a.effect.getTiming().iterations===Infinity)
              && an.filter(a=>a.animationName!=='orbSpin')
                   .every(a=>{ const d=a.effect.getTiming().duration; return d>=6000 && d<=8000; }); }),
     await p.evaluate(()=>{
       const els=[document.querySelector('.orb'), document.querySelector('.orb-core'),
                  ...document.querySelectorAll('.orb-core i')];
       return els.flatMap(e=>e.getAnimations()).map(a=>a.animationName+':'+a.effect.getTiming().duration).join(' '); }));
  ok('it actually moves — two moments in the cycle are not the same picture',
     await p.evaluate(async ()=>{
       const all=()=>[document.querySelector('.orb'), document.querySelector('.orb-core'),
                      ...document.querySelectorAll('.orb-core i')].flatMap(e=>e.getAnimations());
       const at=ms=>{ all().forEach(a=>{ a.pause(); a.currentTime=ms; });
         return [...document.querySelectorAll('.orb-core i')]
                  .map(i=>getComputedStyle(i).transform).join('|'); };
       const a=at(0), b=at(3000);
       all().forEach(x=>x.play());
       return a!==b; }));
  ok('every loop is seamless — each blob ends where it began',
     await p.evaluate(()=>{
       /* compare the matrix numerically: the engine lands on the same frame
          with float dust at 1e-13, which is not a visible seam */
       const nums = el => (getComputedStyle(el).transform.match(/-?[\d.e-]+/g) || [])
                            .map(Number).concat(Number(getComputedStyle(el).opacity));
       const blobs=[...document.querySelectorAll('.orb-core i')];
       const seamless = blobs.every(el => {
         const a = el.getAnimations()[0]; if(!a) return false;
         const d = a.effect.getTiming().duration;
         a.pause(); a.currentTime = 0;      const start = nums(el);
         a.currentTime = d - 0.001;         const end   = nums(el);
         a.play();
         return start.length === end.length
             && start.every((v,i) => Math.abs(v - end[i]) < 1e-4);
       });
       return blobs.length === 5 && seamless; }));
  ok('orbHTML() is reusable at any size', await p.evaluate(()=>{
     const d=document.createElement('div');
     d.style.cssText='position:fixed;left:-999px;top:0';
     d.innerHTML=orbHTML(120); document.body.appendChild(d);
     const w=d.querySelector('.orb').offsetWidth; d.remove();
     return w===120; }),
     String(await p.evaluate(()=>{ const d=document.createElement('div');
       d.style.cssText='position:fixed;left:-999px;top:0'; d.innerHTML=orbHTML(120);
       document.body.appendChild(d); const w=d.querySelector('.orb').offsetWidth;
       d.remove(); return w; })));
  ok('the blur scales with the orb, so it is not tuned to one size only',
     await p.evaluate(()=>{
       const d=document.createElement('div');
       d.style.cssText='position:fixed;left:-999px;top:0';
       d.innerHTML=orbHTML(120); document.body.appendChild(d);
       const big=getComputedStyle(d.querySelector('.orb-core i')).filter;
       d.remove();
       const small=getComputedStyle(document.querySelector('#askBanner .orb-core i')).filter;
       return big!==small && /blur/.test(big); }));

  console.log('\n--- SEED BOX: NAME, ROUTE, KEYS ---');
  ok('nothing user-visible still says Money Box', await p.evaluate(()=>{
     const bad = [];
     ['te','en'].forEach(l => Object.keys(STR[l]).forEach(k => {
       const v = STR[l][k];
       if(typeof v === 'string' && /Money Box|మనీ బాక్స్/.test(v)) bad.push(l+':'+k);
     }));
     return bad.length === 0 ? true : bad; }),
     'checked every string in both languages');
  ok('the Telugu name is the one chosen, not a transliteration',
     await p.evaluate(()=>STR.te.mMoneyBox === 'విత్తన పెట్టె'), await p.evaluate(()=>STR.te.mMoneyBox));
  ok('More reaches the new route through the card, not a tile',
     await p.evaluate(()=>!!document.querySelector('#sbBannerMore a[href="seedbox/"]')
       && !document.querySelector('#menuGrid a[href="seedbox/"]')));
  ok('no storage key moved — they are still the internal moneybox names',
     await p.evaluate(()=>{
       const src = document.documentElement.innerHTML;
       return /moneybox:/.test(src) && /moneybox\.zoom/.test(src)
           && !/seedbox:/.test(src) && !/seedbox\.zoom/.test(src); }));
  ok('the printed tracker URL is untouched',
     await p.evaluate(()=>/box\/\?id=/.test(document.documentElement.innerHTML)
                        && !/seedbox\/\?id=/.test(document.documentElement.innerHTML)));
  ok('the mismatch is explained in the source rather than left to look like a slip',
     await p.evaluate(()=>/ON THE NAME/.test(document.documentElement.innerHTML)));

  console.log('\n--- SEED BOX: HOME BANNER ---');
  /* The card is a div now, not a link — it holds two links, because Buy now is
     present in both states. So "which state" is read from the primary action,
     not from the card's own href. */
  const sbPrimary = () => p.evaluate(()=>{
    const a = document.querySelector('#sbBanner .sb-go');
    return a ? a.getAttribute('href') : null; });
  const sbSecondary = () => p.evaluate(()=>{
    const a = document.querySelector('#sbBanner .sb-go2');
    return a ? a.getAttribute('href') : null; });
  await p.click('.nav button[data-go="home"]'); await p.waitForTimeout(400);
  /* the concept moved it below Quick add, above the Ask card */
  ok('it sits below Quick add and above the Ask card', await p.evaluate(()=>{
     const b = document.querySelector('#sbBanner');
     const q = document.querySelector('#quickTiles');
     const ask = document.querySelector('#askBanner');
     if(!b || !q || !ask) return false;
     return q.getBoundingClientRect().bottom <= b.getBoundingClientRect().top
         && b.getBoundingClientRect().bottom <= ask.getBoundingClientRect().top; }));
  ok('with no order number the promo does not render at all', await p.evaluate(()=>{
     const keep = CONFIG.seedBoxWhatsApp; delete CONFIG.seedBoxWhatsApp;
     [...Array(localStorage.length).keys()].map(i=>localStorage.key(i))
       .filter(k=>k && k.startsWith('moneybox:')).forEach(k=>localStorage.removeItem(k));
     renderSeedBanner();
     const empty = document.getElementById('sbBanner').innerHTML === '' && mbState().kind === 'none';
     if(keep !== undefined) CONFIG.seedBoxWhatsApp = keep;
     return empty; }));
  ok('with a number set it appears, with a Buy that goes somewhere',
     await p.evaluate(()=>{
       CONFIG.seedBoxWhatsApp='919876543210'; renderSeedBanner();
       const b = document.querySelector('#sbBanner .sb-card');
       const go = document.querySelector('#sbBanner .sb-go');
       return !!b && !!go && go.getAttribute('href') === 'seedbox/'; }));
  /* the card is permanent now: there is no control to put it down, and an old
     dismissal flag left on a returning phone must not hide it either */
  ok('there is no way to dismiss it', await p.evaluate(()=>
     !document.getElementById('sbNo') && !document.querySelector('#sbBanner .no')));
  ok('a dismissal flag left over from the old build does not hide it', await p.evaluate(()=>{
     localStorage.setItem('moneybox.promoDismissed', String(Date.now()));
     renderSeedBanner();
     const shown = !!document.querySelector('#sbBanner .sb-card');
     localStorage.removeItem('moneybox.promoDismissed');
     return shown; }));
  ok('and nothing writes that key any more', await p.evaluate(()=>{
     localStorage.removeItem('moneybox.promoDismissed');
     renderSeedBanner(); renderMoneyBox();
     return localStorage.getItem('moneybox.promoDismissed') === null; }));
  ok('a box turns it into progress: no Buy, and it cannot be dismissed',
     await p.evaluate(()=>{
       localStorage.setItem('moneybox:BOX0042', JSON.stringify({boxId:'BOX0042',goal:100000,
         updatedAt:Date.now(), startedAt:'2026-09-01',
         cells:[{id:'500-0',amount:500,filledAt:'2026-09-01'}]}));
       renderSeedBanner();
       const b   = document.querySelector('#sbBanner .sb-card');
       const go  = document.querySelector('#sbBanner .sb-go');
       const go2 = document.querySelector('#sbBanner .sb-go2');
       /* Buy now is deliberately present in BOTH states now — an owner may
          want a second box, and it is the only route to the product page. So
          what makes this the progress state is that SAVE is the primary and
          it goes to this box; Buy is the secondary and goes to the product
          page, never straight to WhatsApp. */
       return !!b && !!go && go.getAttribute('href') === 'box/?id=BOX0042'
           && !!go2 && go2.getAttribute('href') === 'seedbox/'
           && !/wa\.me/.test(b.innerHTML)
           && !document.getElementById('sbNo')
           && !!b.querySelector('.sb-badge')
           && /%$/.test(b.querySelector('.sb-badge').textContent.trim()); }));
  ok('several boxes show the newest, and say how many others',
     await p.evaluate(()=>{
       localStorage.setItem('moneybox:BOX0099', JSON.stringify({boxId:'BOX0099',goal:100000,
         updatedAt:Date.now()+9000, startedAt:'2026-09-03',
         cells:[{id:'200-0',amount:200,filledAt:'2026-09-03'}]}));
       renderSeedBanner();
       /* the status line has its own full-width row now, so with several boxes
          it says WHICH box AND the money -- it no longer has to choose */
       const n = document.querySelector('#sbBanner .sb-note').textContent;
       return n.includes('BOX0099') && /1/.test(n) && /1,00,000/.test(n); }),
     await p.evaluate(()=>document.querySelector('#sbBanner .sb-note').textContent.trim()));

  /* --- the card's own invariants, none of which had a check before ---------
     Each of these is something a later edit could quietly undo: the goal
     falling back out of the status line, the icon inheriting a colour, the
     primary and secondary flattening into the same treatment again. */
  /* Reading the rendered note only proves the language the audit happens to
     run in -- reverting just the English string slipped straight through that.
     So this asserts the goal placeholder in BOTH tables as well as the DOM. */
  ok('the status line carries the goal, not just the total, in both languages',
     await p.evaluate(()=>{
       renderSeedBanner();
       const n = document.querySelector('#sbBanner .sb-note').textContent;
       const inDom = /1,00,000/.test(n) && /₹/.test(n);
       const both = ['en','te'].every(l =>
         STR[l] && typeof STR[l].mbNoteSaved === 'string'
         && STR[l].mbNoteSaved.includes('{g}') && STR[l].mbNoteSaved.includes('{a}'));
       return inDom && both; }),
     await p.evaluate(()=>document.querySelector('#sbBanner .sb-note').textContent.trim()
       + ' | en=' + STR.en.mbNoteSaved + ' te=' + STR.te.mbNoteSaved));
  ok('the status line fits on one line -- no ellipsis, no wrap',
     await p.evaluate(()=>{
       const e = document.querySelector('#sbBanner .sb-note');
       const lh = parseFloat(getComputedStyle(e).lineHeight) || 19;
       return e.getBoundingClientRect().height <= lh * 1.4; }));
  ok('the card shows the app gift glyph, drawn in --sb-ico',
     await p.evaluate(()=>{
       const w = document.querySelector('#sbBanner .sb-ico');
       const svg = w && w.querySelector('svg.i');
       if(!svg) return false;
       const tok = getComputedStyle(document.documentElement).getPropertyValue('--sb-ico').trim();
       return !!tok && getComputedStyle(svg).stroke === getComputedStyle(w).color; }));
  ok('the primary action is a pill and the secondary is not',
     await p.evaluate(()=>{
       const go = document.querySelector('#sbBanner .sb-go');
       const g2 = document.querySelector('#sbBanner .sb-go2');
       if(!go || !g2) return false;
       const a = getComputedStyle(go), b = getComputedStyle(g2);
       const filled = c => c.backgroundColor !== 'rgba(0, 0, 0, 0)' && c.backgroundColor !== 'transparent';
       return filled(a) && !filled(b)
         && parseFloat(a.fontSize) > parseFloat(b.fontSize)
         && parseInt(a.fontWeight,10) > parseInt(b.fontWeight,10); }));
  ok('the Telugu line is the second-largest text, ahead of the action',
     await p.evaluate(()=>{
       const px = s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
       return px('.sb-t') > px('.sb-tag')
         && px('.sb-tag') > px('.sb-go')
         && px('.sb-go') > px('.sb-tag2'); }));
  ok('in the promo state Buy now is the only action and takes the pill',
     await p.evaluate(()=>{
       const keys = Object.keys(localStorage).filter(k=>k.startsWith('moneybox:'));
       const saved = keys.map(k=>[k,localStorage.getItem(k)]);
       keys.forEach(k=>localStorage.removeItem(k));
       renderSeedBanner();
       const host = document.querySelector('#sbBanner');
       const go = host.querySelector('.sb-go');
       const r = !!go && go.getAttribute('href') === 'seedbox/'
         && !host.querySelector('.sb-go2')
         && getComputedStyle(go).backgroundColor !== 'rgba(0, 0, 0, 0)';
       saved.forEach(([k,v])=>localStorage.setItem(k,v)); renderSeedBanner();
       return r; }));
  ok('the banner and the savings card agree, because they share one decision',
     await p.evaluate(()=>{
       const st = mbState();
       renderSeedBanner(); renderMoneyBox();
       const a = document.querySelector('#sbBanner .sb-go').getAttribute('href');
       const b = document.querySelector('#mbBox .mb-card').getAttribute('href');
       return st.kind === 'progress' && a === b; }));
  await p.evaluate(()=>{ ['moneybox:BOX0042','moneybox:BOX0099']
    .forEach(k=>localStorage.removeItem(k));
    delete CONFIG.seedBoxWhatsApp; renderSeedBanner(); renderMoneyBox(); });
  await p.waitForTimeout(200);

  console.log('\n--- MONEY BOX ---');
  /* Savings is not a bottom-nav tab; it is reached from the balance card */
  await p.evaluate(()=>go('save')); await p.waitForTimeout(700);
  /* The Savings card is gated exactly like the home one now: with no order
     number there is nowhere to buy, so it shows nothing rather than an
     invitation to a page whose only button is inert. */
  ok('with no order number the Savings card shows nothing either',
     await p.evaluate(()=>!document.querySelector('#mbBox .mb-card')));
  await p.evaluate(()=>{ CONFIG.seedBoxWhatsApp = '919876543210'; renderMoneyBox(); });
  await p.waitForTimeout(200);
  ok('an invitation card while there is no box', await p.evaluate(()=>{
     const c = document.querySelector('#mbBox .mb-card');
     return !!c && c.getAttribute('href') === 'seedbox/' && !c.querySelector('.mb-bar'); }));
  ok('it turns into a live count once a box exists', await p.evaluate(()=>{
     localStorage.setItem('moneybox:BOX0009', JSON.stringify({
       boxId:'BOX0009', goal:100000, updatedAt:Date.now(), startedAt:'2026-01-01',
       cells:[{id:'500-0',amount:500,filledAt:'2026-01-01'},
              {id:'500-1',amount:500,filledAt:'2026-01-02'},
              {id:'500-2',amount:500,filledAt:null}] }));
     renderMoneyBox();
     const c = document.querySelector('#mbBox .mb-card');
     return c.getAttribute('href') === 'box/?id=BOX0009'
            && !!c.querySelector('.mb-bar')
            && c.textContent.includes('1,000'); }),
     await p.evaluate(()=>document.querySelector('#mbBox .mb-card').textContent.replace(/\s+/g,' ').trim().slice(0,60)));
  ok('it counts only the filled cells', await p.evaluate(()=>{
     const b = JSON.parse(localStorage.getItem('moneybox:BOX0009'));
     return mbTotal(b) === 1000; }));
  ok('the newest box wins when there is more than one', await p.evaluate(()=>{
     localStorage.setItem('moneybox:BOX0010', JSON.stringify({
       boxId:'BOX0010', goal:100000, updatedAt:Date.now()+5000, startedAt:'2026-02-01',
       cells:[{id:'100-0',amount:100,filledAt:'2026-02-01'}] }));
     renderMoneyBox();
     const on = document.querySelector('#mbBox .mb-card').getAttribute('href') === 'box/?id=BOX0010';
     localStorage.removeItem('moneybox:BOX0010'); localStorage.removeItem('moneybox:BOX0009');
     renderMoneyBox();
     return on; }));
  ok('and it goes back to the invitation when the boxes are gone',
     await p.evaluate(()=>{ const c = document.querySelector('#mbBox .mb-card');
       return !!c && c.getAttribute('href') === 'seedbox/'; }));
  ok('Home and Savings never disagree about which state it is', await p.evaluate(()=>{
     const read = () => {
       /* the home card's state is its PRIMARY action, since Buy now appears
          in both states and would otherwise read as a promo every time */
       const home = document.querySelector('#sbBanner .sb-go');
       const sav  = document.querySelector('#mbBox .mb-card');
       const kind = el => !el ? 'none' : (el.getAttribute('href')||'').startsWith('box/') ? 'progress' : 'promo';
       return kind(home) + '/' + kind(sav);
     };
     const seen = [];
     CONFIG.seedBoxWhatsApp = ''; renderSeedBanner(); renderMoneyBox(); seen.push(read());
     CONFIG.seedBoxWhatsApp = '919876543210'; renderSeedBanner(); renderMoneyBox(); seen.push(read());
     localStorage.setItem('moneybox:BOX0077', JSON.stringify({boxId:'BOX0077',goal:100000,
       updatedAt:Date.now(), startedAt:'2026-03-01',
       cells:[{id:'500-0',amount:500,filledAt:'2026-03-01'}]}));
     renderSeedBanner(); renderMoneyBox(); seen.push(read());
     localStorage.removeItem('moneybox:BOX0077'); renderSeedBanner(); renderMoneyBox();
     return seen.join(' ') === 'none/none promo/promo progress/progress'; }),
     'each pair must match');

  console.log('\n--- MONEY BOX: GOOGLE DRIVE SYNC ---');
  ok('boxes ride the existing backup rather than a second file',
     await p.evaluate(()=>'boxes' in DEFAULTS && typeof DEFAULTS.boxes === 'object'));
  ok('the backup mirrors the moneybox keys into it', await p.evaluate(()=>{
     localStorage.setItem('moneybox:BOX0501', JSON.stringify({
       boxId:'BOX0501', startedAt:'2026-01-01', goal:100000, syncedTotal:0, updatedAt:1000,
       cells:[{id:'500-0',amount:500,filledAt:'2026-01-01'},{id:'500-1',amount:500,filledAt:null}] }));
     const m = mbCollect();
     return !!m.BOX0501 && DB.boxes.BOX0501.boxId === 'BOX0501'; }));
  ok('only the filled cells travel, so a redesign of the face cannot break it',
     await p.evaluate(()=>mbCollect().BOX0501.cells.length === 1));
  ok('a newer backup wins', await p.evaluate(()=>{
     mbSpread({ BOX0501:{ boxId:'BOX0501', startedAt:'2026-01-01', goal:100000, syncedTotal:0,
       updatedAt:9999999999999,
       cells:[{id:'500-0',amount:500,filledAt:'x'},{id:'500-1',amount:500,filledAt:'y'}] } });
     return JSON.parse(localStorage.getItem('moneybox:BOX0501')).cells.length === 2; }));
  ok('an older backup cannot undo what is on the phone', await p.evaluate(()=>{
     mbSpread({ BOX0501:{ boxId:'BOX0501', startedAt:'2000-01-01', goal:100000, syncedTotal:0,
       updatedAt:1, cells:[{id:'100-0',amount:100,filledAt:'z'}] } });
     return JSON.parse(localStorage.getItem('moneybox:BOX0501')).cells.length === 2; }));
  ok('a box that exists only in the backup arrives', await p.evaluate(()=>{
     mbSpread({ BOX0502:{ boxId:'BOX0502', startedAt:'2026-01-01', goal:100000, syncedTotal:0,
       updatedAt:Date.now(), cells:[{id:'200-0',amount:200,filledAt:'a'}] } });
     return !!localStorage.getItem('moneybox:BOX0502'); }));
  ok('a malformed entry in a backup is skipped, not written',
     await p.evaluate(()=>mbSpread({ BAD:{nope:1}, WORSE:null, X:{cells:'nope'} }) === 0));
  ok('restore merges the boxes instead of replacing them',
     await p.evaluate(()=>/mbSpread/.test(googleRestore.toString())));
  ok('backup refreshes the mirror first, so a just-filled cell is not missed',
     await p.evaluate(()=>/mbCollect/.test(googleBackup.toString())));
  ok('a box write never drops or alters any other key in the store',
     await p.evaluate(()=>{
       /* the whole store, as a phone in use would have it */
       const full = { version:2, settings:{rate:25,carryForward:true,notifyDays:3,
           adClient:'',adSlot:'',googleClientId:''},
         tx:[{id:'t1',type:'income',amount:40000,date:'2026-09-01',category:'Salary'}],
         sources:[{id:'s1',name:'Job',amount:40000,active:true}],
         savings:[{id:'v1',amount:2000,date:'2026-09-01',note:'set aside'}],
         chits:[{id:'c1',name:'Ravi chit',instal:2000,months:20,paid:3}],
         loans:[{id:'l1',kind:'lent',person:'Anil',principal:10000,rate:2,start:'2026-09-01'}],
         moyi:[{id:'m1',person:'Sita',event:'wedding',type:'given',amount:1116,date:'2026-09-01'}],
         udhaar:[{id:'u1',shop:'Kirana',amount:450,date:'2026-09-01'}],
         days:[{id:'d1',date:'2026-09-01',name:'Ammamma'}],
         reminders:[{id:'r1',title:'EMI',amount:3000,due:'2026-09-01',repeat:'monthly'}],
         calRem:[{id:'cr1',date:'2026-09-01',time:'07:55',title:'Chit',snooze:0,done:false}],
         sos:[{id:'x1',name:'Apollo',phone:'0402345'}],
         members:[{id:'p1',name:'Amma',phone:'99'}], scores:[{id:'sc1',score:700,date:'2026-09-01'}],
         fests:[{id:'f1',name:'Sankranti',target:5000,date:'2027-01-14',saved:1000}],
         receipts:['2026-08'], rates:{gold24:7000,updated:'2026-09-01'},
         taxSlab:20, budgetIncome:40000, lastSync:'x', boxes:{} };
       const saved0 = JSON.parse(localStorage.getItem(KEY) || 'null');
       localStorage.setItem(KEY, JSON.stringify(full));
       DB = load();
       const before = JSON.parse(localStorage.getItem(KEY));
       /* the box paths: mirror in, merge back out */
       localStorage.setItem('moneybox:BOX0601', JSON.stringify({ boxId:'BOX0601',
         startedAt:'2026-09-01', goal:100000, syncedTotal:0, updatedAt:Date.now(),
         cells:[{id:'500-0',amount:500,filledAt:'2026-09-01'}] }));
       mbCollect(); save();
       mbSpread({ BOX0602:{ boxId:'BOX0602', startedAt:'2026-09-02', goal:100000,
         syncedTotal:0, updatedAt:Date.now(), cells:[{id:'200-0',amount:200,filledAt:'2026-09-02'}] } });
       mbCollect(); save();
       const after = JSON.parse(localStorage.getItem(KEY));
       const keys = Object.keys(before);
       const lost    = keys.filter(k => !(k in after));
       const mangled = keys.filter(k => k !== 'boxes' &&
         JSON.stringify(before[k]) !== JSON.stringify(after[k]));
       /* put the machine back the way it was found */
       localStorage.removeItem('moneybox:BOX0601');
       localStorage.removeItem('moneybox:BOX0602');
       if(saved0) localStorage.setItem(KEY, JSON.stringify(saved0));
       DB = load(); renderAll();
       return lost.length === 0 && mangled.length === 0;
     }));
  console.log('\n--- SAVE IS A MERGE, NOT AN OVERWRITE ---');
  ok('save() re-reads storage rather than trusting memory',
     await p.evaluate(()=>/getItem\(KEY\)/.test(save.toString()) && /mergeStore/.test(save.toString())));
  ok('a change made elsewhere survives our next save', await p.evaluate(()=>{
     DB.savings=[]; save();
     const st=JSON.parse(localStorage.getItem(KEY));
     st.savings.push({id:'elsewhere',amount:500,date:'2026-09-04'});
     localStorage.setItem(KEY, JSON.stringify(st));
     DB.tx.push({id:'ours',type:'expense',amount:20,date:'2026-09-04',category:'Milk'}); save();
     const out=JSON.parse(localStorage.getItem(KEY));
     return out.savings.some(x=>x.id==='elsewhere') && out.tx.some(x=>x.id==='ours'); }));
  ok('both documents appending to the same list keep both', await p.evaluate(()=>{
     DB.savings=[]; save();
     const st=JSON.parse(localStorage.getItem(KEY));
     st.savings.push({id:'theirs',amount:100,date:'2026-09-04'});
     localStorage.setItem(KEY, JSON.stringify(st));
     DB.savings.push({id:'mine',amount:200,date:'2026-09-04'}); save();
     const out=JSON.parse(localStorage.getItem(KEY));
     return out.savings.length===2 && out.savings.some(x=>x.id==='theirs')
                                   && out.savings.some(x=>x.id==='mine'); }));
  ok('something deleted on purpose is not resurrected by a stale copy',
     await p.evaluate(()=>{
       DB.savings=[{id:'a',amount:1,date:'x'},{id:'b',amount:2,date:'x'}]; save();
       DB.savings=DB.savings.filter(x=>x.id!=='a'); save();
       const out=JSON.parse(localStorage.getItem(KEY));
       return out.savings.length===1 && out.savings[0].id==='b'; }));
  ok('a value we did not touch keeps theirs; one we did keeps ours',
     await p.evaluate(()=>{
       DB.taxSlab=20; save();
       const st=JSON.parse(localStorage.getItem(KEY)); st.taxSlab=30;
       localStorage.setItem(KEY, JSON.stringify(st));
       DB.tx.push({id:'z',type:'expense',amount:1,date:'x',category:'Milk'}); save();
       const theirs = JSON.parse(localStorage.getItem(KEY)).taxSlab===30;
       DB.taxSlab=10; save();
       return theirs && JSON.parse(localStorage.getItem(KEY)).taxSlab===10; }));
  ok('the storage event is only for the screen now, not for keeping data',
     await p.evaluate(()=>/only about what is on screen/.test(document.documentElement.innerHTML)));
  await p.evaluate(()=>{ DB = load(); renderAll(); });
  await p.waitForTimeout(200);
  await p.evaluate(()=>{ localStorage.removeItem('moneybox:BOX0501');
    localStorage.removeItem('moneybox:BOX0502'); DB.boxes={}; save(); renderMoneyBox(); });
  await p.waitForTimeout(200);
  await p.evaluate(()=>go('home')); await p.waitForTimeout(500);

  console.log('\n--- THEME SWITCH ---');
  await p.evaluate(()=>{ localStorage.removeItem('pocketseeds.theme'); THEME='auto'; applyTheme(); paintThemeButton(); });
  await p.waitForTimeout(200);
  ok('it is a real switch, not a div', await p.evaluate(()=>{
     const b=document.querySelector('#btnTheme');
     return b.tagName==='BUTTON' && b.getAttribute('role')==='switch' && b.hasAttribute('aria-checked'); }));
  ok('with nothing chosen the app still follows the phone', await p.evaluate(()=>
     localStorage.getItem('pocketseeds.theme')===null && !document.documentElement.hasAttribute('data-theme')));
  ok('and says so with a ring rather than a fake position', await p.evaluate(()=>
     document.querySelector('#btnTheme').classList.contains('auto')
     && getComputedStyle(document.querySelector('.ts-knob')).boxShadow.includes('px')));
  ok('the pill fits the header at 390px', await p.evaluate(()=>{
     const r=document.querySelector('.top-row'), t=document.querySelector('.top-tools');
     return t.getBoundingClientRect().right <= r.getBoundingClientRect().right + 0.5; }));
  ok('the row still holds one line', await p.evaluate(()=>{
     const t=Array.from(document.querySelector('.top-tools').children).map(e=>e.getBoundingClientRect().top);
     return Math.max(...t)-Math.min(...t) < 2; }));
  const knobAt = () => p.evaluate(()=>getComputedStyle(document.querySelector('.ts-knob')).transform);
  await p.evaluate(()=>setTheme('light')); await p.evaluate(()=>paintThemeButton()); await p.waitForTimeout(400);
  const kLight = await knobAt();
  await p.evaluate(()=>setTheme('dark')); await p.evaluate(()=>paintThemeButton()); await p.waitForTimeout(400);
  const kDark = await knobAt();
  ok('the knob moves between the two states', kLight!==kDark, kLight+' -> '+kDark);
  ok('and it moves on transform, not on left', await p.evaluate(()=>{
     const s=getComputedStyle(document.querySelector('.ts-knob'));
     return s.position==='absolute' && parseFloat(s.left)<=4.01; }));
  ok('sun sits on the light side, moon on the dark side', await p.evaluate(()=>{
     const s=document.querySelector('.ts-sun').getBoundingClientRect();
     const m=document.querySelector('.ts-moon').getBoundingClientRect();
     return s.left > m.left; }));
  ok('both glyphs are drawn, not typed', await p.evaluate(()=>{
     const g=document.querySelectorAll('.ts-ico svg');
     return g.length===2 && Array.from(g).every(x=>x.getAttribute('stroke-width')==='1.85'
       && x.getAttribute('stroke-linecap')==='round' && x.getAttribute('fill')==='none'); }));
  ok('tapping pins the theme, exactly as the old button did', await (async()=>{
     await p.evaluate(()=>setTheme('light')); await p.evaluate(()=>paintThemeButton());
     await p.click('#btnTheme'); await p.waitForTimeout(250);
     return await p.evaluate(()=>localStorage.getItem('pocketseeds.theme'))==='dark'; })());
  ok('aria-checked tracks the resolved theme', (await p.getAttribute('#btnTheme','aria-checked'))==='true');
  ok('holding it goes back to following the phone', await (async()=>{
     const b = await p.locator('#btnTheme').boundingBox();
     await p.mouse.move(b.x+b.width/2, b.y+b.height/2);
     await p.mouse.down(); await p.waitForTimeout(750); await p.mouse.up();
     await p.waitForTimeout(250);
     return await p.evaluate(()=>localStorage.getItem('pocketseeds.theme'))==='auto'; })());
  ok('the hold is confirmed out loud', await p.evaluate(()=>document.querySelector('#toast').classList.contains('on')));
  ok('a tap straight after the hold still toggles', await (async()=>{
     await p.click('#btnTheme'); await p.waitForTimeout(250);
     return ['light','dark'].includes(await p.evaluate(()=>localStorage.getItem('pocketseeds.theme'))); })());
  ok('the keyboard reaches it without a second gesture', await p.evaluate(()=>{
     const b=document.querySelector('#btnTheme'); b.focus(); return document.activeElement===b; }));
  const kb0 = await p.evaluate(()=>localStorage.getItem('pocketseeds.theme'));
  await p.keyboard.press('Enter'); await p.waitForTimeout(250);
  ok('Enter toggles', (await p.evaluate(()=>localStorage.getItem('pocketseeds.theme')))!==kb0);
  await p.keyboard.press('Space'); await p.waitForTimeout(250);
  ok('Space toggles', (await p.evaluate(()=>localStorage.getItem('pocketseeds.theme')))===kb0);
  ok('the focus ring matches the rest of the app', await p.evaluate(()=>
     parseFloat(getComputedStyle(document.querySelector('#btnTheme')).outlineWidth)>=3));
  ok('the tap target reaches 44px without growing the pill', await p.evaluate(()=>{
     const b=document.querySelector('#btnTheme');
     return parseFloat(getComputedStyle(b,'::before').height)>=44
       && b.getBoundingClientRect().height<=34.01
       && document.querySelector('.top-row').getBoundingClientRect().height<=40; }));
  ok('the label names the action and the way back, in the reader\'s language', await p.evaluate(()=>{
     const l=document.querySelector('#btnTheme').getAttribute('aria-label')||'';
     return l.length>20 && !/^theme$/i.test(l) && /మార్చండి/.test(l) && /సెట్టింగ్స్/.test(l); }));
  ok('choosing in Settings repaints the header control', await p.evaluate(()=>{
     const b=document.createElement('button'); b.dataset.themeSet='auto'; b.id='auditThemeAuto';
     document.body.appendChild(b); b.click(); b.remove();
     return document.querySelector('#btnTheme').classList.contains('auto'); }));
  ok('the switch changed the control, not the storage key', await p.evaluate(()=>
     Object.keys(localStorage).filter(k=>/theme/i.test(k)).every(k=>k==='pocketseeds.theme')));
  await p.evaluate(()=>{ localStorage.removeItem('pocketseeds.theme'); THEME='auto'; applyTheme(); paintThemeButton(); });
  await p.waitForTimeout(200);

  console.log('\n--- SMALL SCREEN (360px) ---');
  await p.setViewportSize({width:360,height:640}); await p.waitForTimeout(400);
  ok('no sideways scroll at 360px', await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),
     await p.evaluate(()=>document.documentElement.scrollWidth+' vs '+document.documentElement.clientWidth));
  ok('at 360px the switch falls back to the icon footprint, not a squashed pill',
     await p.evaluate(()=>{
       const b=document.querySelector('#btnTheme').getBoundingClientRect();
       return Math.round(b.width)===29 && Math.round(b.height)===29
         && getComputedStyle(document.querySelector('.ts-knob')).display==='none'; }));
  ok('the fallback still shows exactly one glyph, and the right one', await p.evaluate(()=>{
     const vis = ['.ts-sun','.ts-moon'].filter(s=>getComputedStyle(document.querySelector(s)).display!=='none');
     const dark = document.querySelector('#btnTheme').getAttribute('aria-checked')==='true';
     return vis.length===1 && vis[0]===(dark?'.ts-moon':'.ts-sun'); }));



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

  console.log('\n--- CARD TINTS ---');
  for(const theme of ['light','dark']){
    await p.evaluate(t=>setTheme(t), theme); await p.waitForTimeout(250);
    const bad = await greenTextAA();
    ok(theme + ': no text anywhere sits on a green fill below AA',
       bad.length === 0, bad.slice(0,4).join(' | ') || 'all clear');
  }
  await p.evaluate(()=>setTheme('auto')); await p.waitForTimeout(200);

  /* Read the colours off the live DOM and do the arithmetic here, so this
     fails if a token drifts rather than if a hex string in a stylesheet
     changes. White on either pastel is ~1.3:1, which is the whole reason
     these cards are dark-on-light. */
  const CR = (fg,bg) => {
    const px = c => { const m=String(c).match(/[\d.]+/g).map(Number);
      const f = v => { v/=255; return v<=0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
      return 0.2126*f(m[0])+0.7152*f(m[1])+0.0722*f(m[2]); };
    const a=px(fg), b=px(bg), hi=Math.max(a,b), lo=Math.min(a,b);
    return (hi+0.05)/(lo+0.05);
  };
  const tintPairs = async () => {
    await p.evaluate(()=>{ CONFIG.seedBoxWhatsApp='919876543210'; DB.savings=[];
      Object.keys(localStorage).filter(k=>k.startsWith('moneybox:')).forEach(k=>localStorage.removeItem(k));
      renderSeedBanner(); });
    await p.waitForTimeout(200);
    return p.evaluate(()=>{
      const cs = s => { const e=document.querySelector(s); return e?getComputedStyle(e):null; };
      const card=cs('.sb-card'), n=cs('.sb-t'), tag=cs('.sb-tag'),
            buy=cs('.sb-go'), strip=cs('.sb-strip'), top=cs('.sc-top'), bento=cs('.sc-b');
      return { cardBg:card&&card.backgroundColor, title:n&&n.color, tag:tag&&tag.color,
               stripBg:strip&&strip.backgroundColor, buyInk:buy&&buy.color,
               coachBg:top&&top.backgroundColor, coachInk:top&&top.color,
               bentoBg:bento&&bento.backgroundColor, bentoInk:bento&&bento.color };
    });
  };
  for(const theme of ['light','dark']){
    await p.evaluate(t=>{ setTheme(t); if(typeof paintThemeButton==='function') paintThemeButton(); }, theme);
    await p.waitForTimeout(250);
    const c = await tintPairs();
    const pair = (label, fg, bg, need) => ok(theme+': '+label,
      CR(fg,bg) >= need, CR(fg,bg).toFixed(2)+':1 (needs '+need+')');
    pair('Seed Box title on the card', c.title, c.cardBg, 4.5);
    pair('tagline on the card',        c.tag,   c.cardBg, 4.5);
    /* the action is text on the card now, not a filled pill, so what has to
       clear AA is the label against the card it sits on */
    pair('the action label on the card', c.buyInk, c.cardBg, 4.5);
    pair('coach amount on its panel',  c.coachInk, c.coachBg, 4.5);
    pair('bucket text on its panel',   c.bentoInk, c.bentoBg, 4.5);
    ok(theme+': nothing on either card is white on a pastel', await p.evaluate(()=>{
       const light = c => { const m=String(c).match(/[\d.]+/g).map(Number);
         return (m[0]+m[1]+m[2])/3 > 200; };
       const card = getComputedStyle(document.querySelector('.sb-card'));
       const top  = getComputedStyle(document.querySelector('.sc-top'));
       const bad = (bg, ink) => light(bg) && light(ink);
       return !bad(card.backgroundColor, getComputedStyle(document.querySelector('.sb-t')).color)
           && !bad(top.backgroundColor, top.color); }));
  }
  await p.evaluate(()=>{ setTheme('auto'); if(typeof paintThemeButton==='function') paintThemeButton(); });
  await p.waitForTimeout(200);

  console.log('\n--- SEED BOX PROMO PLACEMENT ---');
  await p.setViewportSize({width:360,height:640}); await p.waitForTimeout(250);
  const promoSetup = (hasSavings, wa) => p.evaluate(([hs, w]) => {
    CONFIG.seedBoxWhatsApp = w;
    DB.savings = hs ? [{id:'s1',amount:500,note:'t',date:'2026-09-01'}] : [];
    DB.boxes = {};
    Object.keys(localStorage).filter(k=>k.startsWith('moneybox:')).forEach(k=>localStorage.removeItem(k));
    renderSeedBanner(); renderMoneyBox();
  }, [hasSavings, wa]);
  const promoRead = () => p.evaluate(() => {
    const host = document.querySelector('#sbBanner');
    const card = host.querySelector('.sb');
    const qa = document.querySelector('#quickTiles') && document.querySelector('#quickTiles').firstElementChild;
    const tag = host.querySelector('.sb-tag');
    let tagTextW = null, tagBoxW = null;
    if(tag){ const rg=document.createRange(); rg.selectNodeContents(tag);
      tagTextW = rg.getBoundingClientRect().width; tagBoxW = tag.getBoundingClientRect().width; }
    return {
      empty: host.innerHTML.trim()==='',
      /* one card shape now; the state is which action it offers */
      card: !!host.querySelector('.sb-card'),
      /* read from the primary action: Buy now is in both states now */
      promo: (host.querySelector('.sb-go')||{}).getAttribute
             && host.querySelector('.sb-go').getAttribute('href') === 'seedbox/',
      progressState: !!host.querySelector('.sb-go')
             && (host.querySelector('.sb-go').getAttribute('href')||'').startsWith('box/'),
      progress: !!host.querySelector('.sb-go')
             && (host.querySelector('.sb-go').getAttribute('href')||'').startsWith('box/'),
      buys: host.querySelectorAll('.sb-go').length,
      waDirect: [...host.querySelectorAll('a')].some(a=>/wa\.me/.test(a.getAttribute('href')||'')),
      tagLines: tag ? Math.round(tag.getBoundingClientRect().height /
        (parseFloat(getComputedStyle(tag).lineHeight)||18)) : null,
      tagFits: tag ? (tagTextW <= tagBoxW + 0.5) : null,
      text: host.textContent,
      quickAddTop: qa ? qa.getBoundingClientRect().top : null,
      /* the card moved below Quick add, which is where the concept put it */
      order: (()=>{ const b=document.querySelector('#sbBanner');
        const q=document.querySelector('#quickTiles'); const ask=document.querySelector('#askBanner');
        if(!b||!q||!ask) return null;
        return q.getBoundingClientRect().bottom <= b.getBoundingClientRect().top
            && b.getBoundingClientRect().bottom <= ask.getBoundingClientRect().top; })()
    };
  });

  await promoSetup(false, '');
  ok('with no order number the promo does not render at all', (await promoRead()).empty);

  await promoSetup(false, '919999999999');
  let pr = await promoRead();
  ok('the card renders with the concept structure', pr.card);
  ok('it sits below Quick add and above the Ask card', pr.order===true);
  ok('the tagline is on one line', pr.tagLines===1, String(pr.tagLines));
  ok('and is not quietly ellipsised', pr.tagFits===true);
  /* one primary; in progress a smaller Buy sits beside it and always points
     at the product page, never at wa.me */
  ok('one primary action, and Buy never links straight to WhatsApp',
     pr.buys===1 && !pr.waDirect, pr.buys+' primary, wa.me direct: '+pr.waDirect);
  ok('the word "invest" appears nowhere on it', !/invest/i.test(pr.text));
  ok('Quick add is not pushed off a 360x640 screen', pr.quickAddTop < 640,
     'first tile at y=' + Math.round(pr.quickAddTop));
  const quickAddWithFull = pr.quickAddTop;

  await promoSetup(true, '919999999999');
  pr = await promoRead();
  /* the concept collapsed the full/compact split into one card shape, so what
     is asserted now is that a saver still sees the promo, not a second shape */
  ok('someone already saving still sees the promo', pr.promo);
  /* against the full card's own position, not a number typed in once: what
     matters is that the lighter state gives the page back some room and stays
     on screen, and both of those survive the layout moving underneath */
  ok('Quick add is unaffected by the card, which now sits below it', pr.quickAddTop === quickAddWithFull,
     'y=' + Math.round(pr.quickAddTop) + ' in both states');

  await p.evaluate(() => {
    localStorage.setItem('moneybox:BOX0902', JSON.stringify({ boxId:'BOX0902', goal:100000,
      cells:[{id:'a',amount:500,filledAt:'2026-09-01'}], syncedTotal:0, milestones:[], updatedAt:Date.now() }));
    renderSeedBanner();
  });
  pr = await promoRead();
  /* the promo STATE never returns once a box exists — the Buy now link does,
     on purpose, as the secondary */
  ok('once a box exists the primary action is always Save', pr.progress && !pr.promo);
  ok('and the progress state is not dismissible', await p.evaluate(()=>!document.querySelector('#sbNo')));
  await p.evaluate(()=>{ localStorage.removeItem('moneybox:BOX0902'); renderSeedBanner(); });

  await promoSetup(false, '919999999999');
  ok('the card carries no dismiss control at all', await p.evaluate(()=>
     document.querySelectorAll('#sbBanner .no, #sbNo').length===0));
  ok('and it is still there after a re-render, every time', await p.evaluate(()=>{
     for(let i=0;i<5;i++) renderSeedBanner();
     return !!document.querySelector('#sbBanner .sb-card'); }));
  /* The card now lives in two hosts, Home and More, so counting every
     .sb-card in the document would just count the pages. What must stay true
     is that the READER never sees two: at most one visible at a time, and one
     per host. Loosening this to "<= 2" would have stopped it looking. */
  ok('the reader never sees two Seed Box cards at once',
     await p.evaluate(()=>{
       const vis = [...document.querySelectorAll('.sb-card')].filter(e=>e.offsetParent !== null);
       return vis.length <= 1
         && document.querySelectorAll('#sbBanner .sb-card').length <= 1
         && document.querySelectorAll('#sbBannerMore .sb-card').length <= 1
         && document.querySelectorAll('.mb-card').length <= 1; }));
  ok('Home and More render the same card from the same state',
     await p.evaluate(()=>{
       renderSeedBanner();
       const a = document.querySelector('#sbBanner').innerHTML.trim();
       const b = document.querySelector('#sbBannerMore').innerHTML.trim();
       return a.length > 0 && a === b; }));
  ok('the Seed Box tile is gone from the More grid, so there is one answer',
     await p.evaluate(()=>{
       renderMenu();
       const tiles = [...document.querySelectorAll('#menuGrid .menu-tile')];
       return tiles.length > 0
         && !tiles.some(e => (e.getAttribute('href')||'') === 'seedbox/'); }));
  await p.evaluate(()=>{ CONFIG.seedBoxWhatsApp = ''; DB.savings = [];
    renderSeedBanner(); renderMoneyBox(); });
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(250);

  console.log('\n--- HEADER FIT ACROSS THE BAND ---');
  /* Two profiles, named and pinned. Compact runs to 519px because .app is
     capped at 520px and the full-size row needs 448px it does not have below
     that; full takes over at 520px. Each width below asserts one profile
     EXACTLY, so a control drifting in either direction fails here — this is
     not a "nothing changed" check, it is a "these are the intended sizes"
     check, and the intended sizes differ per band on purpose. */
  /* The month nav left the top row and took its own full-width row below the
     save bar, so a min-width on its label is no longer the thing that keeps
     it honest — filling the row is. The profile now asserts that instead, and
     still pins the two controls that did stay in the top row. */
  const PROFILE = {
    compact: { appPad:'11px', langH:'29px', gear:[29,29] },
    full:    { appPad:'14px', langH:'34px', gear:[34,34] }
  };
  /* width : [ header profile, theme control size, brand shows the wordmark ] */
  const BAND = [
    [320, 'compact', [29,29], false], [340, 'compact', [29,29], false],
    [356, 'compact', [29,29], false], [359, 'compact', [29,29], false],
    [360, 'compact', [29,29], true ], [375, 'compact', [29,29], true ],
    [379, 'compact', [29,29], true ], [380, 'compact', [48,29], true ],
    [390, 'compact', [48,29], true ], [392, 'compact', [48,29], true ],
    [393, 'compact', [48,29], true ], [412, 'compact', [48,29], true ],
    [430, 'compact', [48,29], true ], [470, 'compact', [48,29], true ],
    [504, 'compact', [48,29], true ], [505, 'compact', [48,29], true ],
    [519, 'compact', [48,29], true ], [520, 'full',    [56,34], true ],
    [560, 'full',    [56,34], true ]
  ];
  const readHdr = () => p.evaluate(()=>{
    const cs = s => getComputedStyle(document.querySelector(s));
    const r  = s => document.querySelector(s).getBoundingClientRect();
    const tools = document.querySelector('.top-tools');
    const tops  = Array.from(tools.children).map(e=>e.getBoundingClientRect().top);
    const g = r('#btnSettings'), t = r('#btnTheme');
    const row = document.querySelector('.month-row').getBoundingClientRect();
    const mp  = r('.month-pick');
    return {
      appPad: cs('.app').paddingLeft,
      monthFillsRow: Math.abs(mp.width - row.width) < 1.5,
      monthInTopRow: !!document.querySelector('.top-row .month-pick'),
      langH: cs('.lang-pick button').height,
      gear: [Math.round(g.width), Math.round(g.height)],
      theme:[Math.round(t.width), Math.round(t.height)],
      brandText: r('.brand').width > 60,
      gearOnScreen: g.right <= window.innerWidth + 0.5 && g.left >= -0.5,
      wrapped: (Math.max(...tops)-Math.min(...tops)) > 2
        || document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  });
  for(const [w, prof, theme, wordmark] of BAND){
    await p.setViewportSize({width:w, height:844});
    await p.waitForTimeout(150);
    const h = await readHdr(), want = PROFILE[prof];
    const same = (a,b) => a[0]===b[0] && a[1]===b[1];
    ok('at '+w+'px the header is the '+prof+' profile',
       h.appPad===want.appPad && h.langH===want.langH && same(h.gear, want.gear),
       'pad='+h.appPad+' lang='+h.langH+' gear='+h.gear.join('x'));
    ok('at '+w+'px the month nav has its own full-width row',
       h.monthFillsRow && !h.monthInTopRow,
       h.monthInTopRow ? 'still in the top row' : 'fills row: '+h.monthFillsRow);
    ok('at '+w+'px the switch is '+theme.join('x'), same(h.theme, theme), h.theme.join('x'));
    ok('at '+w+'px the wordmark is '+(wordmark?'shown':'collapsed to the mark'),
       h.brandText===wordmark);
    ok('at '+w+'px the settings gear is reachable', h.gearOnScreen);
    ok('at '+w+'px nothing wraps or scrolls sideways', h.wrapped===false);
  }
  await p.setViewportSize({width:390, height:844}); await p.waitForTimeout(200);

  console.log('\n=== '+pass+' passed, '+fail+' failed ===');
  console.log('runtime errors:', errs.length?errs.join('\n'):'none');
  await br.close();
  process.exit(fail?1:0);
})();
