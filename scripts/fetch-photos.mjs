/**
 * Best-effort archival of Tipiko's original logo and photos (from the restaurant's
 * current app on framework360) into public/assets/img/, so the site does not depend
 * on a third-party host. A network failure NEVER stops Workers Builds: the site
 * falls back to the original URLs (see data-fallback in index.html).
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const base = 'https://uploads3.fw360.it/uploads/env/4/16712/img/';
const files = {
  'tipiko-logo.png': 'logos/tipikolog.png',
  'sala.jpeg': 'pages/gallery/whatsapp-image-2024-05-03-at-14-58-38.jpeg',
  'pizza-contadina.jpeg': 'restaurant/menu-items/tn/bf82ba6e-318c-490f-9541-eedcb67f8ea7.jpeg'
};
const output = path.resolve('public/assets/img');
await fs.mkdir(output, { recursive: true });

const failures = [];
let present = 0, downloaded = 0;
await Promise.all(Object.entries(files).map(async ([name, remote]) => {
  const target = path.join(output, name);
  try { if ((await fs.stat(target)).size > 1000) { present++; return; } } catch {}
  try {
    const response = await fetch(base + remote, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TipikoSite/1.0)' }, signal: AbortSignal.timeout(8000), redirect: 'follow' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const type = response.headers.get('content-type') || '';
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1000 || bytes.length > 15_000_000 || !type.startsWith('image/')) throw new Error('Formato immagine non valido');
    await fs.writeFile(target, bytes);
    downloaded++;
    console.log('Immagine archiviata:', name, '(' + bytes.length + ' bytes)');
  } catch (error) {
    failures.push(name);
    console.warn('Immagine non disponibile ora:', name, '-', error.message);
  }
}));
console.log('Immagini locali:', present, '| nuove:', downloaded, '| da recuperare:', failures.length);
if (failures.length) {
  console.warn('Il sito userà temporaneamente le immagini originali. Per renderle permanenti copia i file in public/assets/img/ e committali.');
  if (process.env.PHOTOS_REQUIRED === 'true') throw new Error('Immagini mancanti: ' + failures.join(', '));
}
