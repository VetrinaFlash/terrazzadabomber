/**
 * Atomic Cloudflare Workers deploy with required secret bindings.
 * Build secrets are provided by Cloudflare Workers Builds or GitHub Actions.
 * Never write secrets to the repository or print their values to logs.
 */
import { createHash, createECDH } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const password = (process.env.ADMIN_PASSWORD || '').trim();
if (!password || password.length < 14) {
  throw new Error(
    'ADMIN_PASSWORD mancante o più corta di 14 caratteri. '+
    'Aggiungi ADMIN_PASSWORD in Cloudflare Workers > Settings > Build > Build variables and secrets. '+
    'Non inserirla nei file GitHub.'
  );
}
const order = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
const hashed = createHash('sha256').update('Terrazza-da-Bomber-VAPID-v1:' + password).digest();
const scalar = (BigInt('0x' + hashed.toString('hex')) % (order - 1n)) + 1n;
const key = Buffer.from(scalar.toString(16).padStart(64,'0'),'hex');
const ecdh = createECDH('prime256v1');
ecdh.setPrivateKey(key);
const pub = ecdh.getPublicKey(undefined,'uncompressed');
const b64 = bytes => Buffer.from(bytes).toString('base64url');
const jwk = {
  kty:'EC',crv:'P-256',
  x:b64(pub.subarray(1,33)),y:b64(pub.subarray(33,65)),d:b64(key)
};
const file = '.wrangler-runtime-secrets-' + randomUUID() + '.json';
const secrets = {
  ADMIN_PASSWORD: password,
  VAPID_PRIVATE_JWK:JSON.stringify(jwk),
  VAPID_PUBLIC_KEY:b64(pub)
};
console.log('Worker: pubblicazione con ADMIN_PASSWORD e Web Push configurati nella stessa versione.');
try {
  writeFileSync(file,JSON.stringify(secrets),{mode:0o600,flag:'wx'});
  execFileSync('npx',['wrangler','deploy','--secrets-file',file],{
    stdio:'inherit',env:process.env
  });
  console.log('Worker pubblicato con i secret runtime necessari.');
} finally {
  try{unlinkSync(file)}catch{}
}
