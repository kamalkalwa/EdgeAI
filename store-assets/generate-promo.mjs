#!/usr/bin/env node
/**
 * Generate the Chrome Web Store promo tile (440x280) from promo-tile.html.
 * Usage: node generate-promo.mjs
 */
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Set viewport to exact promo tile dimensions
  await page.setViewport({ width: 440, height: 280, deviceScaleFactor: 2 });

  const htmlPath = resolve(__dirname, 'promo-tile.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

  await page.screenshot({
    path: resolve(__dirname, 'promo-tile-440x280.png'),
    clip: { x: 0, y: 0, width: 440, height: 280 },
  });

  console.log('Generated: store-assets/promo-tile-440x280.png (440x280 @2x)');

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
