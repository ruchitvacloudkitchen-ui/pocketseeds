/* Offline route audit for the PocketSeeds PWA.
 *
 *   node tools/offline-audit.js
 *   CHROME_PATH=/path/to/chrome node tools/offline-audit.js
 *
 * Exits non-zero if anything fails, so it can gate a release.
 */
/* Offline route audit — the one thing a Play reviewer tests, and the one thing
   the other suites never touched.

   The defect this exists to catch: the service worker's cache key includes the
   query string, so /box/?id=BOX0001 -- the URL printed on every physical box --
   missed offline and fell through to the index.html shell. Someone scanning
   their own box with no signal got the app's home screen instead of their
   tracker. Anything that reintroduces that must fail here, loudly.

   It kills the HTTP server rather than calling context.setOffline(). That is
   not fussiness: setOffline left loopback reachable from inside the service
   worker, so an earlier version of this file "passed" against a live server
   while proving nothing. A stopped server cannot be reached by anything. */
let chromium;
/* either package is fine; playwright-core is the smaller one */
for(const pkg of ['playwright-core','playwright']){
  try{ ({ chromium } = require(pkg)); break; }catch(e){}
}
if(!chromium){
  console.error('This audit needs playwright-core and a Chromium build.\n' +
    '  npm i playwright-core        (in this directory, or set NODE_PATH to a global install)\n' +
    'Set CHROME_PATH to the browser binary if it is not on the default path.');
  process.exit(2);
}
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const PORT = Number(process.env.PORT || 8898);
const BASE = 'http://127.0.0.1:' + PORT;
const ROOT = path.resolve(__dirname, '..');
let pass=0, fail=0;
const ok=(n,c,d)=>{ c?pass++:fail++; console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'  ['+d+']':'')); };
const wait = ms => new Promise(r=>setTimeout(r,ms));
const up = () => new Promise(res=>{ const s=net.connect(PORT,'127.0.0.1')
  .on('connect',()=>{s.end();res(true);}).on('error',()=>res(false)); });

const IDENT = () => {
  const has = s => !!document.querySelector(s);
  let kind = 'UNKNOWN';
  /* #ringFill + #tSaved are the board's own furniture and are present whether
     or not a box id was supplied; #boxIn only exists on the "enter your box
     number" state, so it is the wrong marker. */
  if(has('#ringFill') && has('#tSaved')) kind = 'TRACKER';
  else if(has('.nav') && has('#page-home')) kind = 'APP';
  else if(has('.hero') && has('#waBtn')) kind = 'SEEDBOX';
  else if(/Privacy Policy/i.test(document.title)) kind = 'PRIVACY';
  return { kind, title:document.title, url:location.pathname+location.search };
};

(async () => {
  const srv = spawn('python3', ['-m','http.server',String(PORT)], {cwd:ROOT, stdio:'ignore'});
  for(let i=0;i<40 && !(await up());i++) await wait(150);
  if(!(await up())){ console.log('  FAIL  could not start the test server'); process.exit(1); }

  const launch = {};
  if(process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const br = await chromium.launch(launch);
  const ctx = await br.newContext({ viewport:{width:360,height:740} });

  /* Two online visits, because that is what a real user does and what the
     cache actually needs. On the very first load the app's boot fetches for
     config.json and rates.json go out before the worker claims the page, so
     they bypass it and are never cached; from the second launch they go
     through it. Warming with one visit made this look like a caching bug. */
  const warm = await ctx.newPage();
  await warm.goto(BASE+'/index.html', {waitUntil:'load'});
  await warm.evaluate(()=>navigator.serviceWorker.ready);
  await warm.waitForTimeout(1500);
  await warm.reload({waitUntil:'load'});
  await warm.evaluate(()=>navigator.serviceWorker.ready);
  /* config.json and rates.json carry a daily cache-buster and are written to
     the cache fire-and-forget, so poll for them rather than racing a fixed
     sleep -- a timed snapshot made this look like a caching bug once already. */
  const cached = await warm.evaluate(async()=>{
    const read = async () => {
      const keys = await caches.keys(); if(!keys.length) return null;
      const c = await caches.open(keys[0]);
      return { name:keys[0], entries:(await c.keys()).map(r=>new URL(r.url).pathname+new URL(r.url).search).sort() };
    };
    const wants = ['/config.json','/rates.json'];
    let snap = null;
    for(let i=0;i<40;i++){
      snap = await read();
      if(snap && wants.every(w => snap.entries.some(e => e.startsWith(w)))) break;
      await new Promise(r=>setTimeout(r,250));
    }
    return snap;
  });
  ok('the boot JSON reached the cache during normal use',
     ['/config.json','/rates.json'].every(w => cached.entries.some(e=>e.startsWith(w))),
     cached.entries.filter(e=>/\.json/.test(e)).join(' '));
  await warm.close();

  /* --- the network goes away for real --- */
  srv.kill('SIGKILL');
  for(let i=0;i<40 && (await up());i++) await wait(150);
  ok('the test server is genuinely down before any offline check', !(await up()));

  ok('the worker installed and precached the routes', cached.entries.length >= 7, cached.name);
  for(const r of ['/', '/index.html', '/box/', '/seedbox/', '/privacy/', '/moneybox/'])
    ok('precached: '+r, cached.entries.includes(r));

  const visit = async (path) => {
    const pg = await ctx.newPage();
    let out = { kind:'(load failed)', title:'', url:path };
    try{ await pg.goto(BASE+path, {waitUntil:'load', timeout:15000}); out = await pg.evaluate(IDENT); }
    catch(e){ out.err = e.message.split('\n')[0]; }
    await pg.close(); return out;
  };

  /* ---- the scan, offline. This is the check that matters. ---- */
  const scan = await visit('/box/?id=BOX0001');
  ok('OFFLINE /box/?id=BOX0001 opens the TRACKER, not the app shell',
     scan.kind === 'TRACKER', scan.kind+' | '+scan.title);
  ok('and it keeps the box id in the URL, so the tracker can read it',
     scan.url === '/box/?id=BOX0001', scan.url);
  const scan2 = await visit('/box/?id=BOX0777');
  ok('OFFLINE a box id never seen online still resolves', scan2.kind === 'TRACKER', scan2.kind);

  /* ---- every other route that carries a query string ---- */
  ok('OFFLINE /seedbox/?ref= opens the product page', (await visit('/seedbox/?ref=BOX0001')).kind === 'SEEDBOX');
  const mb = await visit('/moneybox/?id=BOX0001');
  ok('OFFLINE /moneybox/?id= still forwards to the product page', mb.kind === 'SEEDBOX', mb.url);

  /* ---- the plain routes, which must not have regressed ---- */
  for(const [path,want] of [['/','APP'],['/index.html','APP'],['/box/','TRACKER'],
                            ['/seedbox/','SEEDBOX'],['/privacy/','PRIVACY']]){
    const r = await visit(path);
    ok('OFFLINE '+path+' -> '+want, r.kind === want, r.kind);
  }
  ok('OFFLINE an unknown query string still opens the app',
     (await visit('/?utm_source=whatsapp')).kind === 'APP');

  /* ---- the JSON the app reads at boot, both cache-busted daily ---- */
  const jp = await ctx.newPage();
  await jp.goto(BASE+'/index.html', {waitUntil:'load'}).catch(()=>{});
  const cfg = await jp.evaluate(async()=>{
    const r = {};
    for(const [k,u] of [['config','config.json?d=2099-01-01'],['rates','rates.json?t=2099-01-01']]){
      try{ const res = await fetch(u,{cache:'no-store'});
           let parsed=false; try{ await res.clone().json(); parsed=true; }catch(e){}
           r[k]={ok:res.ok, ct:res.headers.get('content-type')||'', parsed};
      }catch(e){ r[k]={ok:false,ct:'',parsed:false,threw:true}; }
    } return r;
  });
  ok('OFFLINE config.json survives its daily cache-buster and still parses',
     cfg.config.parsed, JSON.stringify(cfg.config));
  ok('OFFLINE rates.json survives its daily cache-buster and still parses',
     cfg.rates.parsed, JSON.stringify(cfg.rates));

  /* ---- a missing asset must fail as an asset, not be handed a page ---- */
  const bogus = await jp.evaluate(async()=>{
    try{ const r = await fetch('nope-'+Date.now()+'.jpg');
         return {got:true, ct:r.headers.get('content-type')||'', status:r.status}; }
    catch(e){ return {got:false}; }
  });
  ok('OFFLINE a missing image is not answered with the HTML shell',
     !(bogus.got && /text\/html/.test(bogus.ct)), JSON.stringify(bogus));
  await jp.close();

  await ctx.close(); await br.close();
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  if(fail) process.exitCode = 1;
})();
