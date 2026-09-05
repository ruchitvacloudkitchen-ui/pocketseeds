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
 +'<path d="M7 0h86a7 7 0 0 1 7 7v45.5C100 80.4 77.6 100 50 100S0 80.4 0 52.5V7a7 7 0 0 1 7-7z" fill="#0A8A66"/>'
 +'<path d="M75.5 29.5C71.2 19.6 61.8 14 49.5 14 34.6 14 24.5 22.2 24.5 33.4c0 12.4 11.4 17.2 25.6 21.2 12.6 3.5 20.4 6.4 20.4 14.2 0 8.2-8.2 13.4-20.6 13.4-12.8 0-22.4-4.8-27.4-13.6" fill="none" stroke="white" stroke-width="17.5"/></svg>';
/* the maskable variant keeps the mark inside the safe circle by padding the
   viewBox and filling the bleed, so Android can crop it to any shape */
const MASK='<svg xmlns="http://www.w3.org/2000/svg" viewBox="-22 -22 144 144">'
 +'<rect x="-22" y="-22" width="144" height="144" fill="#0A8A66"/>'
 +'<path d="M7 0h86a7 7 0 0 1 7 7v45.5C100 80.4 77.6 100 50 100S0 80.4 0 52.5V7a7 7 0 0 1 7-7z" fill="#0A8A66"/>'
 +'<path d="M75.5 29.5C71.2 19.6 61.8 14 49.5 14 34.6 14 24.5 22.2 24.5 33.4c0 12.4 11.4 17.2 25.6 21.2 12.6 3.5 20.4 6.4 20.4 14.2 0 8.2-8.2 13.4-20.6 13.4-12.8 0-22.4-4.8-27.4-13.6" fill="none" stroke="white" stroke-width="17.5"/></svg>';

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
