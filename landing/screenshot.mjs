/**
 * Capture landing page screenshots at multiple viewport sizes.
 * Usage: npx puppeteer node screenshot.mjs
 */

import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(__dirname, 'index.html');

async function capture() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Full-page desktop screenshot (1280x800 for Chrome Web Store)
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

  // Hero section
  await page.screenshot({
    path: resolve(__dirname, 'screenshot-hero-1280x800.png'),
    clip: { x: 0, y: 0, width: 1280, height: 800 },
  });
  console.log('Captured: screenshot-hero-1280x800.png');

  // Features section
  const featuresEl = await page.$('#features');
  if (featuresEl) {
    const box = await featuresEl.boundingBox();
    if (box) {
      await page.screenshot({
        path: resolve(__dirname, 'screenshot-features-1280x800.png'),
        clip: { x: 0, y: box.y, width: 1280, height: 800 },
      });
      console.log('Captured: screenshot-features-1280x800.png');
    }
  }

  // Comparison section
  const compareEl = await page.$('#compare');
  if (compareEl) {
    const box = await compareEl.boundingBox();
    if (box) {
      await page.screenshot({
        path: resolve(__dirname, 'screenshot-compare-1280x800.png'),
        clip: { x: 0, y: box.y, width: 1280, height: 800 },
      });
      console.log('Captured: screenshot-compare-1280x800.png');
    }
  }

  // Enterprise section
  const enterpriseEl = await page.$('#enterprise');
  if (enterpriseEl) {
    const box = await enterpriseEl.boundingBox();
    if (box) {
      await page.screenshot({
        path: resolve(__dirname, 'screenshot-enterprise-1280x800.png'),
        clip: { x: 0, y: box.y, width: 1280, height: 800 },
      });
      console.log('Captured: screenshot-enterprise-1280x800.png');
    }
  }

  // Full page at full height
  await page.screenshot({
    path: resolve(__dirname, 'screenshot-full.png'),
    fullPage: true,
  });
  console.log('Captured: screenshot-full.png');

  await browser.close();
  console.log('Done.');
}

capture().catch(console.error);
