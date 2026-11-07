/**
 * Legacy post-deploy step retained for backward-compatible Workers Builds commands.
 * Secrets are now uploaded ATOMICALLY by npm run deploy (deploy-with-secrets.mjs).
 */
const value=process.env.ADMIN_PASSWORD;
if(!value || value.length<14){
  throw new Error('ADMIN_PASSWORD non configurata nei segreti di build di Cloudflare (almeno 14 caratteri)');
}
console.log('Secret admin e VAPID già installati con npm run deploy. Nessuna seconda pubblicazione necessaria.');
