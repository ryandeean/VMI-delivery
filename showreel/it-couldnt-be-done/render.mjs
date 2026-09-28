// Frame renderer. Usage:
//   node render.mjs stills 1.2,5.0,...        -> stills/t_<t>.png
//   node render.mjs video [fps] [workers]     -> out/seg_<n>.mp4 (then encode.sh)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const [mode = 'stills', arg1, arg2] = process.argv.slice(2);

async function openPage() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('PAGE ERROR', e));
  page.on('console', m => { if (m.type() === 'error') console.error('console', m.text()); });
  await page.goto('file://' + path.join(here, 'index.html'));
  await page.evaluate(() => window.ready);
  const cdp = await page.context().newCDPSession(page);
  return { browser, page, cdp };
}
async function grab(page, cdp, t, format = 'png') {
  await page.evaluate(t => window.renderFrame(t), t);
  const { data } = await cdp.send('Page.captureScreenshot', { format, optimizeForSpeed: true, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 } });
  return Buffer.from(data, 'base64');
}

if (mode === 'stills') {
  const { browser, page, cdp } = await openPage();
  mkdirSync(path.join(here, 'stills'), { recursive: true });
  const { writeFileSync } = await import('node:fs');
  for (const t of arg1.split(',').map(Number)) {
    writeFileSync(path.join(here, 'stills', `t_${t.toFixed(2)}.png`), await grab(page, cdp, t));
  }
  await browser.close();
} else if (mode === 'sfx') {
  const { browser, page } = await openPage();
  const sfx = await page.evaluate(() => window.SFX);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(path.join(here, 'out', 'sfx.json'), JSON.stringify(sfx));
  await browser.close();
} else {
  const fps = Number(arg1 || 60), workers = Number(arg2 || 4);
  const { browser: b0, page: p0 } = await openPage();
  const dur = await p0.evaluate(() => window.DURATION);
  await b0.close();
  const total = Math.round(dur * fps);
  mkdirSync(path.join(here, 'out'), { recursive: true });
  const per = Math.ceil(total / workers);
  const t0 = Date.now();
  await Promise.all([...Array(workers).keys()].map(async w => {
    const f0 = w * per, f1 = Math.min(total, f0 + per);
    const { browser, page, cdp } = await openPage();
    const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '8', '-pix_fmt', 'yuv444p', path.join(here, 'out', `seg_${w}.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let f = f0; f < f1; f++) {
      const buf = await grab(page, cdp, f / fps);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (w === 0 && f % 120 === 0) console.log(`worker0 ${f - f0}/${f1 - f0}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    await browser.close();
  }));
  console.log('done in', ((Date.now() - t0) / 1000).toFixed(0), 's');
}
