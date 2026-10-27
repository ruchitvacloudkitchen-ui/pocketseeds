/* Rasterise the launcher icons from the SVGs the manifest already used.
 *
 *   node tools/make-icons.js
 *   CHROME_PATH=/path/to/chrome node tools/make-icons.js
 *
 * Bubblewrap downloads the manifest's icons to build the Android launcher and
 * splash assets, and it cannot use a data: URI -- which is what these were.
 * So they are written out as real PNG files here, from the same artwork.
 * icon.png is the 512 "any" mark: the app probes for it as optional artwork
 * and uses it as the notification icon, so its absence was a weekly 404 and a
 * blank notification.
 */
let chromium;
for(const pkg of ['playwright-core','playwright']){ try{ ({chromium}=require(pkg)); break; }catch(e){} }
if(!chromium){ console.error('needs playwright-core or playwright'); process.exit(2); }
const fs=require('fs'), path=require('path');
const ROOT=path.resolve(__dirname,'..');

const ANY='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
 +'<rect width="100" height="100" rx="22" fill="#0A8A66"/>'
 +'<path d="M18 71V29h13a10.5 10.5 0 0 1 0 21H18" fill="none" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>'
 +'<path d="M81 33.5C78 29 72 28 66.5 28 58.5 28 54.5 32.5 54.5 38.2c0 6.5 5.8 9.2 13.8 11.5 7.5 2.1 13.2 4.5 13.2 11.3 0 6.5-5.5 10.5-14 10.5-6.5 0-11.8-2-14.8-6.5" fill="none" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/* the maskable variant keeps the mark inside the safe circle by padding the
   viewBox and filling the bleed, so Android can crop it to any shape */
const MASK='<svg xmlns="http://www.w3.org/2000/svg" viewBox="-22 -22 144 144">'
 +'<rect x="-22" y="-22" width="144" height="144" fill="#0A8A66"/>'
 +'<path d="M18 71V29h13a10.5 10.5 0 0 1 0 21H18" fill="none" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>'
 +'<path d="M81 33.5C78 29 72 28 66.5 28 58.5 28 54.5 32.5 54.5 38.2c0 6.5 5.8 9.2 13.8 11.5 7.5 2.1 13.2 4.5 13.2 11.3 0 6.5-5.5 10.5-14 10.5-6.5 0-11.8-2-14.8-6.5" fill="none" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const JOBS=[['icon-192.png',192,ANY,true],['icon-512.png',512,ANY,true],
            ['icon.png',512,ANY,true],['icon-512-maskable.png',512,MASK,false]];

(async()=>{
  const launch={}; if(process.env.CHROME_PATH) launch.executablePath=process.env.CHROME_PATH;
  const br=await chromium.launch(launch);
  for(const [name,size,svg,transparent] of JOBS){
    const ctx=await br.newContext({viewport:{width:size,height:size},deviceScaleFactor:1});
    const p=await ctx.newPage();
    await p.setContent(`<style>html,body{margin:0;padding:0;background:transparent}
      svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await p.waitForTimeout(120);
    await p.screenshot({path:path.join(ROOT,name), omitBackground:transparent});
    await ctx.close();
    console.log(name, size+'x'+size, fs.statSync(path.join(ROOT,name)).size+' bytes');
  }
  await br.close();
})();
