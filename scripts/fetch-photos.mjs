/**
 * Best-effort archival of photographs from the client's current website.
 * Keep real photos in public/assets/img/ (and commit them!) before changing DNS.
 * A temporary network failure must NEVER stop Workers Builds.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const names = [
  'locale.jpeg','antipasto.jpeg','locale2.jpeg','buffet.jpeg','locale3.jpeg',
  'raviolini.jpeg','sfondo.jpeg','scaliota.jpeg','tagliere.jpeg','logo verde.png'
];
const source = (process.env.PHOTO_SOURCE_ORIGIN || 'https://terrazzadabomber.it').replace(/\/$/, '');
const output = path.resolve('public/assets/img');
await fs.mkdir(output, { recursive: true });

const failures = [];
let present = 0;
let downloaded = 0;
await Promise.all(names.map(async (name) => {
  const target = path.join(output, name);
  try {
    if ((await fs.stat(target)).size > 1000) { present++; return; }
  } catch {}
  const url = source + '/assets/img/' + encodeURIComponent(name);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TerrazzaDaBomberMigration/1.0)' },
      signal: AbortSignal.timeout(7000),
      redirect: 'follow'
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const type = response.headers.get('content-type') || '';
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1000 || bytes.length > 15_000_000 || !type.startsWith('image/')) {
      throw new Error('Formato immagine non valido');
    }
    await fs.writeFile(target, bytes);
    downloaded++;
    console.log('Foto archiviata:', name, '(' + bytes.length + ' bytes)');
  } catch (error) {
    failures.push(name);
    console.warn('Foto temporaneamente non disponibile:', name, '-', error.message);
  }
}));
console.log('Foto locali:', present, '| nuove:', downloaded, '| da recuperare:', failures.length);
if (failures.length) {
  console.warn('ATTENZIONE: alcune foto non sono incorporate nel deploy. Il sito usa temporaneamente le immagini del sito originale. Prima di cambiare DNS, copia le foto in public/assets/img/ e committale su GitHub.');
  if (process.env.PHOTOS_REQUIRED === 'true') {
    throw new Error('Foto mancanti: ' + failures.join(', '));
  }
}
