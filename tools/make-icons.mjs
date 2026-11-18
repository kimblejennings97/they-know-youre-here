// Renders tools/icon.html to the PNG icons in img/ using headless Chrome.
// Needs playwright-core available (npm i playwright-core) and Chrome installed.
// Usage: node tools/make-icons.mjs [path-to-chrome]
import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const exe = process.argv[2] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, headless: true });
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['favicon-32.png', 32]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.goto(pathToFileURL(root + 'tools/icon.html').href);
  await page.evaluate((s) => { const svg = document.getElementById('icon'); svg.setAttribute('width', s); svg.setAttribute('height', s); }, size);
  await page.screenshot({ path: root + 'img/' + name, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log('img/' + name);
}
await browser.close();
