/**
 * Kept for compatibility with the existing Cloudflare Workers Builds command:
 *   npm run prepare:cloudflare && npm run migrate:remote &&
 *   npm run deploy && node scripts/set-secrets.mjs
 *
 * Do not read or rotate ADMIN_PASSWORD from the build environment.
 * Production credentials are configured directly on the Worker and
 * preserved by Wrangler deploy --keep-vars.
 */
console.log('Secret Production invariati: password admin e chiavi Web Push non modificate.');
