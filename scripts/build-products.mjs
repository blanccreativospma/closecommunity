#!/usr/bin/env node
/*
 * Regenerates the product grid in index.html and the service worker
 * cache list from products.json. Run after adding/editing/removing a
 * product or dropping in new photos.
 *
 *   npm run build
 *
 * Nothing here touches git — review the diff and commit/push yourself.
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PRODUCTS_JSON = path.join(ROOT, 'products.json');
const INDEX_HTML = path.join(ROOT, 'index.html');
const SW_JS = path.join(ROOT, 'sw.js');
const IMG_TARGET_WIDTH = 1200;

const { sourceDir, products } = JSON.parse(fs.readFileSync(PRODUCTS_JSON, 'utf8'));
const srcAbs = path.join(ROOT, sourceDir);
const webAbs = path.join(srcAbs, 'web');
fs.mkdirSync(webAbs, { recursive: true });

const urlDir = sourceDir.split('/').map(encodeURIComponent).join('/'); // "CAPSULA 01" -> "CAPSULA%2001"

function needsRebuild(srcFile, outFiles) {
  if (!fs.existsSync(srcFile)) throw new Error(`Missing source image: ${srcFile}`);
  const srcMtime = fs.statSync(srcFile).mtimeMs;
  return outFiles.some(f => !fs.existsSync(f) || fs.statSync(f).mtimeMs < srcMtime);
}

async function optimize(basenameNoExt, srcFilename) {
  const srcFile = path.join(srcAbs, srcFilename);
  const webpOut = path.join(webAbs, `${basenameNoExt}.webp`);
  const pngOut = path.join(webAbs, `${basenameNoExt}.png`);
  if (needsRebuild(srcFile, [webpOut, pngOut])) {
    const img = sharp(srcFile).resize({ width: IMG_TARGET_WIDTH, withoutEnlargement: true });
    await img.clone().webp({ quality: 82 }).toFile(webpOut);
    await img.clone().png({ quality: 82, compressionLevel: 9, palette: true }).toFile(pngOut);
    console.log(`  optimized ${srcFilename} -> web/${basenameNoExt}.{webp,png}`);
  }
  return `${urlDir}/web/${basenameNoExt}`;
}

function basenameNoExt(filename) {
  return path.basename(filename).replace(/\.[^.]+$/, '');
}

function sizeButtons(sizes) {
  return sizes.map(s => `          <button class="sz" onclick="selSz(this)">${s}</button>`).join('\n');
}

async function buildProductCard(p, index) {
  const delay = (index % 6) + 1;
  const restockTag = p.restock
    ? `\n        <div class="pc-tag" style="margin-top:4px">Always Available — Restock</div>`
    : '';

  if (p.imageBack) {
    const frontBase = basenameNoExt(p.image);
    const backBase = basenameNoExt(p.imageBack);
    const frontUrl = await optimize(frontBase, p.image);
    const backUrl = await optimize(backBase, p.imageBack);
    return `    <div class="pc rv d${delay}">
      <div class="pc-img flip">
        <div class="flip-inner">
          <div class="flip-front">
            <picture>
              <source srcset="${frontUrl}.webp" type="image/webp"/>
              <img src="${frontUrl}.png" alt="${p.name} — Front" loading="lazy" width="1200" height="1200"/>
            </picture>
          </div>
          <div class="flip-back">
            <picture>
              <source srcset="${backUrl}.webp" type="image/webp"/>
              <img src="${backUrl}.png" alt="${p.name} — Back" loading="lazy" width="1200" height="1200"/>
            </picture>
          </div>
        </div>
        <span class="flip-hint">hover to flip</span>
      </div>
      <div class="pc-info">
        <div class="pc-row">
          <span class="pc-name">${p.name}</span>
          <span class="pc-price">$${p.price}</span>
        </div>
        <div class="szs">
${sizeButtons(p.sizes)}
        </div>
        <button class="add" onclick="addCart(this,'${p.name}',${p.price},'${frontUrl}.png')">Add to Cart</button>${restockTag}
      </div>
    </div>`;
  }

  const base = basenameNoExt(p.image);
  const url = await optimize(base, p.image);
  return `    <div class="pc rv d${delay}">
      <div class="pc-img">
        <picture>
          <source srcset="${url}.webp" type="image/webp"/>
          <img src="${url}.png" alt="${p.name}" loading="lazy" width="1200" height="1200"/>
        </picture>
      </div>
      <div class="pc-info">
        <div class="pc-row">
          <span class="pc-name">${p.name}</span>
          <span class="pc-price">$${p.price}</span>
        </div>
        <div class="szs">
${sizeButtons(p.sizes)}
        </div>
        <button class="add" onclick="addCart(this,'${p.name}',${p.price},'${url}.png')">Add to Cart</button>${restockTag}
      </div>
    </div>`;
}

async function updateIndexHtml() {
  let html = fs.readFileSync(INDEX_HTML, 'utf8');
  const startMarker = '<!-- PRODUCTS:START — generado por scripts/build-products.mjs, no editar a mano -->';
  const endMarker = '<!-- PRODUCTS:END -->';
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('PRODUCTS:START / PRODUCTS:END markers not found in index.html');
  }

  const cards = await Promise.all(products.map((p, i) => buildProductCard(p, i)));
  const block = `${startMarker}\n\n${cards.join('\n\n')}\n\n  `;

  html = html.slice(0, startIdx) + block + html.slice(endIdx);
  fs.writeFileSync(INDEX_HTML, html);
  console.log(`Updated index.html (${products.length} products)`);
}

function updateServiceWorker(assetUrls) {
  const BASE_ASSETS = [
    '/',
    '/index.html',
    '/play.html',
    '/minesweeper.html',
    '/random.html',
    '/archive.html',
    '/favicon.ico',
    '/favicon-32.png',
    '/favicon-192.png',
    '/logos/web/TYPO_LOGO.webp',
    '/logos/web/TYPO_LOGO.png',
    '/logos/web/LETTERS_LOGO_TRANSPARENT.webp',
    '/logos/web/LETTERS_LOGO_TRANSPARENT.png',
  ];
  const productAssets = assetUrls.flatMap(u => [`/${u}.webp`, `/${u}.png`]);
  const allAssets = [...BASE_ASSETS, ...productAssets];

  const hash = crypto.createHash('sha1').update(allAssets.join('|')).digest('hex').slice(0, 8);
  const cacheName = `cc-${hash}`;

  const assetsList = allAssets.map(a => `  '${a}',`).join('\n');
  const sw = `/* Close Community — Service Worker (offline support) */
/* Auto-generated by scripts/build-products.mjs — do not hand-edit ASSETS */
const CACHE = '${cacheName}';
const ASSETS = [
${assetsList}
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      // Cache-first for same-origin assets, network-first for fonts/CDN
      if (cached && new URL(e.request.url).origin === location.origin) {
        return cached;
      }
      return fetch(e.request).then(res => {
        // Cache same-origin successful responses
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached || new Response('Offline', {status: 503}));
    })
  );
});
`;
  fs.writeFileSync(SW_JS, sw);
  console.log(`Updated sw.js (cache "${cacheName}", ${allAssets.length} assets)`);
}

async function main() {
  console.log(`Building ${products.length} products from products.json...`);
  const assetUrls = [];
  for (const p of products) {
    if (p.imageBack) {
      assetUrls.push(`${urlDir}/web/${basenameNoExt(p.image)}`);
      assetUrls.push(`${urlDir}/web/${basenameNoExt(p.imageBack)}`);
    } else {
      assetUrls.push(`${urlDir}/web/${basenameNoExt(p.image)}`);
    }
  }
  await updateIndexHtml();
  updateServiceWorker(assetUrls);
  console.log('Done. Review the diff, then commit + push when ready.');
}

main().catch(err => { console.error(err); process.exit(1); });
