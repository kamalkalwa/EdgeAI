#!/usr/bin/env node
/**
 * Render extension/icons/icon{16,32,48,128}.png from icon.svg.
 * The 128 px icon keeps 16 px of transparent padding (96 px artwork), as the
 * Chrome Web Store asks; the toolbar sizes use the whole square.
 * Usage: node generate-icons.mjs
 */
import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(resolve(__dirname, 'icon.svg'), 'utf8');
const SIZES = [[16, 0], [32, 0], [48, 0], [128, 16]]; // [size, padding]

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
for (const [size, padding] of SIZES) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}
    svg{display:block;margin:${padding}px;width:${size - 2 * padding}px;height:${size - 2 * padding}px}</style>${svg}`);
  const path = resolve(__dirname, `../extension/icons/icon${size}.png`);
  await page.screenshot({ path, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`Generated: extension/icons/icon${size}.png`);
}
await browser.close();
