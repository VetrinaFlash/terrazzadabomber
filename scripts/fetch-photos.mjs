import fs from 'node:fs/promises';
import path from 'node:path';
const names=['locale.jpeg','antipasto.jpeg','locale2.jpeg','buffet.jpeg','locale3.jpeg','raviolini.jpeg','sfondo.jpeg','scaliota.jpeg','tagliere.jpeg','logo verde.png'];
const base='https://terrazzadabomber.it/assets/img/';
const output='public/assets/img';
await fs.mkdir(output,{recursive:true});
let failures=[];
for(const name of names){
 const target=path.join(output,name);
 try {if((await fs.stat(target)).size>1000){console.log('Già presente:',name);continue;}}catch{}
 try {
  const r=await fetch(base+encodeURIComponent(name),{headers:{'User-Agent':'Mozilla/5.0 (compatible; TerrazzaDaBomberSiteMigration/1.0)'},signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new Error('HTTP '+r.status);
  const data=Buffer.from(await r.arrayBuffer());
  if(data.length<1000||!String(r.headers.get('content-type')).startsWith('image/')) throw new Error('Risposta non valida');
  await fs.writeFile(target,data); console.log('Foto copiata:',name,data.length+' bytes');
 }catch(e){ console.warn('Foto non copiata:',name,e.message); failures.push(name); }
}

if(failures.length) throw new Error(`Foto originali non archiviate: ${failures.join(", ")}. Non pubblicare senza le immagini autentiche.`);
