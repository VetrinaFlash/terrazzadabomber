/**
 * Deploy the Worker while preserving existing Production variables and secrets.
 *
 * IMPORTANT: ADMIN_PASSWORD is a RUNTIME secret configured in Cloudflare's
 * Worker Settings > Variables and Secrets. Workers Builds has a distinct build
 * environment and cannot read encrypted runtime secret values.
 *
 * Do not require ADMIN_PASSWORD during a Git-based build, do not re-upload it,
 * and never regenerate VAPID keys on every deployment: doing so would revoke
 * already registered push subscriptions.
 *
 * Wrangler preserves encrypted secrets by default. --keep-vars additionally
 * preserves regular variables configured through the Cloudflare dashboard.
 */
import { execFileSync } from 'node:child_process';

console.log('Cloudflare Workers: deploy del codice mantenendo i secret runtime esistenti.');
console.log('La password admin NON deve essere presente nei segreti di build.');
execFileSync('npx', ['wrangler', 'deploy', '--keep-vars'], {
  stdio: 'inherit',
  env: process.env
});
console.log('Deploy Worker completato. Secret admin e Web Push lasciati invariati.');
