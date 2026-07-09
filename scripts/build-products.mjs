#!/usr/bin/env node
/*
 * Regenerates the product grid in index.html, one detail page per
 * product (product/<id>.html), and the service worker cache list —
 * all from products.json. Run after adding/editing/removing a product,
 * dropping in new photos, or editing specs/gallery.
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
const PRODUCT_DIR = path.join(ROOT, 'product');
const IMG_TARGET_WIDTH = 1200;
const SITE_URL = 'https://blanccreativospma.github.io/closecommunity';
// GitHub Pages project sites are served under a subpath (/closecommunity/), not domain root.
// Any path that gets persisted (e.g. into localStorage) and re-rendered from a *different*
// page must be absolute-from-origin and include this prefix, since a plain "/..." path would
// resolve to the domain root and 404.
const SITE_PATH = new URL(SITE_URL).pathname.replace(/\/$/, ''); // "/closecommunity"

fs.mkdirSync(PRODUCT_DIR, { recursive: true });

const { sourceDir, products } = JSON.parse(fs.readFileSync(PRODUCTS_JSON, 'utf8'));
const srcAbs = path.join(ROOT, sourceDir);
const urlSourceDir = sourceDir.split('/').map(encodeURIComponent).join('/'); // "CAPSULA 01" -> "CAPSULA%2001"

function needsRebuild(srcFile, outFiles) {
  if (!fs.existsSync(srcFile)) throw new Error(`Missing source image: ${srcFile}`);
  const srcMtime = fs.statSync(srcFile).mtimeMs;
  return outFiles.some(f => !fs.existsSync(f) || fs.statSync(f).mtimeMs < srcMtime);
}

function basenameNoExt(filename) {
  return path.basename(filename).replace(/\.[^.]+$/, '');
}

/** Optimizes one image belonging to product `p`. `relFile` is relative to the product's folder
 *  (may include a subfolder, e.g. "PHOTOS/SHOT.png"). Returns the URL base (no extension). */
async function optimize(p, relFile) {
  const productFolderAbs = path.join(srcAbs, p.folder);
  const srcFile = path.join(productFolderAbs, relFile);
  const webAbs = path.join(productFolderAbs, 'web');
  fs.mkdirSync(webAbs, { recursive: true });

  const base = basenameNoExt(relFile);
  const webpOut = path.join(webAbs, `${base}.webp`);
  const pngOut = path.join(webAbs, `${base}.png`);
  if (needsRebuild(srcFile, [webpOut, pngOut])) {
    const img = sharp(srcFile).resize({ width: IMG_TARGET_WIDTH, withoutEnlargement: true });
    await img.clone().webp({ quality: 82 }).toFile(webpOut);
    await img.clone().png({ quality: 82, compressionLevel: 9, palette: true }).toFile(pngOut);
    console.log(`  optimized ${p.folder}/${relFile} -> ${p.folder}/web/${base}.{webp,png}`);
  }
  const urlFolder = p.folder.split('/').map(encodeURIComponent).join('/');
  return `${urlSourceDir}/${urlFolder}/web/${base}`;
}

function sizeButtons(sizes) {
  return sizes.map(s => `          <button class="sz" onclick="selSz(this)">${s}</button>`).join('\n');
}

function pictureTag(urlBase, alt, extraAttrs = '') {
  return `<picture>
              <source srcset="${urlBase}.webp" type="image/webp"/>
              <img src="${urlBase}.png" alt="${alt}" loading="lazy" width="1200" height="1200" ${extraAttrs}/>
            </picture>`;
}

async function buildProductCard(p, index, cardUrls) {
  const delay = (index % 6) + 1;
  const restockTag = p.restock
    ? `\n        <div class="pc-tag" style="margin-top:4px">Always Available — Restock</div>`
    : '';
  const detailHref = `product/${p.id}.html`;

  if (p.imageBack) {
    const frontUrl = await optimize(p, p.image);
    const backUrl = await optimize(p, p.imageBack);
    cardUrls.push(frontUrl, backUrl);
    return `    <div class="pc rv d${delay}">
      <a href="${detailHref}" class="pc-img flip">
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
      </a>
      <div class="pc-info">
        <a href="${detailHref}" class="pc-row" style="text-decoration:none;color:inherit">
          <span class="pc-name">${p.name}</span>
          <span class="pc-price">$${p.price}</span>
        </a>
        <div class="szs">
${sizeButtons(p.sizes)}
        </div>
        <button class="add" onclick="addCart(this,'${p.name}',${p.price},'${SITE_PATH}/${frontUrl}.png')">Add to Cart</button>${restockTag}
      </div>
    </div>`;
  }

  const url = await optimize(p, p.image);
  cardUrls.push(url);
  return `    <div class="pc rv d${delay}">
      <a href="${detailHref}" class="pc-img">
        <picture>
          <source srcset="${url}.webp" type="image/webp"/>
          <img src="${url}.png" alt="${p.name}" loading="lazy" width="1200" height="1200"/>
        </picture>
      </a>
      <div class="pc-info">
        <a href="${detailHref}" class="pc-row" style="text-decoration:none;color:inherit">
          <span class="pc-name">${p.name}</span>
          <span class="pc-price">$${p.price}</span>
        </a>
        <div class="szs">
${sizeButtons(p.sizes)}
        </div>
        <button class="add" onclick="addCart(this,'${p.name}',${p.price},'${SITE_PATH}/${url}.png')">Add to Cart</button>${restockTag}
      </div>
    </div>`;
}

/* ── Shared chrome for standalone pages (product detail pages).
   Same markup as index.html's header/nav/cart/menu/collections/ticker,
   minus the lobby + join modal (those only make sense as a first-visit
   entrance on the homepage — a shared product link should show the
   product immediately, not a brand intro). Links are prefixed "../"
   since these pages live in /product/. */
function pageShell({ title, description, ogImage, canonicalPath, bodyMain, extraAssetUrls }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <meta name="description" content="${description}"/>
  <meta name="theme-color" content="#0f0f0f"/>
  <link rel="canonical" href="${SITE_URL}/${canonicalPath}"/>

  <meta property="og:type" content="product"/>
  <meta property="og:site_name" content="Close Community"/>
  <meta property="og:title" content="${title}"/>
  <meta property="og:description" content="${description}"/>
  <meta property="og:url" content="${SITE_URL}/${canonicalPath}"/>
  <meta property="og:image" content="${SITE_URL}/${ogImage}"/>

  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${title}"/>
  <meta name="twitter:description" content="${description}"/>
  <meta name="twitter:image" content="${SITE_URL}/${ogImage}"/>

  <link rel="icon" href="../favicon.ico" sizes="any"/>
  <link rel="icon" type="image/png" sizes="32x32" href="../favicon-32.png"/>
  <link rel="icon" type="image/png" sizes="192x192" href="../favicon-192.png"/>
  <link rel="apple-touch-icon" sizes="180x180" href="../favicon-180.png"/>

  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&family=Abril+Fatface&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="../styles.css"/>
</head>
<body>

<!-- CURSOR -->
<div class="c-dot"  id="cDot"></div>
<div class="c-ring" id="cRing"></div>

<!-- COLLECTIONS PANEL -->
<div class="col-ov" id="colOv"></div>
<div class="col-panel" id="colPanel">
  <div class="col-head">
    <span class="col-title">Collections</span>
    <button class="col-close" id="colClose">✕</button>
  </div>
  <div class="col-list">

    <div class="col-item">
      <a href="../index.html#catalog" class="col-item-name" onclick="closeCollections()">Capsule I</a>
      <div class="col-item-meta">Angel Down · Font Tee · Stars · Basic · CC Socks</div>
      <span class="col-item-tag live">Live Now</span>
    </div>

    <div class="col-item">
      <span class="col-item-name soon">Random Drop</span>
      <div class="col-item-meta">Objects & limited pieces — Domino Set, etc.</div>
      <span class="col-item-tag">Coming Soon</span>
    </div>

    <div class="col-item">
      <span class="col-item-name soon">Capsule II</span>
      <div class="col-item-meta">TBA</div>
      <span class="col-item-tag">Coming Soon</span>
    </div>

    <div class="col-item">
      <span class="col-item-name soon">Cargo Drop</span>
      <div class="col-item-meta">Physical only. No online backup.</div>
      <span class="col-item-tag">TBA</span>
    </div>

  </div>
</div>

<!-- TICKER -->
<div class="ticker" aria-hidden="true">
  <div class="ticker-t" id="tickerT">
    <span class="ti">U Will Want To Belong</span><span class="ts"> ✦ </span>
    <span class="ti">Close Community</span><span class="ts"> ✦ </span>
    <span class="ti">Ciudad de Panamá</span><span class="ts"> ✦ </span>
    <span class="ti">Capsule I</span><span class="ts"> ✦ </span>
    <span class="ti">No Restock</span><span class="ts"> ✦ </span>
    <span class="ti">All Sales Final</span><span class="ts"> ✦ </span>
    <span class="ti">U Will Want To Belong</span><span class="ts"> ✦ </span>
    <span class="ti">Close Community</span><span class="ts"> ✦ </span>
    <span class="ti">Ciudad de Panamá</span><span class="ts"> ✦ </span>
    <span class="ti">Capsule I</span><span class="ts"> ✦ </span>
    <span class="ti">No Restock</span><span class="ts"> ✦ </span>
    <span class="ti">All Sales Final</span><span class="ts"> ✦ </span>
  </div>
</div>

<!-- MENU OVERLAY -->
<div class="menu-overlay" id="menuOverlay">
  <nav class="menu-links">
    <a href="../index.html#catalog"  class="menu-link" onclick="closeMenu()">Shop</a>
    <a href="#"                      class="menu-link" id="collectionsLink">Collections</a>
    <a href="../random.html"         class="menu-link" onclick="closeMenu()">Random</a>
    <a href="../archive.html"        class="menu-link" onclick="closeMenu()">Archive</a>
    <a href="../index.html#contact"  class="menu-link" onclick="closeMenu()">Contact</a>
    <a href="../play.html"           class="menu-link" onclick="closeMenu()">Play</a>
  </nav>
  <div class="menu-foot">
    <span class="menu-foot-brand">Close Community</span>
    <div class="menu-foot-meta">
      Ciudad de Panamá<br>© 2026
    </div>
  </div>
</div>

<!-- NAV -->
<nav id="nav">
  <button class="n-burger" id="menuBtn" aria-label="Menu">
    <span></span><span></span><span></span>
  </button>
  <a href="../index.html" class="n-logo">Close Community</a>
  <button class="n-cart" id="cartBtn">Cart (<span id="cartN">0</span>)</button>
</nav>

<!-- CART -->
<div class="cv" id="cv"></div>
<div class="cd" id="cd">
  <div class="cd-head">
    <span class="cd-title">Cart</span>
    <button class="cd-close" id="cdClose">✕</button>
  </div>
  <div class="cd-body" id="cdBody">
    <div class="cd-empty"><span>Empty.</span></div>
  </div>
  <div class="cd-foot" id="cdFoot" style="display:none">
    <div class="cd-total">
      <span class="cd-tl">Total</span>
      <span class="cd-tv" id="cdTotal">$0.00</span>
    </div>
    <button class="cd-chk">Checkout</button>
  </div>
</div>

<div class="toast" id="toast"></div>

<main>
${bodyMain}
</main>

<footer>
  <div class="f-l">
    <span class="f-brand">Close Community</span>
    <div class="f-links">
      <a href="https://instagram.com/CLOSE.CCO" target="_blank" rel="noopener" class="f-link">Instagram</a>
    </div>
  </div>
  <div class="f-r">
    Ciudad de Panamá, Panamá<br>
    © Close Community 2026<br>
    All Sales Final
  </div>
</footer>

<script src="../site.js" defer></script>
</body>
</html>
`;
}

function specRow(label, value) {
  if (!value) return '';
  return `        <div class="pdp-spec-row">
          <span class="pdp-spec-k">${label}</span>
          <span class="pdp-spec-v">${value}</span>
        </div>\n`;
}

async function buildProductPage(p, cardImageUrls) {
  // Gallery = main cutout(s) + any extra gallery photos, in that order.
  const galleryFiles = [p.image, ...(p.imageBack ? [p.imageBack] : []), ...(p.gallery || [])];
  const galleryUrls = [];
  for (const f of galleryFiles) {
    galleryUrls.push(await optimize(p, f));
  }

  const galleryHtml = galleryUrls
    .map(u => `      <picture>
        <source srcset="../${u}.webp" type="image/webp"/>
        <img src="../${u}.png" alt="${p.name}" loading="lazy" width="1200" height="1200"/>
      </picture>`)
    .join('\n');

  const specs =
    specRow('Colors', (p.colors || []).join(', ')) +
    specRow('Materials', p.materials) +
    specRow('Sizes', p.sizes.join(', '));

  const restockTag = p.restock
    ? `\n        <div class="pc-tag" style="margin-top:4px">Always Available — Restock</div>`
    : '';

  const description = p.description
    ? `\n      <p class="pdp-desc">${p.description}</p>`
    : '';

  const cardUrl = cardImageUrls[0]; // main cutout, used as OG image + cart thumbnail

  const bodyMain = `
  <div class="pdp-back-row rv">
    <a href="../index.html#catalog" class="pdp-back">← Shop</a>
  </div>
  <div class="pdp rv">
    <div class="pdp-gallery">
${galleryHtml}
    </div>
    <div class="pdp-info">
      <div>
        <h1 class="pdp-name">${p.name}</h1>
        <p class="pdp-price">$${p.price}</p>
      </div>
      <div class="pc-info" style="padding-top:0">
        <div class="szs">
${sizeButtons(p.sizes)}
        </div>
        <button class="add" onclick="addCart(this,'${p.name}',${p.price},'${SITE_PATH}/${cardUrl}.png')">Add to Cart</button>${restockTag}
      </div>
      ${specs ? `<div class="pdp-specs">\n${specs}      </div>` : ''}${description}
    </div>
  </div>`;

  const title = `${p.name} — Close Community`;
  const description_meta = p.description || `${p.name} — $${p.price}. Close Community, Ciudad de Panamá. Limited capsule, no restock.`;

  const html = pageShell({
    title,
    description: description_meta.replace(/"/g, '&quot;'),
    ogImage: `${cardUrl}.png`,
    canonicalPath: `product/${p.id}.html`,
    bodyMain,
  });

  fs.writeFileSync(path.join(PRODUCT_DIR, `${p.id}.html`), html);
  console.log(`  wrote product/${p.id}.html (${galleryUrls.length} gallery images)`);

  return galleryUrls;
}

async function updateIndexHtml(cardUrlsOut) {
  let html = fs.readFileSync(INDEX_HTML, 'utf8');
  const startMarker = '<!-- PRODUCTS:START — generado por scripts/build-products.mjs, no editar a mano -->';
  const endMarker = '<!-- PRODUCTS:END -->';
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('PRODUCTS:START / PRODUCTS:END markers not found in index.html');
  }

  const cards = [];
  for (let i = 0; i < products.length; i++) {
    const urls = [];
    cards.push(await buildProductCard(products[i], i, urls));
    cardUrlsOut.push(urls);
  }
  const block = `${startMarker}\n\n${cards.join('\n\n')}\n\n  `;

  html = html.slice(0, startIdx) + block + html.slice(endIdx);
  fs.writeFileSync(INDEX_HTML, html);
  console.log(`Updated index.html (${products.length} products)`);
}

function updateServiceWorker(allAssetUrls, productIds) {
  // Relative to sw.js's own location (the site root) — NOT leading-slash absolute.
  // This is a GitHub Pages *project* site served under /closecommunity/, so a path
  // like '/index.html' would resolve to the domain root and 404 inside cache.addAll().
  const BASE_ASSETS = [
    './',
    'index.html',
    'styles.css',
    'site.js',
    'play.html',
    'minesweeper.html',
    'random.html',
    'archive.html',
    'favicon.ico',
    'favicon-32.png',
    'favicon-192.png',
    'logos/web/TYPO_LOGO.webp',
    'logos/web/TYPO_LOGO.png',
    'logos/web/LETTERS_LOGO_TRANSPARENT.webp',
    'logos/web/LETTERS_LOGO_TRANSPARENT.png',
  ];
  const productPageAssets = productIds.map(id => `product/${id}.html`);
  const imageAssets = allAssetUrls.flatMap(u => [`${u}.webp`, `${u}.png`]);
  const allAssets = [...BASE_ASSETS, ...productPageAssets, ...imageAssets];

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

  const cardUrlsPerProduct = [];
  await updateIndexHtml(cardUrlsPerProduct);

  const allAssetUrls = [];
  for (let i = 0; i < products.length; i++) {
    const cardUrls = cardUrlsPerProduct[i];
    allAssetUrls.push(...cardUrls);
    const galleryUrls = await buildProductPage(products[i], cardUrls);
    for (const u of galleryUrls) {
      if (!allAssetUrls.includes(u)) allAssetUrls.push(u);
    }
  }

  updateServiceWorker(allAssetUrls, products.map(p => p.id));
  console.log('Done. Review the diff, then commit + push when ready.');
}

main().catch(err => { console.error(err); process.exit(1); });
