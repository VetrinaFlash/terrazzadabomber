import { createHash, createECDH } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const password=process.env.ADMIN_PASSWORD;
if(!password||password.length<14)throw new Error('ADMIN_PASSWORD deve avere almeno 14 caratteri');
// Stable key pair across deploys. A rotation of ADMIN_PASSWORD deliberately revokes existing push subscriptions.
const order=BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
const hash=createHash('sha256').update('Terrazza-da-Bomber-VAPID-v1:'+password).digest();
const scalar=(BigInt('0x'+hash.toString('hex'))%(order-1n))+1n;
const d=Buffer.from(scalar.toString(16).padStart(64,'0'),'hex');
const ecdh=createECDH('prime256v1');ecdh.setPrivateKey(d);
const pub=ecdh.getPublicKey(undefined,'uncompressed');
const b64=b=>b.toString('base64url');
const jwk=JSON.stringify({kty:'EC',crv:'P-256',x:b64(pub.subarray(1,33)),y:b64(pub.subarray(33,65)),d:b64(d)});
for(const [name,value] of [['ADMIN_PASSWORD',password],['VAPID_PRIVATE_JWK',jwk],['VAPID_PUBLIC_KEY',b64(pub)]]){
  console.log('Configuro il secret',name);
  execFileSync('npx',['wrangler','secret','put',name,'--name','terrazzadabomber'],{input:value,stdio:['pipe','inherit','inherit'],env:process.env});
}
console.log('Password admin e notifiche push configurate.');
